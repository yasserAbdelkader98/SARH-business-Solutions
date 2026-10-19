import bcrypt from 'bcrypt';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { connectDatabase } from './db.js';
import { User } from './models/User.js';
import { Order, orderStatuses } from './models/Order.js';

const seedConfig = z.object({
  SEED_ADMIN_EMAIL: z.email(),
  SEED_ADMIN_PASSWORD: z.string().min(8).max(72),
  SEED_AGENT_EMAIL: z.email(),
  SEED_AGENT_PASSWORD: z.string().min(8).max(72),
}).parse(process.env);

const firstNames = ['Ahmed', 'Sara', 'Omar', 'Layla', 'Youssef', 'Nour', 'Khalid', 'Mariam', 'Adam', 'Hana'];
const lastNames = ['Hassan', 'Ali', 'Ibrahim', 'Farouk', 'Saleh', 'Mansour', 'Nasser', 'Kamal', 'Samir', 'Adel'];
const products = [
  { name: 'Wireless mouse', unitPrice: 2499 },
  { name: 'USB-C cable', unitPrice: 1299 },
  { name: 'Notebook', unitPrice: 599 },
  { name: 'Desk lamp', unitPrice: 4599 },
  { name: 'Keyboard', unitPrice: 6999 },
  { name: 'Water bottle', unitPrice: 1899 },
  { name: 'Laptop stand', unitPrice: 3499 },
  { name: 'Headphones', unitPrice: 8999 },
];

function makeOrder(index: number) {
  const firstName = firstNames[index % firstNames.length];
  const lastName = lastNames[Math.floor(index / firstNames.length) % lastNames.length];
  const items = Array.from({ length: 1 + index % 5 }, (_, itemIndex) => ({
    ...products[(index + itemIndex) % products.length],
    quantity: 1 + (Math.floor(index / 7) + itemIndex) % 4,
  }));
  const createdAt = new Date(Date.UTC(2025, 9, 20) + ((index * 6311) % 31536000) * 1000);
  return {
    _id: new Types.ObjectId(`5eed00000000${index.toString(16).padStart(12, '0')}`),
    customerName: `${firstName} ${lastName}`,
    customerEmail: `${firstName}.${lastName}.${index % 10000}@example.com`.toLowerCase(),
    status: orderStatuses[Math.floor(index / 3) % orderStatuses.length],
    totalAmount: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    items,
    createdAt,
    updatedAt: createdAt,
  };
}

try {
  if (seedConfig.SEED_ADMIN_EMAIL.toLowerCase() === seedConfig.SEED_AGENT_EMAIL.toLowerCase()) {
    throw new Error('Admin and agent emails must differ.');
  }
  await connectDatabase();
  for (const user of [
    { email: seedConfig.SEED_ADMIN_EMAIL, password: seedConfig.SEED_ADMIN_PASSWORD, role: 'admin' },
    { email: seedConfig.SEED_AGENT_EMAIL, password: seedConfig.SEED_AGENT_PASSWORD, role: 'agent' },
  ]) {
    await User.updateOne({ email: user.email.toLowerCase() }, {
      $setOnInsert: { email: user.email, passwordHash: await bcrypt.hash(user.password, 12), role: user.role },
    }, { upsert: true, runValidators: true });
  }

  let inserted = 0;
  for (let offset = 0; offset < 50000; offset += 1000) {
    const orders = Array.from({ length: 1000 }, (_, i) => makeOrder(offset + i));
    const result = await Order.bulkWrite(orders.map((order) => ({
      updateOne: {
        filter: { _id: order._id },
        update: { $setOnInsert: order },
        upsert: true,
        timestamps: false,
      },
    })));
    inserted += result.upsertedCount;
    if ((offset + 1000) % 10000 === 0) console.log(`Processed ${offset + 1000} / 50000 orders`);
  }
  console.log(`Seed complete: ${inserted} inserted; ${await Order.countDocuments()} total orders.`);
} catch (error) {
  console.error('Seed failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
