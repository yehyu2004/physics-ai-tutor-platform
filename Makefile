.PHONY: install dev build start db-up db-down db-setup db-migrate db-studio db-reset prisma-generate clean

# Install all dependencies
install:
	npm install

# Run development server (ensures deps, DB, and migrations are ready)
dev: install prisma-generate db-migrate
	npm run dev

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

# Full database setup (start Docker, generate client, run migrations)
db-setup: db-up prisma-generate db-migrate

# Run Prisma migrations
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

# First-time setup: install deps, start DB, generate prisma, migrate, start dev
setup: install db-up prisma-generate db-migrate dev
