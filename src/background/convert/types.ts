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
    codec: string;
    title: string;
    duration: number;
}

export interface AudioStream {
    codec: string;
    language: string;
    title: string;
    duration: number;
}

export interface SubtitleStream {
    index: number;
    language: string;
    title: string;
    duration: number;
}

export interface VideoMetadata {
    title: string;
    duration: number;
    chapters: VideoChapter[];
    videoStreams: VideoStream[];
    audioStreams: AudioStream[];
    subtitleStreams: SubtitleStream[];
}

export interface Video extends VideoMetadata {
    _id: string;
    playUrl: string;
    chaptersUrl?: string;
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