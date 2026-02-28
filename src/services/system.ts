import { AmqpClient } from "@ido_kawaz/amqp-client";
import { StorageClient } from "@ido_kawaz/storage-client";
import { createConsumers } from "../background/consumers";
import { SystemConfig } from "../config";
import { initializeDB } from "./db/db";
import { startServer } from "./server/server";

const startAmqp = async (amqpClient: AmqpClient) => {
    const startTime = Date.now();
    await amqpClient.start();
    const endTime = Date.now();
    console.log(`connected to amqp successfully in ${endTime - startTime} ms`);
}

export const startSystem = async (config: SystemConfig) => {
    const storageClient = new StorageClient(config.storage);
    const consumers = createConsumers(storageClient, config.consumers);
    const amqpClient = new AmqpClient(config.amqp, consumers);
    const dals = await initializeDB(config.db);
    await startAmqp(amqpClient);
    await startServer(config.server, storageClient, amqpClient, dals);
}