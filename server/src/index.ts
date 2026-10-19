import { app } from "./app.js";
import mongoose from "mongoose";
import { config } from "./config.js";
import { connectDatabase } from "./db.js";

try {
  await connectDatabase();
  const server = app.listen(config.PORT, () => {
    console.log(`API listening on Port: ${config.PORT}`);
  });
  server.on("error", async (error) => {
    console.error("Server failed:", error.message);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
  const shutdown = () => {
    server.close(() => {
      void mongoose.disconnect();
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
} catch (error) {
  console.error(
    "Startup failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  await mongoose.disconnect();
  process.exitCode = 1;
}
