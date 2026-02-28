import Joi from "joi";
import { isNotNil } from "ramda";
import { DatabaseConfig } from "./services/db/types";
import { ServerConfig } from "./services/server/types";
import { StorageClientConfig } from "@ido_kawaz/storage-client";
import { AmqpConfig } from "@ido_kawaz/amqp-client";
import { ConsumersConfig } from "./background/config";

class InvalidConfigError extends Error {
  constructor(error: Joi.ValidationError) {
    const message = `Invalid configuration: \n${error.details.map(detail => detail.message).join(',\n')}`;
    super(message);
  }
}

interface EnvironmentVariables {
  NODE_ENV: string;
  PORT: number;
  SECURED: boolean;
  MONGO_CONNECTION_STRING: string;
  AMQP_CONNECTION_STRING: string;
  AWS_ENDPOINT: string;
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_PART_SIZE: number;
  AWS_MAX_CONCURRENCY: number;
  VOD_BUCKET_NAME: string;
  UPLOADING_BATCH_SIZE: number;
}

const environmentVariablesSchema = Joi.object<EnvironmentVariables>({
  NODE_ENV: Joi.string().valid("local", "development", "master", "pre-prod", "production", "test").default("development"),
  PORT: Joi.number().required(),
  SECURED: Joi.boolean().default(false),
  MONGO_CONNECTION_STRING: Joi.string().uri().required(),
  AMQP_CONNECTION_STRING: Joi.string().uri().required(),
  AWS_ENDPOINT: Joi.string().uri().required(),
  AWS_REGION: Joi.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: Joi.string().required(),
  AWS_SECRET_ACCESS_KEY: Joi.string().required(),
  AWS_PART_SIZE: Joi.number().default(5 * 1024 * 1024),
  AWS_MAX_CONCURRENCY: Joi.number().default(4),
  VOD_BUCKET_NAME: Joi.string().required(),
  UPLOADING_BATCH_SIZE: Joi.number().required()
}).unknown();

export interface SystemConfig {
  env: string;
  db: DatabaseConfig;
  amqp: AmqpConfig;
  consumers: ConsumersConfig;
  storage: StorageClientConfig;
  server: ServerConfig;
}

export const getConfig = (env: NodeJS.ProcessEnv): SystemConfig => {
  const { error, value } = environmentVariablesSchema.validate(env, { abortEarly: false, convert: true });
  if (isNotNil(error)) {
    throw new InvalidConfigError(error);
  }

  const envVars: EnvironmentVariables = value;
  return {
    env: envVars.NODE_ENV,
    db: {
      dbConnectionString: envVars.MONGO_CONNECTION_STRING
    },
    amqp: {
      amqpConnectionString: envVars.AMQP_CONNECTION_STRING
    },
    consumers: {
      convertMedia: {
        vodBucketName: envVars.VOD_BUCKET_NAME,
        uploadingBatchSize: envVars.UPLOADING_BATCH_SIZE
      }
    },
    storage: {
      region: envVars.AWS_REGION,
      endpoint: envVars.AWS_ENDPOINT,
      credentials: {
        accessKeyId: envVars.AWS_ACCESS_KEY_ID,
        secretAccessKey: envVars.AWS_SECRET_ACCESS_KEY
      },
      partSize: envVars.AWS_PART_SIZE,
      maxConcurrency: envVars.AWS_MAX_CONCURRENCY
    },
    server: {
      port: envVars.PORT,
      secured: envVars.SECURED
    }
  }
}