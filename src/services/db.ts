import { MongoClient, MongoConfig } from "@ido_kawaz/mongo-client";
import { createDals, createModels } from "../dal";
import { Dals } from "../dal/types";

export const initializeDB = async (config: MongoConfig): Promise<Dals> => {
    const mongoClient = new MongoClient(config);
    await mongoClient.start();
    const models = createModels(mongoClient);
    await mongoClient.ensureIndexes(Object.values(models));
    return createDals(models);
}