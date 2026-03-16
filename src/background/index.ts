import { AmqpClient } from "@ido_kawaz/amqp-client";
import { StorageClient } from "@ido_kawaz/storage-client";
import { ConsumersConfig } from "./config";
import { createConvertConsumer } from "./convert";

export const createConsumers = (storageClient: StorageClient, amqpClient: AmqpClient, config: ConsumersConfig) => {
    return [
        createConvertConsumer(storageClient, amqpClient, config.convertMedia)
    ];
}