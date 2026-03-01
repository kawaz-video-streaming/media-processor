import { MongoClient, MongoConfig } from "@ido_kawaz/mongo-client";
import { createModels, createDals, Dals } from "./utils";

export const initializeDB = async (config: MongoConfig): Promise<Dals> => {
    const mongoClient = new MongoClient(config);
    const models = createModels(mongoClient);
    await mongoClient.ensureIndexes(Object.values(models));
    return createDals(models);
}