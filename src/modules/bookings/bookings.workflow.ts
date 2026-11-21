import type { UserRole } from "../users/users.model.js";
import type { BookingStatus } from "./bookings.model.js";

type Transition = {
  /** Statuses the booking may be in for this change. */
  from: readonly BookingStatus[];
  /** Roles allowed to make it. Customers and technicians must also be the booking's own customer or technician. */
  roles: readonly UserRole[];
  noteRequired?: boolean;
};

/**
 * The booking status pipeline:
 *   pending → accepted | rejected        (assigned technician; rejection needs a note)
 *   pending | accepted → cancelled       (the booking's customer, or an admin)
 *   accepted → in_progress → completed   (assigned technician)
 * "pending" is only ever set on creation.
 */
export const TRANSITIONS: Partial<Record<BookingStatus, Transition>> = {
  accepted: { from: ["pending"], roles: ["technician"] },
  rejected: { from: ["pending"], roles: ["technician"], noteRequired: true },
  in_progress: { from: ["accepted"], roles: ["technician"] },
  completed: { from: ["in_progress"], roles: ["technician"] },
  cancelled: { from: ["pending", "accepted"], roles: ["customer", "admin"] },
};

export type TransitionCheck =
  | { ok: true; transition: Transition }
  | { ok: false; status: 400 | 403 | 409; message: string };

/** Checks whether `role` may move a booking from `current` to `next`. Ownership is checked separately. */
export function checkTransition(current: BookingStatus, next: BookingStatus, role: UserRole, note?: string): TransitionCheck {
  const transition = TRANSITIONS[next];
  if (!transition) return { ok: false, status: 400, message: `A booking can't be set to ${next}` };
  if (!transition.roles.includes(role)) {
    return { ok: false, status: 403, message: `Your account can't mark a booking as ${next}` };
  }
  if (!transition.from.includes(current)) {
    return { ok: false, status: 409, message: `A ${current} booking can't be marked as ${next}` };
  }
  if (transition.noteRequired && !note?.trim()) {
    return { ok: false, status: 400, message: "Please add a note explaining why" };
  }
  return { ok: true, transition };
}
