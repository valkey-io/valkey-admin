# -------- Base Build Image --------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps ./apps
COPY common ./common

# Install all workspace deps
RUN npm ci

# Build frontend + server
RUN npm run build:common
RUN npm run build:frontend
RUN npm run build:server


# -------- Production Runtime --------
FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

# Copy root workspace files
COPY package.json package-lock.json ./

# Copy the server workspace package.json 
COPY apps/server/package.json ./apps/server/package.json

# Install only production deps for server workspace
RUN npm ci --omit=dev --workspace=apps/server

# Copy built common
COPY --from=builder /app/common/dist ./common/dist

# Copy built server
COPY --from=builder /app/apps/server/dist ./apps/server/dist

# Copy built frontend
COPY --from=builder /app/apps/frontend/dist ./apps/frontend/dist

# Expose backend port
EXPOSE 8080

CMD ["node", "apps/server/dist/apps/server/src/index.js"]
