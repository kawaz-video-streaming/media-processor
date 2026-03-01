import { MongoClient } from "@ido_kawaz/mongo-client";

//TODO: add models and dals for media processor service
export const createModels = (_mongoClient: MongoClient) => {
    return {
    };
}

type Models = ReturnType<typeof createModels>;

export const createDals = (_models: Models) => {
    return {
    };
}

export type Dals = ReturnType<typeof createDals>;