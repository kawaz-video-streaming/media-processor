export class DatabaseConnectionError extends Error {
    constructor(message: string) {
        super(`Database connection error:\n${message}`);
    }
}

export interface DatabaseConfig {
    dbConnectionString: string;
}

export interface Models {
};

export interface Dals {
};