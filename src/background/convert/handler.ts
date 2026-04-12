import { AmqpClient } from "@ido_kawaz/amqp-client";
import { StorageClient, StorageError } from "@ido_kawaz/storage-client";
import { isNotEmpty, omit } from "ramda";
import { ConversionFatalError, ConversionRetriableError } from "./errors";
import * as logic from "./logic";
import { Convert, ConvertConfig, ConvertHandlerSuccessResult, MediaMetadata, Progress } from "./types";
import { cleanupWorkspace, initializeWorkspace } from "./utils";

export const convertMediaHandler = (amqpClient: AmqpClient, storageClient: StorageClient, config: ConvertConfig) =>
    async (payload: Convert) => {
        const workPaths = initializeWorkspace(payload);
        const { workDirPath } = workPaths;
        try {
            const videoMetadata = await logic.convertMedia(amqpClient, config, storageClient, payload, workPaths);
            return { videoMetadata, workDirPath };
        } catch (err) {
            const error = err as Error;
            if (error instanceof StorageError) {
                throw new ConversionRetriableError(payload, error, 3, workDirPath);
            } else {
                throw new ConversionFatalError(payload, error, workDirPath);
            }
        }
    };

export const onConvertSuccessHandler = (amqpClient: AmqpClient) =>
    async ({ mediaId }: Convert, { videoMetadata, workDirPath }: ConvertHandlerSuccessResult) => {
        const mediaMetadata: MediaMetadata = {
            playUrl: `${mediaId}/output.mpd`,
            thumbnailsUrl: `${mediaId}/thumbnails.vtt`,
            ...(isNotEmpty(videoMetadata.chapters) ?
                { chaptersUrl: `${mediaId}/chapters.vtt`, chapters: videoMetadata.chapters }
                : {}
            ),
            subtitleStreams: videoMetadata.subtitleStreams.map(omit(['index'])),
            audioStreams: videoMetadata.audioStreams.map(omit(['codec', 'channels'])),
            ...omit(['chapters', 'subtitleStreams', 'audioStreams'], videoMetadata)
        }
        amqpClient.publish<Progress>('progress', 'progress.media', { mediaId, percentage: 100, status: 'completed', metadata: mediaMetadata });
        await cleanupWorkspace(workDirPath);
    };
