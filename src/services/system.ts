import { AmqpClient } from "@ido_kawaz/amqp-client";
import { startServer } from "@ido_kawaz/server-framework";
import { StorageClient } from "@ido_kawaz/storage-client";
import { registerRoutes } from "../api";
import { createConsumers } from "../background";
import { SystemConfig } from "../config";
import { SERVICE_NAME } from "../consts";
import { initializeDB } from "./db";

export const startSystem = async (config: SystemConfig) => {
    const storageClient = new StorageClient(config.storage);
    const consumers = createConsumers(storageClient, config.consumers);
    const amqpClient = new AmqpClient(config.amqp, consumers);
    const dals = await initializeDB(config.db);
    await amqpClient.start(SERVICE_NAME);
    await startServer(config.server, registerRoutes, storageClient, amqpClient, dals);
}