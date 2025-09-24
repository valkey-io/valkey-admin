FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY src ./src
COPY config.yml /app/config.yml

RUN mkdir -p /app/data

ENV CONFIG_PATH=/app/config.yml
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "src/index.js"]
