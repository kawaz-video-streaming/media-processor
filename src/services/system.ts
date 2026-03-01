import { AmqpClient } from "@ido_kawaz/amqp-client";
import { StorageClient } from "@ido_kawaz/storage-client";
import { createConsumers } from "../background/consumers";
import { SystemConfig } from "../config";
import { initializeDB } from "./db";
import { startServer } from "./server";

export const startSystem = async (config: SystemConfig) => {
    const storageClient = new StorageClient(config.storage);
    const consumers = createConsumers(storageClient, config.consumers);
    const amqpClient = new AmqpClient(config.amqp, consumers);
    const dals = await initializeDB(config.db);
    await amqpClient.start();
    await startServer(config.server, storageClient, amqpClient, dals);
}