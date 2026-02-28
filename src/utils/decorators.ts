import { Request, Response, NextFunction, RequestHandler } from "express";
import pino from "pino";
import { ApiError } from "./errors";
import { StatusCodes } from "http-status-codes";

export const RequestHandlerDecorator = (functionName: string, handler: RequestHandler) =>
    async (req: Request, res: Response, next: NextFunction) => {
        const logger = pino({ name: 'media-processor' });
        const startTime = Date.now();
        logger.info({ handler: functionName, method: req.method }, `Starting running ${functionName} handler`);
        try {
            await handler(req, res, next);
            const duration = Date.now() - startTime;
            logger.info(
                { handler: functionName, method: req.method, durationMs: duration },
                `Finished running ${functionName} handler Successfully`
            );
        } catch (error: any) {
            const duration = Date.now() - startTime;
            logger.error({ error: error.message, handler: functionName, method: req.method, durationMs: duration }, `Failed running ${functionName} handler`);
            next(error);
        }
    }

export const RequestErrorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const errorResponseBody = { error: err.message };
    if (err instanceof ApiError) {
        res.status(err.statusCode).json(errorResponseBody);
    } else {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(errorResponseBody);
    }
};
