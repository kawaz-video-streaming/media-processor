import { z } from 'zod';
import { validateSchema } from "../../utils/zod";

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

const convertMediaSchema = z.object({
    mediaName: z.string(),
    mediaStorageBucket: z.string(),
    mediaRoutingKey: z.string(),
    areSubtitlesIncluded: z.coerce.boolean().default(false)
})

export const validateConvertMediaPayload = validateSchema<ConvertMedia>(convertMediaSchema);   