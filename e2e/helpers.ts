import { Page, BrowserContext } from "@playwright/test";

export const TEST_STUDENT_EMAIL = "test-student@e2e.local";
export const TEST_TA_EMAIL = "test-ta@e2e.local";
export const TEST_PASSWORD = "TestPassword123!";

/**
 * Set the E2E test user cookie so that getEffectiveSession()
 * returns a fake session for this user. Requires E2E_TEST_MODE=true
 * on the dev server.
 */
export async function loginAsTestUser(context: BrowserContext, email: string) {
  await context.addCookies([
    {
      name: "e2e-test-user-email",
      value: email,
      domain: "localhost",
      path: "/",
    },
  ]);
}

/**
 * Convenience: set the test-user cookie and navigate to a page.
 */
export async function loginAndGoto(page: Page, email: string, url: string) {
  await loginAsTestUser(page.context(), email);
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}
