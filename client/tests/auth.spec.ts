import { expect, test } from "@playwright/test";

test("HttpOnly cookie restores session on reload and logout clears it", async ({
  page,
  context,
}) => {
  const user = { id: "agent", email: "agent@example.com", role: "agent" };
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { status: "ok" } }),
  );
  await page.route("**/api/me", async (route) => {
    const cookie = (await route.request().allHeaders()).cookie ?? "";
    await route.fulfill(
      cookie.includes("access_token=browser-test")
        ? { json: { user } }
        : { status: 401, json: { error: "Sign in" } },
    );
  });
  await page.route("**/api/login", (route) =>
    route.fulfill({
      headers: {
        "Set-Cookie":
          "access_token=browser-test; HttpOnly; SameSite=Strict; Path=/api; Max-Age=900",
      },
      json: { user },
    }),
  );
  await page.route("**/api/orders?**", async (route) => {
    expect((await route.request().allHeaders()).cookie).toContain(
      "access_token=browser-test",
    );
    expect(route.request().headers().authorization).toBeUndefined();
    await route.fulfill({
      json: { orders: [], total: 0, page: 1, pageSize: 25, totalPages: 0 },
    });
  });
  await page.route("**/api/logout", (route) =>
    route.fulfill({
      status: 204,
      headers: {
        "Set-Cookie":
          "access_token=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0",
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/Signed in as/)).toBeVisible();
  const cookie = (await context.cookies()).find(
    (cookie) => cookie.name === "access_token",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  expect(
    await page.evaluate(() =>
      JSON.stringify({
        cookies: document.cookie,
        local: { ...localStorage },
        session: { ...sessionStorage },
      }),
    ),
  ).not.toContain("browser-test");
  await page.reload();
  await expect(page.getByText(/Signed in as/)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(
    (await context.cookies()).find((cookie) => cookie.name === "access_token"),
  ).toBeUndefined();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
