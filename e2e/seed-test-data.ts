/**
 * Seed script for Playwright E2E tests.
 * Creates test users (student + TA), an assignment, a submission with graded answers,
 * and an appeal — so that the LaTeX rendering and image attachment features can be tested.
 *
 * Run with: npx tsx e2e/seed-test-data.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TEST_STUDENT_EMAIL = "test-student@e2e.local";
const TEST_TA_EMAIL = "test-ta@e2e.local";
const TEST_PASSWORD = "TestPassword123!";

async function main() {
  console.log("🌱 Seeding E2E test data...");

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  // Upsert student
  const student = await prisma.user.upsert({
    where: { email: TEST_STUDENT_EMAIL },
    update: { passwordHash, name: "E2E Student", role: "STUDENT", isBanned: false, isDeleted: false },
    create: {
      email: TEST_STUDENT_EMAIL,
      name: "E2E Student",
      passwordHash,
      role: "STUDENT",
    },
  });

  // Upsert TA
  const ta = await prisma.user.upsert({
    where: { email: TEST_TA_EMAIL },
    update: { passwordHash, name: "E2E TA", role: "TA", isBanned: false, isDeleted: false },
    create: {
      email: TEST_TA_EMAIL,
      name: "E2E TA",
      passwordHash,
      role: "TA",
    },
  });

  // Clean up old test data
  await prisma.assignment.deleteMany({
    where: { createdById: ta.id, title: "E2E LaTeX & Images Test" },
  });

  // Create assignment with a free-response question
  const assignment = await prisma.assignment.create({
    data: {
      title: "E2E LaTeX & Images Test",
      description: "Assignment for Playwright E2E tests",
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      type: "QUIZ",
      totalPoints: 10,
      published: true,
      createdById: ta.id,
      questions: {
        create: [
          {
            questionText: "What is the kinetic energy formula? Derive $E_k = \\frac{1}{2}mv^2$ from Newton's second law.",
            questionType: "FREE_RESPONSE",
            correctAnswer: "$E_k = \\frac{1}{2}mv^2$",
            points: 10,
            order: 0,
          },
        ],
      },
    },
    include: { questions: true },
  });

  const question = assignment.questions[0];

  // Create submission with a graded answer containing LaTeX feedback
  const submission = await prisma.submission.create({
    data: {
      assignmentId: assignment.id,
      userId: student.id,
      totalScore: 7,
      gradedAt: new Date(),
      gradedById: ta.id,
      answers: {
        create: [
          {
            questionId: question.id,
            answer: "KE = 1/2 mv^2, from F=ma and W=Fd",
            score: 7,
            feedback:
              "Good start! You correctly identified $E_k = \\frac{1}{2}mv^2$. However, the derivation needs more rigor. You should show:\n\n$$W = \\int F \\, dx = \\int ma \\, dx = m \\int v \\, dv = \\frac{1}{2}mv^2$$\n\nThe work-energy theorem connects force to kinetic energy via integration.",
          },
        ],
      },
    },
    include: { answers: true },
  });

  const answerId = submission.answers[0].id;

  // Create an appeal with LaTeX content
  await prisma.gradeAppeal.create({
    data: {
      submissionAnswerId: answerId,
      studentId: student.id,
      reason:
        "I believe my derivation was sufficient. I showed $F = ma$ and used $W = Fd$ to arrive at $\\frac{1}{2}mv^2$. The integral form $$W = \\int F\\,dx$$ is equivalent.",
      messages: {
        create: [
          {
            userId: ta.id,
            content:
              "Your approach using $W = Fd$ only works for constant force. The full derivation requires $$W = \\int_0^x F\\,dx = \\int_0^v mv\\,dv = \\frac{1}{2}mv^2$$",
          },
        ],
      },
    },
  });

  console.log("✅ Test data seeded successfully!");
  console.log(`   Student: ${TEST_STUDENT_EMAIL} / ${TEST_PASSWORD}`);
  console.log(`   TA:      ${TEST_TA_EMAIL} / ${TEST_PASSWORD}`);
  console.log(`   Assignment ID: ${assignment.id}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
