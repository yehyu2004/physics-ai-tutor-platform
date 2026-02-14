import "dotenv/config";
import { test, expect } from "@playwright/test";
import { loginAndGoto, TEST_TA_EMAIL } from "./helpers";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const CRON_SECRET = process.env.CRON_SECRET;

/** Helper: create a draft QUIZ assignment directly in the database. */
async function createDraftAssignment(title: string) {
  const ta = await prisma.user.findUniqueOrThrow({ where: { email: TEST_TA_EMAIL } });
  const assignment = await prisma.assignment.create({
    data: {
      title,
      description: "Testing scheduled publish flow",
      type: "QUIZ",
      totalPoints: 10,
      published: false,
      createdById: ta.id,
      questions: {
        create: [{ questionText: "Test Q", questionType: "FREE_RESPONSE", points: 10, order: 0 }],
      },
    },
  });
  return assignment.id;
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("Scheduled Publish Notification", () => {
  /**
   * Test 1: UI flow — verify that clicking "Notify & Schedule" on the detail
   * page sets notifyOnPublish=true on the assignment.
   */
  test("detail page Schedule dialog sets notifyOnPublish when Notify & Schedule is clicked", async ({
    page,
  }) => {
    const title = `E2E NotifyFlag ${Date.now()}`;
    const assignmentId = await createDraftAssignment(title);

    // Navigate to the assignment detail page as TA
    await loginAndGoto(page, TEST_TA_EMAIL, `/assignments/${assignmentId}`);

    // Wait for the page to fully render the assignment header
    await expect(page.getByText(title)).toBeVisible({ timeout: 10000 });

    // Find the Schedule button — it contains a CalendarClock icon + text
    const scheduleBtn = page.locator('button', { hasText: /^Schedule$/ });
    await expect(scheduleBtn).toBeVisible({ timeout: 5000 });

    // Open the schedule dialog
    await scheduleBtn.click();
    await expect(page.getByText("Publish Date & Time")).toBeVisible({ timeout: 5000 });

    // Fill in schedule datetime (1 hour from now)
    const futureDate = new Date(Date.now() + 60 * 60 * 1000);
    await page.locator('input[type="datetime-local"]').fill(futureDate.toISOString().slice(0, 16));

    // Click "Notify & Schedule"
    const notifyBtn = page.getByRole("button", { name: "Notify & Schedule" });
    await expect(notifyBtn).toBeEnabled({ timeout: 5000 });
    await notifyBtn.click();

    // Wait for success feedback
    await expect(page.getByText(/Scheduled for/)).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // Verify a ScheduledEmail was created with createNotification=true
    const scheduled = await prisma.scheduledEmail.findFirst({
      where: { assignmentId },
      orderBy: { createdAt: "desc" },
    });
    expect(scheduled).not.toBeNull();
    expect(scheduled!.createNotification).toBe(true);
    expect(scheduled!.status).toBe("PENDING");

    // Verify assignment is scheduled but not published
    const updated = await prisma.assignment.findUniqueOrThrow({ where: { id: assignmentId } });
    expect(updated.scheduledPublishAt).not.toBeNull();
    expect(updated.published).toBe(false);

    // Cleanup
    await prisma.scheduledEmail.deleteMany({ where: { assignmentId } });
    await prisma.assignment.delete({ where: { id: assignmentId } });
  });

  /**
   * Test 2: Cron flow — verify that send-scheduled-emails cron creates an
   * in-app notification and publishes the linked assignment.
   */
  test("send-scheduled-emails cron creates notification and publishes assignment", async ({
    request,
  }) => {
    test.skip(!CRON_SECRET, "CRON_SECRET not set — skipping cron test");

    const title = `E2E CronNotify ${Date.now()}`;
    const ta = await prisma.user.findUniqueOrThrow({ where: { email: TEST_TA_EMAIL } });
    const assignmentId = await createDraftAssignment(title);

    // Set scheduledPublishAt to the past
    await prisma.assignment.update({
      where: { id: assignmentId },
      data: { scheduledPublishAt: new Date(Date.now() - 60_000) },
    });

    // Create a ScheduledEmail linked to the assignment (mimics what the dialog does)
    await prisma.scheduledEmail.create({
      data: {
        subject: `New Assignment: ${title}`,
        message: "Testing scheduled publish flow",
        scheduledAt: new Date(Date.now() - 60_000),
        recipientIds: [],
        createNotification: true,
        assignmentId,
        createdById: ta.id,
      },
    });

    // Verify no in-app notification exists yet
    const before = await prisma.notification.count({ where: { title: { contains: title } } });
    expect(before).toBe(0);

    // Call the send-scheduled-emails cron
    const cronRes = await request.get("/api/cron/send-scheduled-emails", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(cronRes.ok()).toBeTruthy();

    // Verify an in-app notification was created
    const after = await prisma.notification.findMany({ where: { title: { contains: title } } });
    expect(after.length).toBe(1);
    expect(after[0].isGlobal).toBe(true);

    // Verify the assignment is now published
    const updated = await prisma.assignment.findUnique({ where: { id: assignmentId } });
    expect(updated?.published).toBe(true);
    expect(updated?.scheduledPublishAt).toBeNull();

    // Cleanup
    await prisma.notification.deleteMany({ where: { title: { contains: title } } });
    await prisma.scheduledEmail.deleteMany({ where: { assignmentId } });
    await prisma.assignment.delete({ where: { id: assignmentId } });
  });

  /**
   * Test 3: Skip notification flow — verify that clicking "Skip Notification
   * & Schedule" still sets notifyOnPublish (so cron sends notification on publish).
   */
  test("detail page Skip Notification still sets notifyOnPublish", async ({
    page,
  }) => {
    const title = `E2E SkipNotify ${Date.now()}`;
    const assignmentId = await createDraftAssignment(title);

    // Navigate to detail page as TA
    await loginAndGoto(page, TEST_TA_EMAIL, `/assignments/${assignmentId}`);

    // Wait for assignment title to render
    await expect(page.getByText(title)).toBeVisible({ timeout: 10000 });

    // Open schedule dialog
    const scheduleBtn = page.locator('button', { hasText: /^Schedule$/ });
    await expect(scheduleBtn).toBeVisible({ timeout: 5000 });
    await scheduleBtn.click();
    await expect(page.getByText("Publish Date & Time")).toBeVisible({ timeout: 5000 });

    // Fill datetime
    const futureDate = new Date(Date.now() + 60 * 60 * 1000);
    await page.locator('input[type="datetime-local"]').fill(futureDate.toISOString().slice(0, 16));

    // Click "Skip Notification & Schedule"
    const skipBtn = page.getByRole("button", { name: "Skip Notification & Schedule" });
    await expect(skipBtn).toBeEnabled({ timeout: 5000 });
    await skipBtn.click();

    // Wait for page update
    await page.waitForTimeout(2000);

    // Verify NO ScheduledEmail was created
    const scheduled = await prisma.scheduledEmail.findFirst({ where: { assignmentId } });
    expect(scheduled).toBeNull();

    // Verify assignment is scheduled with notifyOnPublish=true
    const updated = await prisma.assignment.findUniqueOrThrow({ where: { id: assignmentId } });
    expect(updated.scheduledPublishAt).not.toBeNull();
    expect(updated.published).toBe(false);
    expect(updated.notifyOnPublish).toBe(true);

    // Cleanup
    await prisma.assignment.delete({ where: { id: assignmentId } });
  });
});
