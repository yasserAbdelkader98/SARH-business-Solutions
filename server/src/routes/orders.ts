import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { deleteOrder } from "../controllers/orders.js";

export const ordersRouter = Router();
ordersRouter.use(requireAuth);
ordersRouter.delete("/:id", requireRole("admin"), deleteOrder);
