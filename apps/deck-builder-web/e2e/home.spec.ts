import { expect, test } from "@playwright/test";

test("home page renders the deck builder heading", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Welcome to your Next generation Deck Builder" }),
  ).toBeVisible();
});
