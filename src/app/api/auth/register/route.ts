import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { name, email, password, studentId } = await req.json();

    if (!name || !email || !password || !studentId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: "Password must contain uppercase, lowercase, and a number" },
        { status: 400 }
      );
    }

    if (name.length > 200) {
      return NextResponse.json(
        { error: "Name is too long" },
        { status: 400 }
      );
    }

    const trimmedStudentId = studentId.trim();
    if (trimmedStudentId.length > 50) {
      return NextResponse.json(
        { error: "Student ID is too long" },
        { status: 400 }
      );
    }

    // Use generic error to prevent user/student ID enumeration
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Registration failed. Please check your details or contact support." },
        { status: 400 }
      );
    }

    const existingStudentId = await prisma.user.findUnique({
      where: { studentId: trimmedStudentId },
    });

    if (existingStudentId) {
      return NextResponse.json(
        { error: "Registration failed. Please check your details or contact support." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        studentId: trimmedStudentId,
      },
    });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
