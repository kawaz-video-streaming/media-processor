import swaggerJsdoc from "swagger-jsdoc";
import { SERVICE_NAME } from "../consts";

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: `${SERVICE_NAME} API`,
            version: "1.0.0",
            description: `API documentation for ${SERVICE_NAME} service`,
        },
        servers: [
            {
                url: "http://localhost:8081",
                description: "Development server",
            },
        ],
        components: {
            schemas: {
                InternalServerError: {
                    type: "object",
                    properties: {
                        error: {
                            type: "string",
                            description: "Error message",
                            example: "An unexpected error occurred while processing the request"
                        },
                    },
                },
                BadRequestError: {
                    type: "object",
                    properties: {
                        error: {
                            type: "string",
                            description: "Error message",
                            example: "request body is missing required field"
                        },
                    },
                }
            },
        },
    },
    apis: ["./src/api/**/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
