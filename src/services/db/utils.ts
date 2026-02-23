import mongoose from "mongoose";
import { Dals, Models } from "./types";


//TODO: add models and dals for media processor service
export const createModels = (_connection: mongoose.Connection): Models => {
    return {
    };
}

export const ensureIndexes = async (models: Models) => {
    await Promise.all(Object.values(models).map(model => model.ensureIndexes()));
}

export const createDals = (_models: Models): Dals => {
    return {
    };
}