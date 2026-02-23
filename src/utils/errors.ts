import { StatusCodes } from "http-status-codes";

export class ApiError extends Error {
    constructor(public readonly statusCode: number, message: string) {
        super(message);
    }
}

export class BadRequestError extends ApiError {
    constructor(message: string) {
        super(StatusCodes.BAD_REQUEST, message);
    }
}

export class UnauthorizedError extends ApiError {
    constructor(message: string) {
        super(StatusCodes.UNAUTHORIZED, message);
    }
}

export class NotFoundError extends ApiError {
    constructor(message: string) {
        super(StatusCodes.NOT_FOUND, message);
    }
}

export class InternalServerError extends ApiError {
    constructor(message: string) {
        super(StatusCodes.INTERNAL_SERVER_ERROR, message);
    }
}