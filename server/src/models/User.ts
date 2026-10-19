import { Schema, model } from 'mongoose';

const userSchema = new Schema({
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'agent'], required: true },
});

export const User = model('User', userSchema);
