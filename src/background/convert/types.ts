import { z } from 'zod';
import { validateSchema } from "../../utils/zod";

export interface WorkPaths {
    workDirPath: string;
    mediaPath: string;
    mpdPath: string;
}

export interface Convert {
    mediaName: string;
    mediaStorageBucket: string;
    mediaRoutingKey: string;
    areSubtitlesIncluded: boolean;
}

export interface ConvertConfig {
    vodBucketName: string;
    uploadingBatchSize: number;
}

const convertSchema = z.object({
    mediaName: z.string(),
    mediaStorageBucket: z.string(),
    mediaRoutingKey: z.string(),
    areSubtitlesIncluded: z.coerce.boolean().default(false)
})

export const validateConvertPayload = validateSchema<Convert>(convertSchema);   