import { BookingModel } from "../modules/bookings/bookings.model.js";
import { PaymentModel } from "../modules/payments/payments.model.js";
import { ServiceModel } from "../modules/services/services.model.js";
import { UserModel } from "../modules/users/users.model.js";
import { getNativeDb } from "./client.js";

/**
 * Creates every index the app relies on. Safe to run on each startup: existing indexes are left as they are.
 *
 * Better Auth's MongoDB adapter creates its own field indexes (session.token unique, session.userId,
 * account.userId, verification.identifier, users.email unique) and tolerates the equivalent `email_1`
 * index from Mongoose. Only the indexes it does not create are added here, so the two never conflict.
 */
export async function ensureIndexes() {
  await Promise.all([
    // The users collection is shared with Better Auth, whose own indexes must survive: only add, never drop.
    UserModel.createIndexes(),
    // These collections belong to the app alone, so their indexes are synced to the schemas,
    // which also drops indexes left over from earlier schema versions.
    ServiceModel.syncIndexes(),
    BookingModel.syncIndexes(),
    PaymentModel.syncIndexes(),
  ]);

  const db = getNativeDb();
  await Promise.all([
    // Expired-session cleanup and lookups by expiry.
    db.collection("session").createIndex({ expiresAt: 1 }),
    // Credential lookup on sign-in.
    db.collection("account").createIndex({ providerId: 1, accountId: 1 }),
  ]);
}
