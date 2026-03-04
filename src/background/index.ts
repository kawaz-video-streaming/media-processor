import { StorageClient } from "@ido_kawaz/storage-client";
import { ConsumersConfig } from "./config";
import { createConvertConsumer } from "./convert";

export const createConsumers = (storageClient: StorageClient, config: ConsumersConfig) => {
    return [
        createConvertConsumer(storageClient, config.convertMedia)
    ];
}