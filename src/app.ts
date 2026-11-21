import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { isDatabaseConnected } from "./db/client.js";
import { getAuth } from "./lib/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { bookingsRouter } from "./modules/bookings/bookings.routes.js";
import { paymentsRouter } from "./modules/payments/payments.routes.js";
import { servicesRouter } from "./modules/services/services.routes.js";
import { uploadsRouter } from "./modules/uploads/uploads.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

/** Requires `initAuth()` to have run, which in turn requires a connected database. */
export function createApp() {
  const app = express();

  // Order matters (see the architecture plan):
  // 1. Security headers and CORS.
  // 2. Raw-body routes (Stripe webhook, phase B8) and Better Auth mount here, BEFORE the JSON parser.
  // 3. JSON parser, API routes, 404 and the error handler.
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGINS, credentials: true }));

  // Better Auth reads the raw request stream itself, so it must come before express.json().
  app.all("/api/auth/*splat", toNodeHandler(getAuth()));

  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => {
    const database = isDatabaseConnected() ? "connected" : "disconnected";
    res.status(database === "connected" ? 200 : 503).json({
      success: database === "connected",
      data: { status: database === "connected" ? "ok" : "degraded", database, uptimeSeconds: Math.round(process.uptime()) },
    });
  });

  app.use("/api/admin", adminRouter);
  app.use("/api/bookings", bookingsRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/services", servicesRouter);
  app.use("/api/uploads", uploadsRouter);
  app.use("/api/users", usersRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
