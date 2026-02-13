/**
 * Seed script for default email templates.
 * Creates a set of commonly-used email templates for notifications.
 *
 * Run with: npx tsx prisma/seed-email-templates.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DEFAULT_TEMPLATES = [
  {
    name: "Assignment Published",
    subject: "New Assignment Available",
    message:
      "A new assignment has been published and is now available for you to complete.\n\nPlease log in to the platform to view the assignment details and due date.\n\nIf you have any questions, don't hesitate to reach out to the teaching staff.",
    category: "assignment",
  },
  {
    name: "Assignment Due Reminder",
    subject: "Reminder: Assignment Due Soon",
    message:
      "This is a friendly reminder that you have an upcoming assignment deadline.\n\nPlease make sure to submit your work before the due date to avoid any late penalties.\n\nIf you're experiencing any difficulties, please contact the teaching staff as soon as possible.",
    category: "reminder",
  },
  {
    name: "Assignment Graded",
    subject: "Your Assignment Has Been Graded",
    message:
      "Your recent assignment has been graded. You can now view your score and feedback on the platform.\n\nPlease review the feedback carefully, as it will help you improve on future assignments.\n\nIf you have questions about your grade, you may submit a grade appeal through the platform.",
    category: "grade",
  },
  {
    name: "Grade Appeal Response",
    subject: "Update on Your Grade Appeal",
    message:
      "Your grade appeal has been reviewed. Please log in to the platform to view the response and any updated score.\n\nIf you have further questions, feel free to reach out to the teaching staff during office hours.",
    category: "grade",
  },
  {
    name: "General Announcement",
    subject: "Important Announcement",
    message:
      "Please review this important announcement regarding the course.\n\nFor more details, log in to the platform and check the latest notifications.",
    category: "announcement",
  },
  {
    name: "Class Cancelled",
    subject: "Class Cancelled",
    message:
      "Please be advised that class has been cancelled for the scheduled time.\n\nPlease check the platform for any updated schedule or makeup class information.\n\nWe apologize for any inconvenience.",
    category: "announcement",
  },
  {
    name: "Office Hours Reminder",
    subject: "Office Hours Reminder",
    message:
      "This is a reminder that office hours are available for you to get help with assignments, review concepts, or ask questions.\n\nPlease check the course schedule for the specific times and locations.\n\nDon't hesitate to come by — we're here to help!",
    category: "reminder",
  },
  {
    name: "Exam Reminder",
    subject: "Upcoming Exam Reminder",
    message:
      "This is a reminder about your upcoming exam.\n\nPlease review all assigned materials and practice problems. Make sure to arrive on time and bring any required materials.\n\nGood luck with your preparation!",
    category: "reminder",
  },
  {
    name: "Welcome to Course",
    subject: "Welcome to the Course!",
    message:
      "Welcome! We're excited to have you in this course.\n\nPlease log in to the platform to familiarize yourself with the course materials, assignments, and resources.\n\nIf you have any questions or need help getting started, don't hesitate to reach out to the teaching staff.\n\nWe look forward to a great semester!",
    category: "general",
  },
  {
    name: "Course Feedback Request",
    subject: "We Value Your Feedback",
    message:
      "As we progress through the course, we'd love to hear your feedback on how things are going.\n\nYour input helps us improve the course experience for everyone. Please take a few minutes to share your thoughts.\n\nThank you for your time and participation!",
    category: "general",
  },
];

async function main() {
  console.log("🌱 Seeding default email templates...");

  // Get or create a system user to own the templates
  let systemUser = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });

  if (!systemUser) {
    systemUser = await prisma.user.findFirst();
  }

  if (!systemUser) {
    console.error("❌ No users found in the database. Please create at least one user first.");
    process.exit(1);
  }

  console.log(`  Using user: ${systemUser.name || systemUser.email} (${systemUser.role})`);

  let created = 0;
  let skipped = 0;

  for (const tmpl of DEFAULT_TEMPLATES) {
    // Check if a template with this name already exists
    const existing = await prisma.emailTemplate.findFirst({
      where: { name: tmpl.name },
    });

    if (existing) {
      console.log(`  ⏭️  Skipping "${tmpl.name}" (already exists)`);
      skipped++;
      continue;
    }

    await prisma.emailTemplate.create({
      data: {
        ...tmpl,
        createdById: systemUser.id,
      },
    });
    console.log(`  ✅ Created "${tmpl.name}" (${tmpl.category})`);
    created++;
  }

  console.log(`\n🎉 Done! Created ${created} templates, skipped ${skipped}.`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
