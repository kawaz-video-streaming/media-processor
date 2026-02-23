import Joi from "joi";
import { isNotNil } from "ramda";
import { DatabaseConfig } from "./services/db/types";
import { ServerConfig } from "./services/server/types";
import { StorageClientConfig } from "@ido_kawaz/storage-client";
import { AmqpConfig } from "@ido_kawaz/amqp-client";

class InvalidConfigError extends Error {
  constructor(error: Joi.ValidationError) {
    const message = `Invalid configuration: \n${error.details.map(detail => detail.message).join(',\n')}`;
    super(message);
  }
}

interface EnvironmentVariables {
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
}

const environmentVariablesSchema = Joi.object<EnvironmentVariables>({
  PORT: Joi.number().required(),
  SECURED: Joi.boolean().default(false),
  MONGO_CONNECTION_STRING: Joi.string().uri().required(),
  AMQP_CONNECTION_STRING: Joi.string().uri().required(),
  AWS_ENDPOINT: Joi.string().uri().required(),
  AWS_REGION: Joi.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: Joi.string().required(),
  AWS_SECRET_ACCESS_KEY: Joi.string().required(),
  AWS_PART_SIZE: Joi.number().default(128 * 1024 * 1024),
  AWS_MAX_CONCURRENCY: Joi.number().default(4)
}).unknown();

export interface SystemConfig {
  amqp: AmqpConfig;
  storage: StorageClientConfig;
  server: ServerConfig;
  db: DatabaseConfig;
}

export const getConfig = (env: NodeJS.ProcessEnv): SystemConfig => {
  const { error, value } = environmentVariablesSchema.validate(env, { abortEarly: false, convert: true });
  if (isNotNil(error)) {
    throw new InvalidConfigError(error);
  }
  return {
    storage: {
      region: value.AWS_REGION,
      endpoint: value.AWS_ENDPOINT,
      credentials: {
        accessKeyId: value.AWS_ACCESS_KEY_ID,
        secretAccessKey: value.AWS_SECRET_ACCESS_KEY
      },
      partSize: value.AWS_PART_SIZE,
      maxConcurrency: value.AWS_MAX_CONCURRENCY
    },
    db: {
      dbConnectionString: value.MONGO_CONNECTION_STRING
    },
    amqp: {
      amqpConnectionString: value.AMQP_CONNECTION_STRING
    },
    server: {
      port: value.PORT,
      secured: value.SECURED
    }
  }
}