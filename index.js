// Vercel entry point (serverless). Vercel looks for an Express app in index.js at the project root
// before src/, so it runs this file instead of compiling the TypeScript sources itself.
// It uses the output of `npm run build` (dist/), which vercel.json runs first.
// Local development is unchanged: `npm run dev` runs src/server.ts as a normal long-running server.
import express from "express";
import { createApp } from "./dist/app.js";
import { connectDatabase } from "./dist/db/client.js";
import { initAuth } from "./dist/lib/auth.js";

/** @type {Promise<import("express").Express> | undefined} */
let ready;

/**
 * Connects to MongoDB and sets up Better Auth once per function instance; warm requests reuse it.
 * Indexes are not created here (that would slow every cold start); `npm run seed` creates them.
 */
function getApp() {
  ready ??= (async () => {
    await connectDatabase();
    initAuth();
    return createApp();
  })().catch((error) => {
    // Let the next request try again instead of caching the failure.
    ready = undefined;
    throw error;
  });
  return ready;
}

const app = express();
app.disable("x-powered-by");

app.use((req, res, next) => {
  getApp()
    .then((api) => api(req, res, next))
    .catch(next);
});

// Only reached when start-up fails (e.g. the database is unreachable); the API has its own error handler.
app.use((error, _req, res, _next) => {
  console.error("FixMate API failed to start:", error);
  res.status(503).json({ success: false, code: "SERVICE_UNAVAILABLE", message: "The service is starting or temporarily unavailable. Please try again." });
});

export default app;
