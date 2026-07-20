import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("displays hero and navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /scheduling for barbershops/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /get started/i })).toBeVisible();
  });

  test("navigates to login page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /sign in/i }).click();
    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("navigates to signup page", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /create your shop/i })).toBeVisible();
  });
});

test.describe("Auth pages", () => {
  test("login form has required fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("forgot password page loads", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("heading", { name: /reset password/i })).toBeVisible();
  });
});
