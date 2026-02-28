import Joi from "joi";
import { validateSchema } from "../../utils/joi";

export interface WorkPaths {
    workDirPath: string;
    mediaPath: string;
    mpdPath: string;
}

export interface ConvertMedia {
    mediaName: string;
    mediaStorageBucket: string;
    mediaRoutingKey: string;
    areSubtitlesIncluded: boolean;
}

export interface ConvertMediaConfig {
    vodBucketName: string;
    uploadingBatchSize: number;
}

const convertMediaSchema = Joi.object<ConvertMedia>({
    mediaName: Joi.string().required(),
    mediaStorageBucket: Joi.string().required(),
    mediaRoutingKey: Joi.string().required(),
    areSubtitlesIncluded: Joi.boolean().default(false)
})

export const validateConvertMediaPayload = validateSchema(convertMediaSchema);   