import mongoose from "mongoose";
import { env } from "../config/env.js";

// Indexes are created explicitly by db/indexes.ts at startup, never implicitly on model compile.
mongoose.set("autoIndex", false);
mongoose.set("strictQuery", true);

export async function connectDatabase() {
  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
    serverSelectionTimeoutMS: 10_000,
  });
  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

export function isDatabaseConnected() {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

/**
 * The native database handle and client behind Mongoose's single connection pool.
 * Better Auth's MongoDB adapter receives both, so the app and auth share one pool,
 * and the client lets Better Auth run multi-step writes (e.g. sign-up) in a transaction.
 */
export function getNativeDb() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database is not connected");
  return db;
}

export function getNativeClient() {
  return mongoose.connection.getClient();
}
