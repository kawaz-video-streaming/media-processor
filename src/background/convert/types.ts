import { z } from 'zod';
import { validateSchema } from "../../utils/zod";
import { Types } from '@ido_kawaz/mongo-client';

export interface WorkPaths {
    workDirPath: string;
    mediaPath: string;
    mpdPath: string;
}

export interface VideoChapter {
    chapterName: string;
    chapterStartTime: number;
    chapterEndTime: number;
}

export interface VideoStream {
    videoIndex: number;
    videoName: string;
    videoDuration: number;
}

export interface AudioStream {
    audioIndex: number
    audioName: string;
    audioDuration: number;
}

export interface SubtitleStream {
    subtitleIndex: number;
    subtitleLanguage: string;
    subtitleName: string;
    subtitleDuration: number;
}

export interface Video {
    videoId: string;
    videoName: string;
    videoDuration: number;
    videoChapters: VideoChapter[];
    videoStreams: VideoStream[];
    audioStreams: AudioStream[];
    subtitleStreams: SubtitleStream[];
}

export interface Convert {
    mediaId: string;
    mediaName: string;
    mediaStorageBucket: string;
    mediaRoutingKey: string;
}

export interface ConvertConfig {
    vodBucketName: string;
}

const convertSchema = z.object({
    mediaId: z.string().refine((value) => Types.ObjectId.isValid(value), {
        message: "Invalid mediaId format. Expected a valid ObjectId string."
    }),
    mediaName: z.string(),
    mediaStorageBucket: z.string(),
    mediaRoutingKey: z.string()
})

export const validateConvertPayload = validateSchema<Convert>(convertSchema);   