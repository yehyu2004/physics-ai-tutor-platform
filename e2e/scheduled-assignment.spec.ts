import { test, expect } from "@playwright/test";
import { loginAndGoto, TEST_TA_EMAIL } from "./helpers";

const SCHEDULED_TITLE = `E2E Scheduled ${Date.now()}`;
const DRAFT_TITLE = `E2E Draft ${Date.now()}`;

test.describe("Scheduled Assignment", () => {
  test("TA can create a scheduled assignment and see it in the list", async ({ page }) => {
    // Login as TA and go to create page
    await loginAndGoto(page, TEST_TA_EMAIL, "/assignments/create");

    // Fill in assignment details
    await page.getByPlaceholder("e.g., Homework 3").fill(SCHEDULED_TITLE);
    await page.getByPlaceholder("Assignment instructions").fill("Testing scheduled publish flow");

    // Click "Schedule Publish" to open the schedule card
    await page.getByRole("button", { name: "Schedule Publish" }).click();

    // The schedule card should now be visible
    await expect(page.getByText("Publish Date & Time")).toBeVisible();

    // Set scheduled publish time to 1 hour from now
    const scheduleDate = new Date(Date.now() + 60 * 60 * 1000);
    const scheduleDateStr = scheduleDate.toISOString().slice(0, 16);
    await page.locator('input[type="datetime-local"]').last().fill(scheduleDateStr);

    // Button should now say "Confirm Schedule"
    const confirmBtn = page.getByRole("button", { name: "Confirm Schedule" });
    await expect(confirmBtn).toBeVisible();
    await expect(confirmBtn).toBeEnabled();

    // Click Confirm Schedule
    await confirmBtn.click();

    // Should see success toast
    await expect(page.getByText("Assignment scheduled for")).toBeVisible({ timeout: 10000 });

    // Should be redirected to the assignment detail page with scheduled badge
    await expect(page.getByText("Scheduled:")).toBeVisible({ timeout: 10000 });

    // Navigate to the assignments list
    await loginAndGoto(page, TEST_TA_EMAIL, "/assignments");

    // Click the "Scheduled" filter tab
    await page.getByRole("button", { name: "Scheduled" }).click();

    // The scheduled assignment should appear in the list
    await expect(page.getByText(SCHEDULED_TITLE)).toBeVisible({ timeout: 10000 });
  });

  test("TA can create and save as draft without scheduling", async ({ page }) => {
    await loginAndGoto(page, TEST_TA_EMAIL, "/assignments/create");

    await page.getByPlaceholder("e.g., Homework 3").fill(DRAFT_TITLE);

    // Click Save as Draft
    await page.getByRole("button", { name: "Save as Draft" }).click();

    // Should redirect (reminder dialog or assignments page)
    await page.waitForURL(/\/assignments/, { timeout: 10000 });
  });
});
