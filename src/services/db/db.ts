import mongoose from "mongoose";
import { createDals, createModels, ensureIndexes } from "./utils";
import { Dals, DatabaseConfig, DatabaseConnectionError } from "./types";
import { CONNECTION_TIMEOUT_MS } from "./consts";

export const initializeDB = async (config: DatabaseConfig): Promise<Dals> => {
    const start = Date.now();
    const connection = await mongoose.createConnection(config.dbConnectionString, { serverSelectionTimeoutMS: CONNECTION_TIMEOUT_MS }).asPromise().catch((error) => {
        throw new DatabaseConnectionError(error.message);
    });
    const end = Date.now();
    console.log(`Connected to database successfully in ${end - start} ms`);
    const models = createModels(connection);
    await ensureIndexes(models);
    return createDals(models);
}