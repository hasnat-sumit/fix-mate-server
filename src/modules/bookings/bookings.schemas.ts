import { z } from "zod";
import { isObjectIdString } from "../../lib/validators.js";
import { BOOKING_STATUSES } from "./bookings.model.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" for a moment in UTC. */
const utcDate = (time: number) => new Date(time).toISOString().slice(0, 10);

/**
 * A calendar date (YYYY-MM-DD) that is today or later in the customer's own time zone, up to a year ahead.
 * The server can't know the visitor's zone, so "today" is taken in the earliest zone on Earth (UTC−12):
 * anyone's local today is on or after that date.
 */
const preferredDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && utcDate(Date.parse(`${value}T00:00:00Z`)) === value, "Invalid date")
  .refine((value) => value >= utcDate(Date.now() - 12 * 60 * 60 * 1000), "Choose today or a future date")
  .refine((value) => value <= utcDate(Date.now() + 365 * DAY_MS), "Choose a date within the next year")
  .transform((value) => new Date(`${value}T00:00:00Z`));

export const createBookingBody = z.strictObject({
  serviceId: z.string().refine(isObjectIdString, "Invalid service"),
  preferredDate,
  problemDescription: z.string().trim().min(20, "Describe the problem in at least 20 characters").max(1000),
  address: z.string().trim().min(5, "Enter the service address").max(200),
  contactPhone: z.string().trim().regex(/^\+?[0-9\s()-]{7,20}$/, "Enter a valid phone number"),
});

export const listBookingsQuery = z.object({
  status: z.enum(BOOKING_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const updateStatusBody = z.strictObject({
  status: z.enum(BOOKING_STATUSES),
  note: z.string().trim().max(500).optional(),
});

export const createReviewBody = z.strictObject({
  rating: z.number().int("Rating must be a whole number").min(1).max(5),
  comment: z.string().trim().max(1000).default(""),
});
