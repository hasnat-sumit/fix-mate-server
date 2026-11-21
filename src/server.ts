import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./db/client.js";
import { ensureIndexes } from "./db/indexes.js";
import { initAuth } from "./lib/auth.js";

async function start() {
  await connectDatabase();
  await ensureIndexes();
  console.log("Connected to MongoDB and ensured indexes");
  initAuth();

  const server = createApp().listen(env.PORT, () => {
    console.log(`FixMate API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  server.on("error", (error) => {
    console.error("Server failed to start:", error);
    process.exit(1);
  });

  function shutdown(signal: NodeJS.Signals) {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    // Force exit if open connections keep the server alive.
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

start().catch((error: unknown) => {
  console.error("Startup failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
