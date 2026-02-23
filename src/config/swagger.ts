import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Media Processor API",
            version: "1.0.0",
            description: "API documentation for Media Processor service",
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
    apis: ["./src/routes/**/*.ts", "./src/services/server/utils.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
