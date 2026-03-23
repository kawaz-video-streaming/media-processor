import { AmqpClient } from "@ido_kawaz/amqp-client";
import { StorageClient, StorageError } from "@ido_kawaz/storage-client";
import { isNotEmpty, omit } from "ramda";
import { ConversionFatalError, ConversionRetriableError } from "./errors";
import * as logic from "./logic";
import { Convert, ConvertConfig, ConvertHandlerSuccessResult, Video } from "./types";
import { cleanupWorkspace, initializeWorkspace } from "./utils";

export const convertMediaHandler = (storageClient: StorageClient, config: ConvertConfig) =>
    async (payload: Convert) => {
        const workPaths = initializeWorkspace(payload);
        const { workDirPath } = workPaths;
        try {
            const videoMetadata = await logic.convertMedia(config, storageClient, payload, workPaths);
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
        const video: Video = {
            _id: mediaId,
            playUrl: `${mediaId}/output.mpd`,
            ...(isNotEmpty(videoMetadata.chapters) ?
                { chaptersUrl: `${mediaId}/chapters.vtt`, chapters: videoMetadata.chapters }
                : {}
            ),
            subtitleStreams: videoMetadata.subtitleStreams.map(omit(['index'])),
            ...omit(['chapters', 'subtitleStreams', 'is10bit'], videoMetadata)
        }
        amqpClient.publish('register', 'register.media', { video });
        await cleanupWorkspace(workDirPath);
    };
