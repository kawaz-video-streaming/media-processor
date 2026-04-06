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

interface stream {
    title: string;
    durationInMs: number;
}

interface languageStream extends stream {
    language: string;
}

export interface VideoStream extends stream { }

export interface AudioStream extends languageStream { }

export interface SubtitleStream extends languageStream {
    index: number;
}

export interface VideoMetadata {
    name: string;
    durationInMs: number;
    chapters: VideoChapter[];
    videoStreams: VideoStream[];
    audioStreams: AudioStream[];
    subtitleStreams: SubtitleStream[];
}

export interface MediaMetadata extends Omit<VideoMetadata, 'chapters' | 'subtitleStreams'> {
    playUrl: string;
    chaptersUrl?: string;
    chapters?: VideoChapter[];
    subtitleStreams: Omit<SubtitleStream, 'index'>[];
}

export interface Progress {
    mediaId: string;
    status: 'completed' | 'failed';
    metadata?: MediaMetadata;
}

export interface ConvertHandlerSuccessResult {
    videoMetadata: VideoMetadata;
    workDirPath: string;
};


export interface Convert {
    mediaId: string;
    mediaFileName: string;
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
    mediaFileName: z.string(),
    mediaStorageBucket: z.string(),
    mediaRoutingKey: z.string()
}) satisfies z.ZodType<Convert>;

export const validateConvertPayload = validateSchema<Convert>(convertSchema);   