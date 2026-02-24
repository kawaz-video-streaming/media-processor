import Joi from "joi";
import { isNil } from "ramda";


export const validateSchema = <T>(schema: Joi.Schema<T>) => (payload: any): payload is T => {
    const { error } = schema.validate(payload);
    return isNil(error);
}