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

Create a `.env` file in the project root:

```env
PORT=8081
SECURED=false

MONGO_CONNECTION_STRING=mongodb://localhost:27017/media-processor
AMQP_CONNECTION_STRING=amqp://localhost:5672

AWS_ENDPOINT=http://localhost:9000
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_PART_SIZE=134217728
AWS_MAX_CONCURRENCY=4
```

### Variable Notes

- `PORT` (required): Port for the HTTP server
- `SECURED` (optional, default `false`): When `true`, starts with `https.createServer` (certificate options are not configured in code yet)
- `MONGO_CONNECTION_STRING` (required): MongoDB URI
- `AMQP_CONNECTION_STRING` (required): AMQP URI
- `AWS_ENDPOINT` (required): S3-compatible endpoint URL
- `AWS_REGION` (optional, default `us-east-1`)
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (required)
- `AWS_PART_SIZE` (optional, default `134217728`)
- `AWS_MAX_CONCURRENCY` (optional, default `4`)

## Scripts

- `npm run dev` - Run in development mode via `ts-node-dev`
- `npm run build` - Clean and compile to `dist/`
- `npm run build:watch` - Compile in watch mode
- `npm run start` - Run compiled output (`dist/index.js`) with `.env`
- `npm run start:dev` - Build then start compiled output
- `npm run clean` - Remove `dist/`
- `npm run clean:advanced` - Remove `dist/`, `node_modules/`, and `package-lock.json`
- `npm run build:advanced` - Advanced clean, install, and build

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

Current consumer binding:

- Queue: `media-processor-converter`
- Exchange: `converter`
- Topic: `uploaded.media`

Payload schema for the consumer:

```json
{
	"bucket": "string",
	"path": "string"
}
```

> Note: conversion handler logic is scaffolded and currently marked TODO.

## Troubleshooting

- If startup fails with configuration errors, verify all required `.env` values.
- If DB connection fails, verify `MONGO_CONNECTION_STRING` and network access.
- If AMQP connection fails, verify `AMQP_CONNECTION_STRING` and broker availability.
- If the process exits immediately in `start`, ensure `dist/` exists (`npm run build`).
