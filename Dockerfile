FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
# FFmpeg + FFprobe must be on PATH for transcoding logic
RUN apk add --no-cache ffmpeg
ENV NODE_ENV=production
ENV PORT=8081
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# Non-root user for least-privilege execution
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
# Pre-create tmp dir — mounted as emptyDir volume in k8s
RUN mkdir -p /app/tmp && chown appuser:appgroup /app/tmp && chmod 755 /app/tmp
USER appuser
EXPOSE ${PORT}
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1
CMD ["node", "dist/index.js"]