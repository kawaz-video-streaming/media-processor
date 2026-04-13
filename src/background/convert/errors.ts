import { AmqpFatalError, AmqpRetriableError } from "@ido_kawaz/amqp-client";
import { Convert } from "./types";

export class NonVideoMediaError extends Error {
    constructor() {
        super('No video stream found in media');
    }
}

export class ConversionRetriableError extends AmqpRetriableError<Convert> {
    constructor(payload: Convert, error: Error, retryCount: number, readonly workDirPath: string) {
        super(payload, error.message, error, retryCount);
    }
}

export class ConversionFatalError extends AmqpFatalError {
    constructor(payload: any, error: Error, readonly workDirPath: string) {
        super(payload, error.message, error);
    }
}
