import { expect, test } from "@playwright/test";

for (const role of ["admin", "agent"]) {
  test(`delete action is ${role === "admin" ? "available with confirmation" : "hidden"} for ${role}`, async ({
    page,
  }) => {
    let deleted = false;
    let attempts = 0;
    await page.route("**/api/health", (route) =>
      route.fulfill({ json: { status: "ok" } }),
    );
    await page.route("**/api/me", (route) =>
      route.fulfill({ status: 401, json: { error: "Sign in" } }),
    );
    await page.route("**/api/login", (route) =>
      route.fulfill({
        json: {
          user: { id: role, email: `${role}@example.com`, role },
        },
      }),
    );
    await page.route("**/api/orders?**", (route) =>
      route.fulfill({
        json: {
          orders: deleted
            ? []
            : [
                {
                  _id: "order123",
                  customerName: "Hana Nasser",
                  customerEmail: "hana@example.com",
                  status: "pending",
                  totalAmount: 100,
                  createdAt: "2026-01-01T00:00:00Z",
                },
              ],
          total: deleted ? 0 : 1,
          page: 1,
          pageSize: 25,
          totalPages: deleted ? 0 : 1,
        },
      }),
    );
    await page.route("**/api/orders/order123", (route) => {
      expect(route.request().method()).toBe("DELETE");
      expect(route.request().headers().authorization).toBeUndefined();
      attempts++;
      if (attempts === 1)
        return route.fulfill({
          status: 403,
          json: { error: "Permission denied" },
        });
      deleted = true;
      return route.fulfill({ status: 204, body: "" });
    });
    await page.goto("/");
    await page.getByLabel("Email", { exact: true }).fill(`${role}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill("password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("cell", { name: "Hana Nasser", exact: true }),
    ).toBeVisible();
    const button = page.getByRole("button", {
      name: "Delete order for Hana Nasser (order123)",
      exact: true,
    });
    if (role === "agent") {
      await expect(button).toHaveCount(0);
      await expect(
        page.getByRole("columnheader", { name: "Actions" }),
      ).toHaveCount(0);
      return;
    }
    page.once("dialog", (dialog) => dialog.dismiss());
    await button.click();
    expect(attempts).toBe(0);
    page.once("dialog", (dialog) => dialog.accept());
    await button.click();
    await expect(page.getByRole("alert")).toContainText("Permission denied");
    await expect(
      page.getByRole("cell", { name: "Hana Nasser", exact: true }),
    ).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await button.click();
    await expect(page.getByText(/No orders found/)).toBeVisible();
    expect(attempts).toBe(2);
  });
}
