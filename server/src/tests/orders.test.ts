import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import mongoose, { Types } from "mongoose";
import jwt from "jsonwebtoken";
import { z } from "zod";

process.env.JWT_SECRET = randomBytes(32).toString("hex");
process.env.JWT_EXPIRES_IN_SECONDS = "900";
process.env.LOGIN_RATE_LIMIT_MAX = "30";
process.env.LOGIN_RATE_LIMIT_WINDOW_MS = "60000";
const { app } = await import("../app.js");
const { config } = await import("../config.js");
const { Order, orderStatuses } = await import("../models/Order.js");
const { User } = await import("../models/User.js");

type ListResult = {
  orders: {
    _id: string;
    customerName: string;
    customerEmail: string;
    status: string;
    totalAmount: number;
    createdAt: string;
    items?: unknown;
    requestHash?: unknown;
  }[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

test("orders list against 50,000 isolated test orders", async (t) => {
  const databaseName = `orders_console_list_test_${randomBytes(8).toString("hex")}`;
  await mongoose.connect(config.MONGODB_URI, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 5000,
  });
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    await Promise.all([Order.init(), User.init()]);
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api/orders`;
    const user = await User.create({
      email: "agent@example.com",
      passwordHash: "unused-test-hash",
      role: "agent",
    });
    const token = jwt.sign({ role: "agent" }, config.JWT_SECRET, {
      subject: user.id,
      expiresIn: 900,
    });
    const headers = { Authorization: `Bearer ${token}` };
    for (let offset = 0; offset < 50000; offset += 1000) {
      await Order.insertMany(
        Array.from({ length: 1000 }, (_, i) => {
          const n = offset + i;
          return {
            _id: new Types.ObjectId(n.toString(16).padStart(24, "0")),
            customerName: n % 2 ? "Sara Hassan" : "Ahmed Ali",
            customerEmail: `customer${n}@example.com`,
            status: orderStatuses[n % 4],
            totalAmount: (n % 10) * 100,
            items: [
              { name: "Test item", quantity: 1, unitPrice: (n % 10) * 100 },
            ],
            createdAt: new Date(Date.UTC(2026, 0, 1 + (n % 10))),
          };
        }),
      );
    }
    async function get(query = ""): Promise<ListResult> {
      const response = await fetch(`${base}${query}`, { headers });
      assert.equal(response.status, 200);
      return response.json();
    }
    await t.test(
      "authentication, projection, fixed page size and total count",
      async () => {
        assert.equal((await fetch(base)).status, 401);
        const data = await get();
        assert.equal(data.orders.length, 25);
        assert.equal(data.total, 50000);
        assert.equal(data.totalPages, 2000);
        assert.equal(data.pageSize, 25);
        assert.deepEqual(Object.keys(data.orders[0]).sort(), [
          "_id",
          "createdAt",
          "customerEmail",
          "customerName",
          "status",
          "totalAmount",
        ]);
      },
    );
    await t.test("status, name-word and exact email search", async () => {
      const filtered = await get("?status=completed&search=Ahmed");
      assert.equal(filtered.total, 12500);
      assert.ok(
        filtered.orders.every(
          (order) =>
            order.status === "completed" && order.customerName === "Ahmed Ali",
        ),
      );
      const fullName = await get("?search=Ahmed+Ali");
      assert.equal(fullName.total, 25000);
      assert.ok(
        fullName.orders.every((order) => order.customerName === "Ahmed Ali"),
      );
      assert.equal((await get("?search=Ahmed+Hassan")).total, 0);
      const email = await get("?search=CUSTOMER123%40EXAMPLE.COM");
      assert.equal(email.total, 1);
      assert.equal(email.orders[0].customerEmail, "customer123@example.com");
      const empty = await get("?search=NoSuchCustomer");
      assert.equal(empty.total, 0);
      assert.deepEqual(empty.orders, []);
      assert.deepEqual((await get("?page=2001")).orders, []);
    });
    await t.test(
      "both sort fields and directions are deterministic across pages",
      async () => {
        for (const field of ["createdAt", "totalAmount"] as const) {
          for (const direction of ["asc", "desc"]) {
            const query = `?status=pending&sortBy=${field}&sortOrder=${direction}`;
            const first = await get(query);
            const second = await get(`${query}&page=2`);
            assert.deepEqual((await get(query)).orders, first.orders);
            const rows = [...first.orders, ...second.orders];
            assert.equal(new Set(rows.map((row) => row._id)).size, 50);
            for (let i = 1; i < rows.length; i++) {
              const prev = rows[i - 1];
              const next = rows[i];
              const left = prev[field];
              const right = next[field];
              assert.ok(direction === "asc" ? left <= right : left >= right);
              if (left === right)
                assert.ok(
                  direction === "asc"
                    ? prev._id < next._id
                    : prev._id > next._id,
                );
            }
          }
        }
      },
    );
    await t.test(
      "invalid, repeated, injected and excessive query parameters return 400",
      async () => {
        for (const query of [
          "page=0",
          "page=-1",
          "page=1.5",
          "page=1e2",
          "page=1000001",
          "page=1&page=2",
          "status=invalid",
          "sortBy=passwordHash",
          "sortOrder=other",
          "limit=50000",
          "status[$ne]=pending",
          `search=${"a".repeat(101)}`,
        ]) {
          assert.equal(
            (await fetch(`${base}?${query}`, { headers })).status,
            400,
            query,
          );
        }
      },
    );
    await t.test("representative query plans use indexes", async () => {
      const plans = [
        await Order.find({})
          .sort({ createdAt: -1, _id: -1 })
          .limit(25)
          .explain("executionStats"),
        await Order.find({ status: "pending" })
          .sort({ totalAmount: 1, _id: 1 })
          .limit(25)
          .explain("executionStats"),
        await Order.find({ $text: { $search: "Ahmed" } })
          .sort({ createdAt: -1, _id: -1 })
          .limit(25)
          .explain("executionStats"),
        await Order.find({ customerEmail: "customer123@example.com" })
          .limit(25)
          .explain("executionStats"),
      ];
      for (const result of plans) {
        const plan = z
          .object({
            queryPlanner: z.object({ winningPlan: z.unknown() }),
            executionStats: z.object({
              nReturned: z.number(),
              totalKeysExamined: z.number(),
              executionTimeMillis: z.number(),
            }),
          })
          .parse(result);
        const winningPlan = JSON.stringify(plan.queryPlanner.winningPlan);
        assert.ok(!winningPlan.includes('"COLLSCAN"'));
        assert.ok(winningPlan.includes("IXSCAN"));
        console.log(
          `Plan: ${plan.executionStats.nReturned} rows; ${plan.executionStats.totalKeysExamined} keys; ${plan.executionStats.executionTimeMillis}ms`,
        );
      }
    });
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
