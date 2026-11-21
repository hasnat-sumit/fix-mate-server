import { Router } from "express";
import type { SortOrder, Types } from "mongoose";
import { AppError } from "../../lib/errors.js";
import { paginate } from "../../lib/pagination.js";
import { escapeRegex, isObjectIdString } from "../../lib/validators.js";
import { authUser, verifyTechnician, verifyToken } from "../../middleware/auth.js";
import { BookingModel } from "../bookings/bookings.model.js";
import { UserModel } from "../users/users.model.js";
import { SERVICE_CATEGORIES, ServiceModel, type Service } from "./services.model.js";
import { createServiceBody, listServicesQuery, SERVICE_SORTS, updateServiceBody } from "./services.schemas.js";

export const servicesRouter = Router();

export type ServiceDoc = Service & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

const SORT_ORDERS: Record<(typeof SERVICE_SORTS)[number], Record<string, SortOrder>> = {
  newest: { createdAt: -1, _id: -1 },
  "price-asc": { basePrice: 1, _id: 1 },
  "price-desc": { basePrice: -1, _id: 1 },
};

const notFound = () => new AppError(404, "NOT_FOUND", "Service not found");

/** Services of suspended technicians are hidden from the public catalog. */
async function suspendedTechnicianEmails() {
  const users = await UserModel.find({ role: "technician", status: "suspended" }).select("email").lean();
  return users.map((user) => user.email);
}

/** Only approved, available services of active technicians are public. */
async function publicFilter() {
  return { approvalStatus: "approved" as const, isAvailable: true, technicianEmail: { $nin: await suspendedTechnicianEmails() } };
}

// GET /api/services — public catalog. Search, filters, sort and pagination all run in MongoDB.
servicesRouter.get("/", async (req, res) => {
  const query = listServicesQuery.parse(req.query);
  const search = query.search ? new RegExp(escapeRegex(query.search), "i") : undefined;
  // "Search by title or category": a term like "ac" or "laptop" also matches the category names.
  const matchingCategories = search ? SERVICE_CATEGORIES.filter((category) => search.test(category)) : [];

  const filter = {
    ...(await publicFilter()),
    ...(query.category ? { category: query.category } : {}),
    ...(query.serviceMode ? { serviceMode: query.serviceMode } : {}),
    ...(search ? { $or: [{ title: search }, { category: { $in: matchingCategories } }] } : {}),
  };

  const total = await ServiceModel.countDocuments(filter);
  // Out-of-range pages are clamped, so a stale link still shows the last page instead of an empty one.
  const { page, pageCount, skip } = paginate(total, query.page, query.limit);
  const items = await ServiceModel.find(filter).sort(SORT_ORDERS[query.sort]).skip(skip).limit(query.limit).lean<ServiceDoc[]>();

  res.json({ success: true, data: { items, page, limit: query.limit, total, pageCount } });
});

// GET /api/services/featured — the 6 latest approved, available services for the home page.
servicesRouter.get("/featured", async (_req, res) => {
  const items = await ServiceModel.find(await publicFilter()).sort({ createdAt: -1 }).limit(6).lean<ServiceDoc[]>();
  res.json({ success: true, data: items });
});

// GET /api/services/my — the signed-in technician's services in every approval state.
// Registered before /:id so "my" is never treated as an ID.
servicesRouter.get("/my", verifyToken, verifyTechnician, async (req, res) => {
  const items = await ServiceModel.find({ technicianEmail: authUser(req).email }).sort({ createdAt: -1 }).lean<ServiceDoc[]>();
  res.json({ success: true, data: items });
});

// GET /api/services/:id — public details with a technician summary. Pending, rejected,
// unavailable or suspended-owner services are a 404.
servicesRouter.get("/:id", async (req, res) => {
  if (!isObjectIdString(req.params.id)) throw notFound();
  const service = await ServiceModel.findOne({ _id: req.params.id, approvalStatus: "approved", isAvailable: true }).lean<ServiceDoc>();
  if (!service) throw notFound();

  const technician = await UserModel.findOne({ email: service.technicianEmail }).select("name image area bio status").lean();
  if (!technician || technician.status !== "active") throw notFound();

  res.json({
    success: true,
    data: {
      ...service,
      technician: { name: technician.name, image: technician.image ?? null, area: technician.area ?? null, bio: technician.bio ?? null },
    },
  });
});

// POST /api/services — technicians create services; every new service waits for admin approval.
servicesRouter.post("/", verifyToken, verifyTechnician, async (req, res) => {
  const body = createServiceBody.parse(req.body);
  const user = authUser(req);
  const service = await ServiceModel.create({
    ...body,
    technicianName: user.name,
    technicianEmail: user.email,
    approvalStatus: "pending",
    isAvailable: true,
  });
  res.status(201).json({ success: true, data: service.toObject() });
});

// PATCH /api/services/:id — owner edits. Editing any content sends the service back to "pending";
// toggling `isAvailable` alone does not.
servicesRouter.patch("/:id", verifyToken, verifyTechnician, async (req, res) => {
  if (!isObjectIdString(req.params.id)) throw notFound();
  const body = updateServiceBody.parse(req.body);
  // Ownership is part of the query, so another technician's service is indistinguishable from a missing one.
  const service = await ServiceModel.findOne({ _id: req.params.id, technicianEmail: authUser(req).email });
  if (!service) throw notFound();

  const { isAvailable: _isAvailable, ...content } = body;
  const contentChanged = Object.entries(content).some(([field, value]) => service.get(field) !== value);

  service.set(body);
  if (contentChanged) service.approvalStatus = "pending";
  await service.save();
  res.json({ success: true, data: service.toObject() });
});

// DELETE /api/services/:id — bookings keep their own copy of the service details, so history stays intact.
servicesRouter.delete("/:id", verifyToken, verifyTechnician, async (req, res) => {
  if (!isObjectIdString(req.params.id)) throw notFound();
  const service = await ServiceModel.findOne({ _id: req.params.id, technicianEmail: authUser(req).email });
  if (!service) throw notFound();

  // An open job still needs its service; the technician should finish or reject it first.
  if (await BookingModel.exists({ serviceId: service.id as string, isActive: true })) {
    throw new AppError(409, "CONFLICT", "This service has open requests. Reject or complete them before deleting it.");
  }

  await service.deleteOne();
  res.json({ success: true, data: { _id: service.id as string, deleted: true } });
});
