import { AmqpClient } from "@ido_kawaz/amqp-client";
import { createServer } from "@ido_kawaz/server-framework";
import { StorageClient } from "@ido_kawaz/storage-client";
import { registerRoutes } from "../api";
import { createConsumers } from "../background";
import { SystemConfig } from "../config";
import { SERVICE_NAME } from "../consts";
import { initializeDB } from "./db";

export const startSystem = async (config: SystemConfig) => {
    const storageClient = new StorageClient(config.storage);
    const amqpClient = new AmqpClient(config.amqp);
    const consumers = createConsumers(storageClient, amqpClient, config.consumers);
    amqpClient.registerConsumers(consumers);
    const dals = await initializeDB(config.db);
    await amqpClient.start(SERVICE_NAME);
    const server = createServer(config.server, registerRoutes);
    await server.start(storageClient, amqpClient, dals);
}