import { StorageClient } from "@ido_kawaz/storage-client";
import { ConsumersConfig } from "./config";
import { createConvertMediaConsumer } from "./convertMedia";

export const createConsumers = (storageClient: StorageClient, config: ConsumersConfig) => {
    return [
        createConvertMediaConsumer(storageClient, config.convertMedia)
    ];
}