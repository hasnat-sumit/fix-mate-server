import { Router } from "express";
import type { SortOrder, Types } from "mongoose";
import { AppError } from "../../lib/errors.js";
import { escapeRegex, isObjectIdString } from "../../lib/validators.js";
import { authUser, requireAuth, requireRole } from "../../middleware/auth.js";
import { BookingModel } from "../bookings/bookings.model.js";
import { UserModel } from "../users/users.model.js";
import { ServiceModel, type Service } from "./services.model.js";
import { createServiceBody, listServicesQuery, SERVICE_SORTS, updateServiceBody } from "./services.schemas.js";

export const servicesRouter = Router();

export type ServiceDoc = Service & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
type TechnicianRef = { _id: Types.ObjectId; name: string; area?: string | null; bio?: string | null; status?: string };

const SORT_ORDERS: Record<(typeof SERVICE_SORTS)[number], Record<string, SortOrder>> = {
  featured: { isFeatured: -1, createdAt: -1, _id: 1 },
  "price-asc": { price: 1, _id: 1 },
  "price-desc": { price: -1, _id: 1 },
  newest: { createdAt: -1, _id: -1 },
};

const notFound = () => new AppError(404, "NOT_FOUND", "Service not found");

/** Public card data. Approval and moderation fields are never exposed publicly. */
function toSummary(service: ServiceDoc, technician: TechnicianRef) {
  return {
    id: service._id.toString(),
    title: service.title,
    category: service.category,
    description: service.description,
    price: service.price,
    image: service.image,
    availability: service.availability,
    isFeatured: service.isFeatured,
    ratingAverage: service.ratingAverage,
    reviewCount: service.reviewCount,
    technician: { id: technician._id.toString(), name: technician.name },
  };
}

function toDetail(service: ServiceDoc, technician: TechnicianRef) {
  return {
    ...toSummary(service, technician),
    details: service.details,
    includes: service.includes,
    technician: {
      id: technician._id.toString(),
      name: technician.name,
      area: technician.area ?? null,
      bio: technician.bio ?? null,
    },
    updatedAt: service.updatedAt,
  };
}

/** The technician's own view, including moderation state. */
export function toOwnerView(service: ServiceDoc) {
  return {
    id: service._id.toString(),
    title: service.title,
    category: service.category,
    description: service.description,
    details: service.details,
    price: service.price,
    image: service.image,
    includes: service.includes,
    availability: service.availability,
    approvalStatus: service.approvalStatus,
    rejectionReason: service.rejectionReason ?? null,
    isActive: service.isActive,
    isFeatured: service.isFeatured,
    ratingAverage: service.ratingAverage,
    reviewCount: service.reviewCount,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
  };
}

/** Services of suspended technicians are hidden from the public catalog. */
async function suspendedTechnicianIds() {
  const users = await UserModel.find({ role: "technician", status: "suspended" }).select("_id").lean();
  return users.map((user) => user._id);
}

// GET /api/services — public catalog: approved, active services only.
servicesRouter.get("/", async (req, res) => {
  const query = listServicesQuery.parse(req.query);
  const filter = {
    approvalStatus: "approved" as const,
    isActive: true,
    technicianId: { $nin: await suspendedTechnicianIds() },
    ...(query.category ? { category: query.category } : {}),
    ...(query.featured !== undefined ? { isFeatured: query.featured } : {}),
    ...(query.q ? { title: { $regex: escapeRegex(query.q), $options: "i" } } : {}),
  };

  const total = await ServiceModel.countDocuments(filter);
  const pageCount = Math.max(1, Math.ceil(total / query.limit));
  // Out-of-range pages are clamped, so a stale link still shows the last page instead of an empty one.
  const page = Math.min(query.page, pageCount);

  const services = await ServiceModel.find(filter)
    .sort(SORT_ORDERS[query.sort])
    .skip((page - 1) * query.limit)
    .limit(query.limit)
    .populate<{ technicianId: TechnicianRef | null }>("technicianId", "name")
    .lean<(Omit<ServiceDoc, "technicianId"> & { technicianId: TechnicianRef | null })[]>();

  const items = services.flatMap(({ technicianId, ...service }) =>
    technicianId ? [toSummary({ ...service, technicianId: technicianId._id }, technicianId)] : [],
  );
  res.json({ success: true, data: { items, page, limit: query.limit, total, pageCount } });
});

// GET /api/services/mine — the signed-in technician's services in every approval state.
// Registered before /:id so "mine" is never treated as an ID.
servicesRouter.get("/mine", requireAuth, requireRole("technician"), async (req, res) => {
  const services = await ServiceModel.find({ technicianId: authUser(req).id }).sort({ createdAt: -1 }).lean<ServiceDoc[]>();
  res.json({ success: true, data: services.map(toOwnerView) });
});

// GET /api/services/:id — public details. Pending, rejected, hidden or suspended-owner services are a 404.
servicesRouter.get("/:id", async (req, res) => {
  if (!isObjectIdString(req.params.id)) throw notFound();
  const service = await ServiceModel.findOne({ _id: req.params.id, approvalStatus: "approved", isActive: true })
    .populate<{ technicianId: TechnicianRef | null }>("technicianId", "name area bio status")
    .lean<Omit<ServiceDoc, "technicianId"> & { technicianId: TechnicianRef | null }>();

  const technician = service?.technicianId;
  if (!service || !technician || technician.status !== "active") throw notFound();
  res.json({ success: true, data: toDetail({ ...service, technicianId: technician._id }, technician) });
});

// POST /api/services — technicians create services; every new service waits for admin approval.
servicesRouter.post("/", requireAuth, requireRole("technician"), async (req, res) => {
  const body = createServiceBody.parse(req.body);
  const service = await ServiceModel.create({ ...body, technicianId: authUser(req).id });
  res.status(201).json({ success: true, data: toOwnerView(service.toObject<ServiceDoc>()) });
});

// PATCH /api/services/:id — owner edits. Changing content sends the service back for approval;
// toggling `isActive` alone does not.
servicesRouter.patch("/:id", requireAuth, requireRole("technician"), async (req, res) => {
  if (!isObjectIdString(req.params.id)) throw notFound();
  const body = updateServiceBody.parse(req.body);
  // Ownership is part of the query, so another technician's service is indistinguishable from a missing one.
  const service = await ServiceModel.findOne({ _id: req.params.id, technicianId: authUser(req).id });
  if (!service) throw notFound();

  const { isActive: _isActive, ...content } = body;
  const contentChanged = Object.entries(content).some(
    ([field, value]) => JSON.stringify(service.get(field)) !== JSON.stringify(value),
  );

  service.set(body);
  if (contentChanged && service.approvalStatus !== "pending") {
    service.approvalStatus = "pending";
    service.rejectionReason = undefined;
  }
  await service.save();
  res.json({ success: true, data: toOwnerView(service.toObject<ServiceDoc>()) });
});

// DELETE /api/services/:id — deletes a service with no bookings; otherwise hides it so booking history stays intact.
servicesRouter.delete("/:id", requireAuth, requireRole("technician"), async (req, res) => {
  if (!isObjectIdString(req.params.id)) throw notFound();
  const service = await ServiceModel.findOne({ _id: req.params.id, technicianId: authUser(req).id });
  if (!service) throw notFound();

  if (await BookingModel.exists({ serviceId: service._id })) {
    service.isActive = false;
    await service.save();
    res.json({ success: true, data: { id: service.id as string, deleted: false, isActive: false } });
    return;
  }

  await service.deleteOne();
  res.json({ success: true, data: { id: service.id as string, deleted: true } });
});
