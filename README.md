# Media Processor Service

`media-processor` is a TypeScript Node.js service that:

- Starts an HTTP server (Express)
- Connects to MongoDB
- Connects to AMQP and starts background consumers
- Uses the shared storage client for media-related operations

This repository currently includes health/docs endpoints and the initial consumer wiring for media conversion.

## Tech Stack

- Node.js + TypeScript
- Express 5
- MongoDB (Mongoose)
- AMQP via `@ido_kawaz/amqp-client`
- Storage via `@ido_kawaz/storage-client`
- Swagger UI (`/api-docs`)

## Prerequisites

- Node.js 20+
- npm 10+
- Reachable MongoDB instance
- Reachable AMQP broker
- S3-compatible storage endpoint

## Installation

```bash
npm install
```

## Environment Variables

Create a `.env` file in the project root. Variables consumed by `@ido_kawaz/*` libraries (MongoDB, AMQP, storage, server) are documented in their respective packages. Service-owned variables:

- `NODE_ENV` (optional, default `development`): Accepted values: `local`, `development`, `test`. `local` triggers automatic `tmp/` folder creation on startup.
- `VOD_BUCKET_NAME` (required): S3 bucket name for converted VOD output.

## Scripts

- `npm run dev` - Run in development mode via `ts-node-dev`
- `npm run build` - Clean and compile to `dist/`
- `npm run build:watch` - Compile in watch mode
- `npm run start` - Run compiled output (`dist/index.js`) with `.env`
- `npm run start:dev` - Build then start compiled output
- `npm run clean` - Remove `dist/`
- `npm run clean:advanced` - Remove `dist/`, `node_modules/`, and `package-lock.json`
- `npm run build:advanced` - Advanced clean, install, and build
- `npm test` - Build and run all tests (Jest)

## Running the Service

Development:

```bash
npm run dev
```

Production-style local run:

```bash
npm run build
npm run start
```

On startup, the service validates config, initializes DB, starts AMQP, registers routes, and starts listening on `PORT`.

## HTTP Endpoints

- `GET /health` -> `200 OK`
- `GET /api-docs` -> Swagger UI

## Background Consumers

### Convert Media Consumer

- Queue: `media-processor-convert`
- Exchange: `convert`
- Topic: `convert.media`

Payload schema:

```json
{
  "mediaId": "string (MongoDB ObjectId)",
  "mediaName": "string",
  "mediaStorageBucket": "string",
  "mediaRoutingKey": "string"
}
```

The handler downloads the media from storage, probes it with FFprobe to extract metadata (video/audio/subtitle streams, chapters, duration), converts to MPEG-DASH via FFmpeg (video re-encoded with h264_nvenc or h264 fallback, audio as aac; ASS/SRT/VTT subtitle tracks extracted as external WebVTT files), uploads all output files to the VOD bucket, and cleans up the temporary workspace.

## Testing

Tests use Jest with ts-jest. Test files are co-located in `__tests__/` directories next to source.

```bash
npm test
```

Test suites:

- `src/__tests__/integration.test.ts` — End-to-end integration test for the convert pipeline
- `src/background/convert/__tests__/handler.test.ts` — Handler unit tests (workspace init, logic delegation, error classification, onConvertSuccessHandler)
- `src/background/convert/__tests__/logic.test.ts` — Conversion pipeline unit tests (download, write, probe, subtitles, chapters, DASH, upload, ordering)
- `src/background/convert/__tests__/utils.test.ts` — Utility unit tests (metadata extraction, chapter/subtitle parsing)
- `src/background/convert/__tests__/types.test.ts` — Payload validation tests
- `src/background/convert/__tests__/index.test.ts` — Consumer factory and binding tests

## CI

GitHub Actions workflow at `.github/workflows/ci.yml` runs on push/PR to `master` and `dev`:

1. Install dependencies (`npm ci`)
2. Run tests (`npm test`)
3. Build (`npm run build`)

## Troubleshooting

- If startup fails with configuration errors, verify all required `.env` values.
- If DB connection fails, verify `MONGO_CONNECTION_STRING` and network access.
- If AMQP connection fails, verify `AMQP_CONNECTION_STRING` and broker availability.
- If the process exits immediately in `start`, ensure `dist/` exists (`npm run build`).
