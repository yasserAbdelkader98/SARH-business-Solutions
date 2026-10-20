import type { CookieOptions } from "express";
import { config } from "./config.js";

export const cookieName = "access_token";
export const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === "production",
  sameSite: "strict",
  path: "/api",
};
