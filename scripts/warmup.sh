#!/bin/bash
# Warmup script: precompiles Next.js dev routes by hitting them after server starts.
# Usage: npm run dev, then in another terminal: ./scripts/warmup.sh

BASE="http://localhost:3000"
ROUTES=(
  "/"
  "/dashboard"
  "/assignments"
  "/chat"
  "/grades"
  "/grading"
  "/problems/generate"
  "/profile"
  "/settings"
  "/simulations"
  "/analytics"
  "/admin/users"
  "/admin/analytics"
  "/admin/settings"
  "/admin/email-templates"
  "/admin/scheduled-emails"
  "/login"
)

echo "⏳ Warming up ${#ROUTES[@]} routes..."

# Wait for server to be ready
for i in {1..30}; do
  if curl -s -o /dev/null -w '' "$BASE" 2>/dev/null; then
    break
  fi
  sleep 1
done

# Hit all routes (sequential to avoid overwhelming the dev server)
for route in "${ROUTES[@]}"; do
  curl -s -o /dev/null "$BASE$route" &
done
wait

echo "✅ All routes precompiled"
