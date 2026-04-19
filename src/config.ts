import { AmqpConfig, createAmqpConfig } from "@ido_kawaz/amqp-client";
import { createMongoConfig, MongoConfig } from "@ido_kawaz/mongo-client";
import { createServerConfig, ServerConfig } from "@ido_kawaz/server-framework";
import { createStorageConfig, StorageConfig } from '@ido_kawaz/storage-client';
import { z } from 'zod';
import { ConsumersConfig } from "./background/config";

class InvalidConfigError extends Error {
  constructor(error: z.ZodError) {
    const message = `Invalid configuration: \n${error.issues.map(detail => detail.message).join(',\n')}`;
    super(message);
  }
}

const environments = ["local", "development", "test", "production"] as const;

export type Environment = typeof environments[number];

const environmentVariablesSchema = z.object({
  NODE_ENV: z.enum(environments).default("development"),
  VOD_BUCKET_NAME: z.string(),
  THUMBNAIL_INTERVAL_IN_SECONDS: z.coerce.number().default(10),
  THUMBNAIL_WIDTH: z.coerce.number().default(160),
  THUMBNAIL_HEIGHT: z.coerce.number().default(90),
  THUMBNAIL_COLS: z.coerce.number().default(10)
});

export interface SystemConfig {
  env: Environment;
  db: MongoConfig;
  amqp: AmqpConfig;
  consumers: ConsumersConfig;
  storage: StorageConfig;
  server: ServerConfig;
}

export const getConfig = (env: NodeJS.ProcessEnv): SystemConfig => {
  const { success, error, data: envVars } = environmentVariablesSchema.safeParse(env);
  if (!success) {
    throw new InvalidConfigError(error);
  }

  return {
    server: createServerConfig(),
    db: createMongoConfig(),
    storage: createStorageConfig(),
    amqp: createAmqpConfig(),
    env: envVars.NODE_ENV,
    consumers: {
      convertMedia: {
        vodBucketName: envVars.VOD_BUCKET_NAME,
        thumbnailConfig: {
          thumbnailIntervalInSeconds: envVars.THUMBNAIL_INTERVAL_IN_SECONDS,
          thumbnailWidth: envVars.THUMBNAIL_WIDTH,
          thumbnailHeight: envVars.THUMBNAIL_HEIGHT,
          thumbnailCols: envVars.THUMBNAIL_COLS,
        }
      }
    },
  }
}