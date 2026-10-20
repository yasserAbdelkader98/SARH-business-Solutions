import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { z } from "zod";

process.env.APP_ORIGIN = "http://localhost:3000";
process.env.JWT_SECRET = randomBytes(32).toString("hex");
process.env.JWT_EXPIRES_IN_SECONDS = "900";
process.env.LOGIN_RATE_LIMIT_MAX = "30";
process.env.LOGIN_RATE_LIMIT_WINDOW_MS = "60000";
const { app } = await import("../app.js");
const { config } = await import("../config.js");
const { User } = await import("../models/User.js");
const { Order } = await import("../models/Order.js");
const responseSchema = z.object({
  order: z.object({
    _id: z.string(),
    totalAmount: z.number(),
    status: z.string(),
  }),
});

test("R2: concurrent create proof and validation", async (t) => {
  const databaseName = `orders_console_create_test_${randomBytes(8).toString("hex")}`;
  await mongoose.connect(config.MONGODB_URI, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 5000,
  });
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    await Promise.all([User.init(), Order.init()]);
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/api/orders`;
    const user = await User.create({
      email: "agent@example.com",
      passwordHash: "unused",
      role: "agent",
    });
    const token = jwt.sign({ role: "agent" }, config.JWT_SECRET, {
      subject: user.id,
      expiresIn: 900,
    });
    const payload = {
      customerName: "Hana Nasser",
      customerEmail: "hana@example.com",
      items: [
        { name: "Notebook", quantity: 3, unitPrice: 10 },
        { name: "Pen", quantity: 1, unitPrice: 20 },
      ],
    };
    function post(
      body: unknown,
      key: string = randomUUID(),
      accessToken = token,
    ) {
      return fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
          Cookie: `access_token=${accessToken}`,
          Origin: config.APP_ORIGIN,
        },
        body: JSON.stringify(body),
      });
    }
    const key = randomUUID();
    let originalId = "";
    await t.test(
      "two simultaneous requests return the same ID and exactly one database order",
      async () => {
        const responses = await Promise.all([
          post(payload, key),
          post(payload, key),
        ]);
        assert.deepEqual(
          responses.map((response) => response.status).sort(),
          [200, 201],
        );
        const [first, second] = await Promise.all(
          responses.map(async (response) =>
            responseSchema.parse(await response.json()),
          ),
        );
        originalId = first.order._id;
        assert.equal(first.order._id, second.order._id);
        assert.equal(first.order.totalAmount, 50);
        assert.equal(first.order.status, "pending");
        const count = await Order.countDocuments({ idempotencyKey: key });
        assert.equal(count, 1);
        const saved = await Order.findOne({ idempotencyKey: key });
        assert.match(saved!.requestHash!, /^[a-f0-9]{64}$/);
        console.log(
          JSON.stringify({
            statuses: responses.map((response) => response.status),
            firstId: first.order._id,
            secondId: second.order._id,
            idempotencyKey: key,
            databaseCount: count,
          }),
        );
      },
    );
    await t.test(
      "duplicate lookup waits for visibility, then asks for a same-key retry if unavailable",
      async () => {
        const realFindOne = Order.findOne.bind(Order);
        let lookups = 0;
        const delayed = t.mock.method(Order, "findOne", () =>
          realFindOne({ idempotencyKey: key }).transform((order) =>
            ++lookups < 3 ? null : order,
          ),
        );
        try {
          assert.equal((await post(payload, key)).status, 200);
          assert.equal(lookups, 3);
        } finally {
          delayed.mock.restore();
        }
        const unavailable = t.mock.method(Order, "findOne", () =>
          realFindOne({ idempotencyKey: key }).transform(() => null),
        );
        try {
          const response = await post(payload, key);
          assert.equal(response.status, 503);
          assert.equal(response.headers.get("retry-after"), "1");
        } finally {
          unavailable.mock.restore();
        }
        assert.equal(await Order.countDocuments({ idempotencyKey: key }), 1);
        assert.equal((await post(payload, key)).status, 200);
      },
    );
    await t.test(
      "changed payload with the same key returns 409 without changing the original",
      async () => {
        assert.equal(
          (await post({ ...payload, customerName: "Another customer" }, key))
            .status,
          409,
        );
        assert.equal(await Order.countDocuments({ idempotencyKey: key }), 1);
        assert.equal(
          (await Order.findById(originalId))!.customerName,
          payload.customerName,
        );
      },
    );
    await t.test(
      "reordered JSON properties and normalized whitespace/email replay the original",
      async () => {
        const response = await post(
          {
            items: payload.items.map((item) => ({
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              name: item.name,
            })),
            customerEmail: " HANA@EXAMPLE.COM ",
            customerName: " Hana Nasser ",
          },
          key,
        );
        assert.equal(response.status, 200);
        assert.equal(
          responseSchema.parse(await response.json()).order._id,
          originalId,
        );
      },
    );
    await t.test(
      "retry after a lost response replays; a genuinely new key creates a new order",
      async () => {
        const lostKey = randomUUID();
        await post(payload, lostKey);
        const retry = await post(payload, lostKey);
        assert.equal(retry.status, 200);
        assert.equal(
          await Order.countDocuments({ idempotencyKey: lostKey }),
          1,
        );
        const fresh = await post(payload);
        assert.equal(fresh.status, 201);
        assert.notEqual(
          responseSchema.parse(await fresh.json()).order._id,
          originalId,
        );
      },
    );
    await t.test(
      "different authenticated user cannot replay another user's key",
      async () => {
        const other = await User.create({
          email: "admin@example.com",
          passwordHash: "unused",
          role: "admin",
        });
        const otherToken = jwt.sign({ role: "admin" }, config.JWT_SECRET, {
          subject: other.id,
          expiresIn: 900,
        });
        assert.equal((await post(payload, key, otherToken)).status, 409);
      },
    );
    await t.test(
      "authentication, UUID, item bounds, integer cents and server-owned total/status are enforced",
      async () => {
        assert.equal(
          (await post(payload, randomUUID(), "invalid")).status,
          401,
        );
        assert.equal((await post(payload, "not-a-uuid")).status, 400);
        for (const body of [
          { ...payload, items: [] },
          { ...payload, items: Array(6).fill(payload.items[0]) },
          { ...payload, items: [{ ...payload.items[0], quantity: 1.5 }] },
          { ...payload, items: [{ ...payload.items[0], quantity: 0 }] },
          { ...payload, items: [{ ...payload.items[0], unitPrice: 0.1 }] },
          { ...payload, items: [{ ...payload.items[0], unitPrice: -1 }] },
          { ...payload, totalAmount: 1 },
          { ...payload, status: "completed" },
          { ...payload, customerEmail: "bad-email" },
        ])
          assert.equal((await post(body)).status, 400);
      },
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    try {
      assert.equal(mongoose.connection.name, databaseName);
      await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  }
});
