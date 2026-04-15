FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM nvidia/cuda:12.6.0-base-ubuntu24.04 AS production
# Copy Node.js 22 from official image
COPY --from=node:22-slim /usr/local /usr/local
WORKDIR /app
# FFmpeg with NVENC/NVDEC support
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=8081
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# Non-root user for least-privilege execution
RUN groupadd -r appgroup && useradd -r -g appgroup appuser
# Pre-create tmp dir — mounted as emptyDir volume in k8s
RUN mkdir -p /app/tmp && chown appuser:appgroup /app/tmp && chmod 755 /app/tmp
USER appuser
EXPOSE ${PORT}
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1
CMD ["node", "dist/index.js"]