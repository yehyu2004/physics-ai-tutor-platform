.PHONY: install dev build start db-up db-down db-setup db-migrate db-studio db-reset prisma-generate clean kill-port

# Install all dependencies
install:
	npm install

# Run development server (ensures deps, DB, and Prisma client are ready)
# Kills any stale process on port 3000 first, then starts Next.js dev server.
# Ctrl+C will cleanly stop the server.
dev: install prisma-generate db-push kill-port
	@trap 'echo "\nShutting down dev server..."; kill %1 2>/dev/null; lsof -ti :3000 | xargs kill 2>/dev/null; echo "Dev server stopped."' INT TERM; \
	npm run dev & wait

# Kill any process on port 3000
kill-port:
	@lsof -ti :3000 | xargs kill -9 2>/dev/null || true

# Build for production
build:
	npm run build

# Start production server
start:
	npm run start

# Start PostgreSQL in Docker
db-up:
	docker compose up -d

# Stop PostgreSQL container
db-down:
	docker compose down

# Full database setup (start Docker, generate client, sync schema)
db-setup: db-up prisma-generate db-push

# Sync database schema with Prisma schema (no migration files needed)
db-push:
	npx prisma db push

# Run Prisma migrations (for production or when using migration workflow)
db-migrate:
	npx prisma migrate dev

# Open Prisma Studio (database GUI)
db-studio:
	npx prisma studio

# Reset database (WARNING: destroys all data)
db-reset:
	npx prisma migrate reset

# Regenerate Prisma client
prisma-generate:
	npx prisma generate

# Remove build artifacts
clean:
	rm -rf .next node_modules

# First-time setup: install deps, start DB, generate prisma, sync schema, start dev
setup: install db-up prisma-generate db-push dev
