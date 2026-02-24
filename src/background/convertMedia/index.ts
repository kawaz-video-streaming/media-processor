import Joi from "joi";
import { validateSchema } from "../../utils/joi";

export interface ConvertMedia {
    bucket: string;
    path: string;
}

const convertMediaSchema = Joi.object<ConvertMedia>({
    bucket: Joi.string().required(),
    path: Joi.string().required()
})

export const validateConvertMediaPayload = validateSchema(convertMediaSchema);