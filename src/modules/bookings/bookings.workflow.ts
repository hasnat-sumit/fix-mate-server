import type { UserRole } from "../users/users.model.js";
import type { BookingStatus } from "./bookings.model.js";

type Transition = {
  /** The only status the booking may be in for this change. */
  from: BookingStatus;
  /** The role allowed to make it. It must also be the booking's own customer or technician. */
  role: UserRole;
};

/**
 * The job status pipeline:
 *   requested → accepted | rejected   (the job's technician)
 *   requested → cancelled             (the booking's customer)
 *   accepted → in-progress            (the job's technician)
 *   in-progress → completed           (the job's technician, with finalAmount > 0)
 * "requested" is only set on creation; rejected, cancelled and completed are final.
 * Payment (completed + unpaid → paid) is handled by the Stripe flow, not here.
 */
export const TRANSITIONS: Partial<Record<BookingStatus, Transition>> = {
  accepted: { from: "requested", role: "technician" },
  rejected: { from: "requested", role: "technician" },
  cancelled: { from: "requested", role: "customer" },
  "in-progress": { from: "accepted", role: "technician" },
  completed: { from: "in-progress", role: "technician" },
};

export type TransitionCheck = { ok: true } | { ok: false; status: 400 | 403 | 409; message: string };

/** Checks whether `role` may move a booking from `current` to `next`. Ownership is checked separately. */
export function checkTransition(current: BookingStatus, next: BookingStatus, role: UserRole): TransitionCheck {
  const transition = TRANSITIONS[next];
  if (!transition) return { ok: false, status: 400, message: `A booking can't be set to ${next}` };
  if (transition.role !== role) {
    return { ok: false, status: 403, message: `Your account can't mark a booking as ${next}` };
  }
  if (transition.from !== current) {
    return { ok: false, status: 409, message: `A ${current} booking can't be marked as ${next}` };
  }
  return { ok: true };
}
