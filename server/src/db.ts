import mongoose from 'mongoose';
import { config } from './config.js';
import { User } from './models/User.js';
import { Order } from './models/Order.js';

export async function connectDatabase() {
  await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Order.init()]);
}
