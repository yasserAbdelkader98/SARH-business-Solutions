import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.getByLabel("Email", { exact: true }).fill("agent@example.com");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Customer name", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Create order", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Create order" }),
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { status: "ok" } }),
  );
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 401, json: { error: "Sign in" } }),
  );
  await page.route("**/api/login", (route) =>
    route.fulfill({
      json: {
        user: { id: "agent", email: "agent@example.com", role: "agent" },
      },
    }),
  );
  await page.route("**/api/orders?**", (route) =>
    route.fulfill({
      json: { orders: [], total: 0, page: 1, pageSize: 25, totalPages: 0 },
    }),
  );
  await page.goto("/");
  await signIn(page);
});

test("double submit, lost response, reload and retry retain the operation key and cents payload", async ({
  page,
}) => {
  const requests: { key: string; body: string }[] = [];
  await page.route("**/api/orders", async (route) => {
    expect(route.request().headers().authorization).toBeUndefined();
    requests.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData()!,
    });
    if (requests.length === 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.abort("failed");
    } else {
      await route.fulfill({
        status: 200,
        json: { order: { _id: "original-order-id" } },
      });
    }
  });
  await page.getByLabel("Customer name", { exact: true }).fill("Hana Nasser");
  await page.getByRole("button", { name: "Close form", exact: true }).click();
  await expect(page.getByLabel("Customer name", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Create order", exact: true }).click();
  await expect(page.getByLabel("Customer name", { exact: true })).toHaveValue(
    "Hana Nasser",
  );
  await page
    .getByLabel("Customer email", { exact: true })
    .fill("hana@example.com");
  await page.getByLabel("Item name", { exact: true }).fill("Notebook");
  await page.getByLabel("Quantity", { exact: true }).fill("3");
  await expect(page.getByLabel("Unit price", { exact: true })).toHaveAttribute(
    "type",
    "number",
  );
  await expect(page.getByLabel("Unit price", { exact: true })).toHaveAttribute(
    "step",
    "0.01",
  );
  await page.getByLabel("Unit price", { exact: true }).fill("0.10");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Item name", { exact: true }).nth(1).fill("Pen");
  await page.getByLabel("Unit price", { exact: true }).nth(1).fill("0.20");
  await expect(page.locator("output")).toHaveText("0.50");
  await page.locator("form.create-order").evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(
    page.getByRole("button", { name: "Retry same order", exact: true }),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(JSON.parse(requests[0].body).items).toEqual([
    { name: "Notebook", quantity: 3, unitPrice: 10 },
    { name: "Pen", quantity: 1, unitPrice: 20 },
  ]);
  expect(JSON.parse(requests[0].body)).not.toHaveProperty("totalAmount");
  await expect(
    page.getByLabel("Customer name", { exact: true }),
  ).toBeDisabled();
  await page.reload();
  await signIn(page);
  await page
    .getByRole("button", { name: "Retry same order", exact: true })
    .click();
  await expect(
    page.getByText("Order created: original-order-id", { exact: true }),
  ).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
  expect(JSON.stringify(storage)).not.toContain("test-token");
  await page
    .getByRole("button", { name: "Start new order", exact: true })
    .click();
  await page.getByLabel("Customer name", { exact: true }).fill("New Customer");
  await page
    .getByLabel("Customer email", { exact: true })
    .fill("new@example.com");
  await page.getByLabel("Item name", { exact: true }).fill("New item");
  await page.getByLabel("Unit price", { exact: true }).fill("1.00");
  await page.getByRole("button", { name: "Create order", exact: true }).click();
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[2].key).not.toBe(requests[0].key);
});

test("Zod rejects invalid input before sending and the form allows only 1–5 items", async ({
  page,
}) => {
  let posts = 0;
  await page.route("**/api/orders", (route) => {
    posts++;
    return route.fulfill({ status: 400, json: { error: "Invalid" } });
  });
  await page.getByRole("button", { name: "Create order", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Enter a customer name");
  expect(posts).toBe(0);
  await expect(
    page.getByRole("button", { name: "Remove item 1", exact: true }),
  ).toBeDisabled();
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add item", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Item name", { exact: true })).toHaveCount(5);
});
