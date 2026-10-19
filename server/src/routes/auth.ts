import { Router } from "express";
import { login } from "../controllers/auth.js";
import { loginRateLimit } from "../middleware/loginRateLimit.js";

export const authRouter = Router();
authRouter.post("/login", loginRateLimit, login);
