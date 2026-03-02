import { StorageClient } from "@ido_kawaz/storage-client";
import { ConvertMedia, ConvertMediaConfig } from "./types";
import { cleanupWorkspace, convertMediaToDashStream, generateSubtitleTracks, initializeWorkspace, uploadStreamToStorage, writeMediaToDirectory } from "./utils";

export const convertMediaHandler = (storageClient: StorageClient, config: ConvertMediaConfig) =>
    async ({ mediaStorageBucket, mediaRoutingKey, mediaName, areSubtitlesIncluded }: ConvertMedia) => {
        const mediaStream = await storageClient.downloadObject(mediaStorageBucket, mediaRoutingKey);
        const { workDirPath, mediaPath, mpdPath } = initializeWorkspace(mediaName);
        try {
            await writeMediaToDirectory(mediaStream, mediaPath);
            if (areSubtitlesIncluded) {
                await generateSubtitleTracks(workDirPath, mediaPath);
            }
            await convertMediaToDashStream(mediaPath, mpdPath);
            await uploadStreamToStorage(storageClient, mediaName, workDirPath, config);
        } finally {
            await cleanupWorkspace(workDirPath);
        }
    };

