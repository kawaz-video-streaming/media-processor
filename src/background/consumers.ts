import { StorageClient } from "@ido_kawaz/storage-client";
import { createConvertMediaConsumer } from "./convertMedia/consumer";

export const createConsumers = (storageClient: StorageClient) => {
    return [
        createConvertMediaConsumer(storageClient)
    ];
}