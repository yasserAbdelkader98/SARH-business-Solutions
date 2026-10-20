import cookieParser from "cookie-parser";
import { requireTrustedOrigin } from "./middleware/csrf.js";
import express from "express";
import type { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import { authRouter } from "./routes/auth.js";
import { ordersRouter } from "./routes/orders.js";

export const app = express();
app.disable("x-powered-by");
app.use(cookieParser());
app.use("/api", requireTrustedOrigin);
app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "unavailable",
    database: connected ? "connected" : "disconnected",
  });
});

app.use("/api", authRouter);
app.use("/api/orders", ordersRouter);
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ error: "Invalid JSON body." });
    return;
  }
  if (
    error instanceof Error &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    res.status(413).json({ error: "Request body is too large." });
    return;
  }
  console.error(
    "Request failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  res.status(500).json({ error: "An unexpected error occurred." });
};
app.use(handleError);
