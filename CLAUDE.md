# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development — hot-reload via ts-node-dev, reads .env automatically
npm run dev

# Build — cleans dist/ then compiles TypeScript
npm run build

# Build in watch mode
npm run build:watch

# Run compiled output (requires dist/ to exist and .env file)
npm run start

# Build then run (no hot-reload, runs compiled JS)
npm run start:dev

# Tests — builds first, then runs all test suites sequentially
npm test

# Run a single test file (build first if source changed)
npm run build && npx jest --runInBand --verbose --config jest.config.js src/background/convert/__tests__/handler.test.ts

# Full clean: removes dist/, node_modules/, package-lock.json, then reinstalls and builds
npm run build:advanced
```

**System requirement:** FFmpeg and FFprobe binaries must be installed and available on `PATH`. The service will fail at runtime without them.

## Architecture

This is a headless async media processing service. The HTTP server exists only for health checks and Swagger docs — all real work is driven by AMQP consumers.

**Startup flow** ([src/index.ts](src/index.ts) → [src/services/system.ts](src/services/system.ts)):
1. Validates environment variables via Zod (`src/config.ts`) — throws on missing required vars
2. Creates `tmp/` directory at project root if `NODE_ENV=local`
3. Connects MongoDB, AMQP broker, and S3-compatible storage
4. Starts Express HTTP server, registers AMQP consumers

**Media conversion pipeline** (`src/background/convert/`):
1. Receive AMQP message on queue `media-processor-convert` (exchange: `convert`, topic: `convert.media`)
2. Validate payload with Zod — `mediaId` (MongoDB ObjectId), `mediaName`, `mediaStorageBucket`, `mediaRoutingKey`
3. Download source media from S3 via `storageClient.downloadObject` (in `handler.ts`)
4. Create isolated `tmp/<mediaName>-<random>/` workspace; write media stream to disk
5. Probe media with FFprobe (`getVideoMetadata`) to extract video/audio/subtitle streams, chapters, and duration; throws `NonVideoMediaError` if no video stream found
6. Extract any detected ASS subtitle streams as `.vtt` files with FFmpeg
7. Convert to MPEG-DASH with FFmpeg (`-f dash`, 15s segments, copies video/audio streams without re-encoding); source file and subtitle inputs deleted from workspace after conversion
8. Upload all workspace files to VOD S3 bucket under `<mediaName-no-ext>/` key prefix, in batches of `UPLOADING_BATCH_SIZE`
9. `finally`: delete workspace directory regardless of success or failure

**Key directories:**
- `src/background/convert/` — entire conversion consumer: `handler.ts` orchestrates, `utils.ts` implements each step, `types.ts` has Zod schema + interfaces, `errors.ts` has domain errors, `binding.ts` has AMQP queue/exchange/topic constants
- `src/utils/` — shared: `ffmpeg.ts` (FFmpeg/FFprobe promise wrappers), `files.ts` (recursive file collection, temp folder creation, path formatting), `batches.ts` (batch processor with progress logging), `zod.ts` (validation helper)
- `src/services/` — `system.ts` bootstraps everything; `db.ts` inits MongoDB
- `src/dal/` — DAL stubs, currently empty (TODO)
- `src/api/` — HTTP routes: health check + Swagger UI only (more routes TODO)

## Tech Stack

- **Runtime:** Node.js + TypeScript (strict mode, `noUnusedLocals`, `noUnusedParameters`, target ES2020, CommonJS output)
- **Media processing:** `fluent-ffmpeg` wrapping system FFmpeg/FFprobe
- **Messaging:** `@ido_kawaz/amqp-client`
- **Storage:** `@ido_kawaz/storage-client` (S3-compatible, e.g. MinIO)
- **Database:** `@ido_kawaz/mongo-client` (MongoDB)
- **HTTP:** `@ido_kawaz/server-framework` (Express-based)
- **Validation:** `zod` for both config env vars and AMQP payload validation
- **Testing:** Jest + ts-jest; test files in `__tests__/` subdirectories alongside source

> Note: all `@ido_kawaz/*` shared libraries are listed under `devDependencies` in package.json.

## Environment Variables

Required `.env` for local development:

```env
PORT=8081
NODE_ENV=local
MONGO_CONNECTION_STRING=mongodb://localhost:27017/media-processor
AWS_ENDPOINT=http://127.0.0.1:9000
AWS_ACCESS_KEY_ID=dummyuser
AWS_SECRET_ACCESS_KEY=dummypassword
AMQP_CONNECTION_STRING=amqp://kawaz:kawaz@localhost:5672
VOD_BUCKET_NAME=vod
UPLOADING_BATCH_SIZE=100
```

`NODE_ENV=local` triggers automatic `tmp/` folder creation at startup. `VOD_BUCKET_NAME` and `UPLOADING_BATCH_SIZE` are Zod-validated at startup and will throw `InvalidConfigError` with a descriptive message if missing.

## Testing Notes

- `npm test` builds before running — if TypeScript errors exist, tests won't run
- `--runInBand` is required; tests are not designed to run in parallel
- The E2E test (`src/__tests__/integration.test.ts`) mocks only FFmpeg binaries (`runFfmpeg`/`runFfprobe`) and the S3 `StorageClient` — workspace creation, stream writing, file collection, batch upload orchestration, and cleanup all run for real. The `runFfmpeg` mock creates fake DASH output files so downstream steps have real files to process.
- TypeScript's `noUnusedLocals` / `noUnusedParameters` will cause build failures if you leave unused imports — clean them up before running tests
