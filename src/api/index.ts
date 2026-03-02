import { AmqpClient } from "@ido_kawaz/amqp-client";
import { Application } from '@ido_kawaz/server-framework';
import { StorageClient } from "@ido_kawaz/storage-client";
import { StatusCodes } from "http-status-codes";
import swaggerUi from "swagger-ui-express";
import { Dals } from "../dal/types";
import { swaggerSpec } from "../services/swagger";

export const registerRoutes = (_storageClient: StorageClient, _amqpClient: AmqpClient, _dals: Dals) => (app: Application) => {
    /**
     * @openapi
     * /health:
     *   get:
     *     summary: Health check endpoint
     *     description: Returns OK if the server is running
     *     tags:
     *       - Health
     *     responses:
     *       200:
     *         description: Server is healthy
     */
    app.get("/health", (_req, res) => {
        res.sendStatus(StatusCodes.OK);
    });

    // Swagger documentation
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

    // API routes 
    //TODO: add API routes here

    return app;
};