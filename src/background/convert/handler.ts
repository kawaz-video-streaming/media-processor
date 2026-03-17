import { AmqpClient } from "@ido_kawaz/amqp-client";
import { StorageClient, StorageError } from "@ido_kawaz/storage-client";
import { isNotEmpty } from "ramda";
import { ConversionFatalError, ConversionRetriableError } from "./errors";
import { Convert, ConvertConfig, Video } from "./types";
import { addSubtitlesToMpd, cleanupWorkspace, convertMediaToDashStream, generateChaptersTrack, generateSubtitleTracks, getVideoMetadata, initializeWorkspace, uploadStreamToStorage, writeMediaToDirectory } from "./utils";

export const convertMediaHandler = (storageClient: StorageClient, config: ConvertConfig) =>
    async (payload: Convert) => {
        const { mediaStorageBucket, mediaRoutingKey, mediaName, mediaId } = payload
        const { workDirPath, mediaPath, mpdPath } = initializeWorkspace(mediaId, mediaName);
        try {
            const mediaStream = await storageClient.downloadObject(mediaStorageBucket, mediaRoutingKey);
            await writeMediaToDirectory(mediaStream, mediaPath);
            const videoMetadata = await getVideoMetadata(mediaPath);
            const subtitlePaths = await generateSubtitleTracks(videoMetadata.subtitleStreams, workDirPath, mediaPath);
            await generateChaptersTrack(videoMetadata.chapters, workDirPath);
            await convertMediaToDashStream(mediaPath, mpdPath, videoMetadata);
            await addSubtitlesToMpd(mpdPath, subtitlePaths, videoMetadata.subtitleStreams);
            await uploadStreamToStorage(storageClient, mediaId, workDirPath, config);
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

export type ConvertHandlerSuccessResult = Awaited<ReturnType<ReturnType<typeof convertMediaHandler>>>;

export const onConvertSuccessHandler = (amqpClient: AmqpClient) =>
    async ({ mediaId }: Convert, { videoMetadata, workDirPath }: ConvertHandlerSuccessResult) => {
        const video: Video = {
            id: mediaId,
            playUrl: `${mediaId}/output.mpd`,
            ...(isNotEmpty(videoMetadata.chapters) ? { chaptersUrl: `${mediaId}/chapters.vtt` } : {}),
            ...videoMetadata
        }
        amqpClient.publish('register', 'register.media', { video });
        await cleanupWorkspace(workDirPath);
    };
