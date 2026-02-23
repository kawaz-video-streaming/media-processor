import express from "express";
import http from "http";
import https from "https";
import { StorageClient } from "@ido_kawaz/storage-client";
import { ServerConfig } from "./types";
import { registerMiddlewares, registerRoutes } from "./utils";
import { Dals } from "../db/types";
import { AmqpClient } from "@ido_kawaz/amqp-client";

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
