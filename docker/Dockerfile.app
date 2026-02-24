# -------- Base Build Image --------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps ./apps
COPY common ./common

# Install all workspace deps
RUN npm ci

# Build frontend + server
RUN npm run build:all

# -------- Production Runtime --------
FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

# Copy root workspace files
COPY package.json package-lock.json ./

# Copy the server workspace package.json 
COPY apps/server/package.json ./apps/server/package.json

# Copy the common workspace package.json
COPY common/package.json ./common/package.json

# Install only production deps for server workspace
RUN npm ci --omit=dev

# Copy built common
COPY --from=builder /app/common/dist ./common/dist

# Copy built server
COPY --from=builder /app/apps/server/dist ./apps/server/dist

# Copy built frontend
COPY --from=builder /app/apps/frontend/dist ./apps/frontend/dist

# Expose backend port
EXPOSE 8080

CMD ["node", "apps/server/dist/index.js"]
