import { expect, test } from "@playwright/test";

test("latest filters win even when earlier responses finish later", async ({
  page,
}) => {
  // Simulate a transport that ignores cancellation, so query-key isolation is tested too.
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, options) =>
      originalFetch(
        input,
        typeof input === "string" && input.startsWith("/api/orders?")
          ? { ...options, signal: undefined }
          : options,
      );
  });
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { status: "ok" } }),
  );
  await page.route("**/api/login", (route) =>
    route.fulfill({
      json: {
        token: "test-token",
        user: { id: "test-agent", email: "agent@example.com", role: "agent" },
      },
    }),
  );
  const requested: string[] = [];
  const completed: string[] = [];
  await page.route("**/api/orders?**", async (route) => {
    expect(route.request().headers().authorization).toBe("Bearer test-token");
    const params = new URL(route.request().url()).searchParams;
    const status = params.get("status") || "pending";
    requested.push(status);
    const delay =
      { processing: 600, completed: 400, cancelled: 20 }[status] ?? 0;
    await new Promise((resolve) => setTimeout(resolve, delay));
    await route.fulfill({
      json: {
        orders: [
          {
            _id: status,
            customerName: `${status} customer`,
            customerEmail: "test@example.com",
            status,
            totalAmount: 1250,
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
        total: 50,
        page: Number(params.get("page")),
        pageSize: 25,
        totalPages: 2,
      },
    });
    completed.push(status);
  });
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("agent@example.com");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "pending", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  for (const status of ["processing", "completed", "cancelled"]) {
    await page
      .getByRole("combobox", { name: "Status", exact: true })
      .selectOption(status);
    await expect.poll(() => requested.includes(status)).toBe(true);
    await expect(
      page.getByRole("cell", { name: "pending", exact: true }),
    ).toHaveCount(0);
  }
  await expect(
    page.getByRole("cell", { name: "cancelled", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await expect
    .poll(
      () => completed.includes("processing") && completed.includes("completed"),
    )
    .toBe(true);
  await expect(
    page.getByRole("cell", { name: "cancelled", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "processing", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "completed", exact: true }),
  ).toHaveCount(0);

  const searchRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/orders?"))
      searchRequests.push(
        new URL(request.url()).searchParams.get("search") ?? "",
      );
  });
  await page.getByLabel("Search customers").fill("Ahmed");
  await page.getByLabel("Search customers").fill("Sara");
  await expect.poll(() => searchRequests.includes("Sara")).toBe(true);
  expect(searchRequests).not.toContain("Ahmed");
});

test("empty and failed responses have clear states and retry", async ({
  page,
}) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { status: "ok" } }),
  );
  await page.route("**/api/login", (route) =>
    route.fulfill({
      json: {
        token: "test-token",
        user: { id: "agent", email: "agent@example.com", role: "agent" },
      },
    }),
  );
  let fail = true;
  await page.route("**/api/orders?**", (route) =>
    fail
      ? route.fulfill({ status: 500, json: { error: "Orders unavailable" } })
      : route.fulfill({
          json: { orders: [], total: 0, page: 1, pageSize: 25, totalPages: 0 },
        }),
  );
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("agent@example.com");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Orders unavailable");
  fail = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText(/No orders found/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
});
