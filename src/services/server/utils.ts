import { AmqpClient } from "@ido_kawaz/amqp-client";
import { StorageClient } from "@ido_kawaz/storage-client";
import bodyParser from "body-parser";
import cors from "cors";
import express, { Express } from "express";
import { StatusCodes } from "http-status-codes";
import swaggerUi from "swagger-ui-express";
import { RequestErrorHandler } from "../../utils/decorators";
import { Dals } from "../db/utils";
import { swaggerSpec } from "../swagger";

export const registerMiddlewares = (app: Express) => {
    app.use(cors());
    app.use(express.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    return app;
};

export const registerRoutes = (app: Express, _storageClient: StorageClient, _amqpClient: AmqpClient, _dals: Dals) => {
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
    app.use(RequestErrorHandler);

    return app;
};