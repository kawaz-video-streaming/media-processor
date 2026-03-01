import { AmqpClient } from "@ido_kawaz/amqp-client";
import { StorageClient } from "@ido_kawaz/storage-client";
import express from "express";
import http from "http";
import https from "https";
import { Dals } from "../db/utils";
import { registerMiddlewares, registerRoutes } from "./utils";

export interface ServerConfig {
  port: number;
  secured: boolean;
}

export const startServer = async (
  config: ServerConfig,
  storageClient: StorageClient,
  amqpClient: AmqpClient,
  dals: Dals
) => {
  const app = express();
  const appWithMiddlewares = registerMiddlewares(app);
  const appWithRoutes = registerRoutes(appWithMiddlewares, storageClient, amqpClient, dals);
  const { port, secured } = config;
  const server = secured ? https.createServer(appWithRoutes) : http.createServer(appWithRoutes);
  return new Promise<void>((resolve, reject) => {
    server.listen(port, () => {
      console.log(`Server is running on port ${port}`);
      resolve();
    }).on("error", (error) => {
      console.error("Error starting the server:", error);
      reject(error);
    });
  });
};
