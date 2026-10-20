import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

process.env.APP_ORIGIN = "http://localhost:3000";
process.env.JWT_SECRET = randomBytes(32).toString("hex");
process.env.JWT_EXPIRES_IN_SECONDS = "900";
process.env.LOGIN_RATE_LIMIT_MAX = "30";
process.env.LOGIN_RATE_LIMIT_WINDOW_MS = "60000";

const { app } = await import("../app.js");
const { config } = await import("../config.js");
const { User } = await import("../models/User.js");
const { Order } = await import("../models/Order.js");

test("authentication and authorization against an isolated MongoDB database", async (t) => {
  const databaseName = `orders_console_auth_test_${randomBytes(8).toString("hex")}`;
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
    const base = `http://127.0.0.1:${address.port}/api`;
    const password = "AuthTestPassword123!";
    const passwordHash = await bcrypt.hash(password, 12);
    const [admin, agent] = await User.create([
      { email: "admin@example.com", passwordHash, role: "admin" },
      { email: "agent@example.com", passwordHash, role: "agent" },
    ]);
    const order = await Order.create({
      customerName: "Auth Test",
      customerEmail: "customer@example.com",
      totalAmount: 1000,
      items: [{ name: "Test item", quantity: 1, unitPrice: 1000 }],
    });
    const login = (body: unknown) =>
      fetch(`${base}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: config.APP_ORIGIN,
        },
        body: JSON.stringify(body),
      });
    const remove = (token?: string, id = order.id) =>
      fetch(`${base}/orders/${id}`, {
        method: "DELETE",
        headers: {
          Origin: config.APP_ORIGIN,
          ...(token ? { Cookie: `access_token=${token}` } : {}),
        },
      });
    const adminResponse = await login({
      email: " ADMIN@example.com ",
      password,
    });
    assert.equal(adminResponse.status, 200);
    assert.equal(adminResponse.headers.get("cache-control"), "no-store");
    const adminBody: {
      token?: string;
      user: { role: string; passwordHash?: string };
    } = await adminResponse.json();
    const agentResponse = await login({ email: agent.email, password });
    const adminToken = adminResponse.headers
      .get("set-cookie")!
      .split(";")[0]
      .slice("access_token=".length);
    const agentToken = agentResponse.headers
      .get("set-cookie")!
      .split(";")[0]
      .slice("access_token=".length);

    await t.test(
      "login sets an HttpOnly Strict cookie without exposing the token",
      () => {
        assert.equal(agentResponse.status, 200);
        assert.equal(adminBody.user.role, "admin");
        assert.equal(adminBody.user.passwordHash, undefined);
        assert.equal(adminBody.token, undefined);
        const cookie = adminResponse.headers.get("set-cookie")!;
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /SameSite=Strict/);
        assert.match(cookie, /Path=\/api/);
        assert.match(cookie, /Max-Age=900/);
        const claims = jwt.verify(adminToken, config.JWT_SECRET, {
          algorithms: ["HS256"],
        });
        assert.ok(typeof claims !== "string");
        assert.equal(claims.sub, admin.id);
        assert.equal(claims.exp! - claims.iat!, 900);
      },
    );
    await t.test(
      "invalid credentials share a generic response; malformed input is rejected",
      async () => {
        const wrong = await login({ email: admin.email, password: "wrong" });
        const missing = await login({ email: "missing@example.com", password });
        assert.equal(wrong.status, 401);
        assert.equal(missing.status, 401);
        assert.deepEqual(await wrong.json(), await missing.json());
        assert.equal(
          (await login({ email: { $ne: null }, password })).status,
          400,
        );
        assert.equal(
          (await login({ email: admin.email, password: "é".repeat(37) }))
            .status,
          400,
        );
        assert.equal(
          (
            await fetch(`${base}/login`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Origin: config.APP_ORIGIN,
              },
              body: "{",
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "orders require a cookie and reject Bearer and query-string tokens",
      async () => {
        assert.equal((await remove()).status, 401);
        assert.equal(
          (
            await fetch(`${base}/orders/${order.id}?token=${adminToken}`, {
              method: "DELETE",
              headers: { Origin: config.APP_ORIGIN },
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await fetch(`${base}/orders`, {
              headers: { Authorization: `Bearer ${adminToken}` },
            })
          ).status,
          401,
        );
        assert.equal((await fetch(`${base}/orders`)).status, 401);
      },
    );
    await t.test(
      "rejects forged, expired, missing-expiry, invalid-payload and wrong-algorithm tokens",
      async () => {
        const payload = { sub: admin.id, role: "admin" };
        const badTokens = [
          jwt.sign(payload, "a-different-secret", { expiresIn: 900 }),
          jwt.sign(payload, config.JWT_SECRET, { expiresIn: -1 }),
          jwt.sign(payload, config.JWT_SECRET),
          jwt.sign({ ...payload, role: "owner" }, config.JWT_SECRET, {
            expiresIn: 900,
          }),
          jwt.sign({ ...payload, sub: "invalid" }, config.JWT_SECRET, {
            expiresIn: 900,
          }),
          jwt.sign(payload, config.JWT_SECRET, {
            algorithm: "HS384",
            expiresIn: 900,
          }),
          jwt.sign(payload, "", { algorithm: "none", expiresIn: 900 }),
        ];
        for (const token of badTokens)
          assert.equal((await remove(token)).status, 401);
      },
    );
    await t.test("agent gets 403 and the order remains", async () => {
      assert.equal((await remove(agentToken)).status, 403);
      assert.ok(await Order.exists({ _id: order.id }));
    });
    await t.test(
      "current database role overrides a previously issued admin role",
      async () => {
        await User.updateOne({ _id: admin.id }, { role: "agent" });
        assert.equal((await remove(adminToken)).status, 403);
        await User.updateOne({ _id: admin.id }, { role: "admin" });
      },
    );
    await t.test(
      "admin can delete; invalid and missing IDs receive 400 and 404",
      async () => {
        assert.equal((await remove(adminToken, "bad-id")).status, 400);
        assert.equal((await remove(adminToken)).status, 204);
        assert.equal(await Order.exists({ _id: order.id }), null);
        assert.equal((await remove(adminToken)).status, 404);
      },
    );
    await t.test("deleted users cannot use an existing token", async () => {
      await User.deleteOne({ _id: agent.id });
      assert.equal((await remove(agentToken)).status, 401);
    });
    await t.test("session recovery and logout cookie clearing", async () => {
      const response = await fetch(`${base}/me`, {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        user: { id: admin.id, email: admin.email, role: "admin" },
      });
      const logout = await fetch(`${base}/logout`, {
        method: "POST",
        headers: { Origin: config.APP_ORIGIN },
      });
      assert.equal(logout.status, 204);
      assert.match(logout.headers.get("set-cookie")!, /access_token=;/);
      assert.match(
        logout.headers.get("set-cookie")!,
        /Expires=Thu, 01 Jan 1970/,
      );
    });
    await t.test("mutations reject missing and untrusted origins", async () => {
      for (const origin of [
        undefined,
        "null",
        "https://evil.example",
        "http://localhost:9999",
      ]) {
        for (const path of ["login", "logout", "orders"]) {
          const response = await fetch(`${base}/${path}`, {
            method: "POST",
            headers: {
              Cookie: `access_token=${adminToken}`,
              ...(origin ? { Origin: origin } : {}),
            },
          });
          assert.equal(response.status, 403);
        }
      }
    });
    await t.test("login rate limit returns 429 and Retry-After", async () => {
      let response = await login({});
      for (let i = 0; i < 30 && response.status !== 429; i++)
        response = await login({});
      assert.equal(response.status, 429);
      assert.ok(response.headers.get("retry-after"));
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
