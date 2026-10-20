import { Router } from "express";
import { login, logout, me } from "../controllers/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { loginRateLimit } from "../middleware/loginRateLimit.js";

export const authRouter = Router();
authRouter.post("/login", loginRateLimit, login);

authRouter.get("/me", requireAuth, me);
authRouter.post("/logout", logout);
