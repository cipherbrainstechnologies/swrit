import { expect, test as setup } from "@playwright/test";
import { E2E_OWNER } from "./credentials";

setup("owner signs in", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER.email);
  await page.getByLabel("Password").fill(E2E_OWNER.password);
  await page.getByRole("button", { name: "Open the archive" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Dear Swritsinh" })).toBeVisible();
  await page.context().storageState({ path: "tests/.tmp/e2e/owner.json" });
});
