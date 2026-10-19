import type { RequestHandler } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config.js";
import { User } from "../models/User.js";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z
    .string()
    .min(1)
    .refine((value) => Buffer.byteLength(value, "utf8") <= 72),
});

// Perform a bcrypt comparison even when the email does not exist.
const dummyHash = await bcrypt.hash("not-a-user-password", 12);
export const login: RequestHandler = async (req, res) => {
  res.set("Cache-Control", "no-store");
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Enter a valid email and a password of at most 72 UTF-8 bytes.",
    });
    return;
  }
  const user = await User.findOne({ email: parsed.data.email }).select(
    "+passwordHash",
  );
  const validPassword = await bcrypt.compare(
    parsed.data.password,
    user?.passwordHash ?? dummyHash,
  );
  if (!user || !validPassword) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }
  const token = jwt.sign({ role: user.role }, config.JWT_SECRET, {
    subject: user.id,
    algorithm: "HS256",
    expiresIn: config.JWT_EXPIRES_IN_SECONDS,
  });
  res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role },
  });
};
