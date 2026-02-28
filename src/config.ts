import Joi from "joi";
import { isNotNil } from "ramda";
import { DatabaseConfig } from "./services/db/types";
import { ServerConfig } from "./services/server/types";
import { createStorageClientConfig, StorageClientConfig } from "@ido_kawaz/storage-client";
import { createAmqpConfig, AmqpConfig } from "@ido_kawaz/amqp-client";
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
  VOD_BUCKET_NAME: string;
  UPLOADING_BATCH_SIZE: number;
}

const environmentVariablesSchema = Joi.object<EnvironmentVariables>({
  NODE_ENV: Joi.string().valid("local", "development", "master", "pre-prod", "production", "test").default("development"),
  PORT: Joi.number().required(),
  SECURED: Joi.boolean().default(false),
  MONGO_CONNECTION_STRING: Joi.string().uri().required(),
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
    storage: createStorageClientConfig(),
    amqp: createAmqpConfig(),
    consumers: {
      convertMedia: {
        vodBucketName: envVars.VOD_BUCKET_NAME,
        uploadingBatchSize: envVars.UPLOADING_BATCH_SIZE
      }
    },
    server: {
      port: envVars.PORT,
      secured: envVars.SECURED
    }
  }
}