import { StorageClient } from "@ido_kawaz/storage-client";
import { createConvertMediaConsumer } from "./convertMedia/consumer";
import { ConsumersConfig } from "./config";

export const createConsumers = (storageClient: StorageClient, config: ConsumersConfig) => {
    return [
        createConvertMediaConsumer(storageClient, config.convertMedia)
    ];
}