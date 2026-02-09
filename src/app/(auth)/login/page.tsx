"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Atom, Mail, Lock, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shakeError, setShakeError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password");
      setShakeError(true);
      setTimeout(() => setShakeError(false), 500);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  const handleGoogleSignIn = () => {
    signIn("google", { callbackUrl: "/dashboard" });
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Branding Panel - hidden on mobile, shown on lg+ */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-600 items-center justify-center p-12">
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 auth-grid-pattern" />
        <div className="absolute inset-0 auth-wave-pattern" />

        {/* Decorative floating circles */}
        <div className="absolute top-20 left-16 w-32 h-32 rounded-full border border-white/10 animate-auth-float" />
        <div className="absolute top-40 right-20 w-20 h-20 rounded-full bg-white/5 animate-auth-float-delayed" />
        <div className="absolute bottom-32 left-24 w-24 h-24 rounded-full bg-white/5 animate-auth-pulse-ring" />
        <div className="absolute bottom-20 right-32 w-16 h-16 rounded-full border border-white/10 animate-auth-float" />
        <div className="absolute top-1/2 left-1/3 w-40 h-40 rounded-full border border-white/5 animate-auth-pulse-ring" style={{ animationDelay: "1s" }} />

        {/* Atom-like orbiting decoration */}
        <div className="absolute top-1/4 right-1/4">
          <div className="relative w-32 h-32">
            <div className="absolute inset-0 rounded-full border border-white/10 rotate-45" />
            <div className="absolute inset-2 rounded-full border border-white/10 -rotate-12" />
            <div className="absolute inset-4 rounded-full border border-white/10 rotate-75" />
            <div className="absolute top-1/2 left-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30" />
            <div className="animate-auth-orbit">
              <div className="w-2 h-2 rounded-full bg-violet-300" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 text-center max-w-md">
          <div className="flex justify-center mb-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 shadow-lg">
              <Atom className="h-9 w-9 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">
            PhysTutor
          </h1>
          <p className="text-xl text-indigo-100 mb-3 font-medium">
            Master Physics with AI
          </p>
          <p className="text-indigo-200/80 text-sm leading-relaxed max-w-sm mx-auto">
            Your intelligent companion for understanding mechanics, electromagnetism, thermodynamics, and beyond.
          </p>

          {/* Decorative wave SVG */}
          <svg className="mt-12 mx-auto opacity-20" width="200" height="40" viewBox="0 0 200 40">
            <path
              d="M0 20 Q25 0 50 20 Q75 40 100 20 Q125 0 150 20 Q175 40 200 20"
              fill="none"
              stroke="white"
              strokeWidth="2"
            />
            <path
              d="M0 28 Q25 8 50 28 Q75 48 100 28 Q125 8 150 28 Q175 48 200 28"
              fill="none"
              stroke="white"
              strokeWidth="1"
              opacity="0.5"
            />
          </svg>
        </div>
      </div>

      {/* Mobile banner - shown only on small screens */}
      <div className="flex lg:hidden bg-gradient-to-r from-indigo-600 to-violet-600 p-6 items-center justify-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm border border-white/20">
          <Atom className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">PhysTutor</h1>
          <p className="text-indigo-100 text-xs">Master Physics with AI</p>
        </div>
      </div>

      {/* Form Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-12 bg-gradient-to-br from-neutral-50 to-slate-50">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl border border-neutral-100 p-8 sm:p-10">
            {/* Header */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">
                Welcome back
              </h2>
              <p className="text-neutral-500 mt-1.5 text-sm">
                Sign in to continue your learning journey
              </p>
            </div>

            {/* Google OAuth Button */}
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl text-sm font-medium border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 transition-all shadow-sm"
              onClick={handleGoogleSignIn}
            >
              <svg className="h-5 w-5 mr-3" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google (NTHU)
            </Button>

            {/* Divider */}
            <div className="relative my-7">
              <Separator className="bg-neutral-200" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-xs text-neutral-400 font-medium">
                or continue with email
              </span>
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className={`rounded-xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-600 flex items-center gap-2 ${shakeError ? "animate-auth-shake" : ""}`}>
                  <div className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-neutral-700">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`pl-10 h-12 rounded-xl border-neutral-200 shadow-sm focus-visible:ring-indigo-500 focus-visible:ring-2 focus-visible:border-indigo-500 text-sm ${error ? "border-red-300 focus-visible:ring-red-500 focus-visible:border-red-500" : ""}`}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-neutral-700">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`pl-10 h-12 rounded-xl border-neutral-200 shadow-sm focus-visible:ring-indigo-500 focus-visible:ring-2 focus-visible:border-indigo-500 text-sm ${error ? "border-red-300 focus-visible:ring-red-500 focus-visible:border-red-500" : ""}`}
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-md shadow-indigo-600/20 transition-all text-sm"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Sign In
                {!loading && <ArrowRight className="h-4 w-4 ml-2" />}
              </Button>
            </form>

            {/* Sign up link */}
            <div className="mt-8 pt-6 border-t border-neutral-100 text-center">
              <p className="text-sm text-neutral-500">
                Don&apos;t have an account?{" "}
                <Link
                  href="/register"
                  className="font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  Create one
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
