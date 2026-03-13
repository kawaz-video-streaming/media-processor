import { StorageClient } from "@ido_kawaz/storage-client";
import { Convert, ConvertConfig } from "./types";
import { cleanupWorkspace, convertMediaToDashStream, getVideoMetadata, initializeWorkspace, uploadStreamToStorage, writeMediaToDirectory } from "./utils";

export const convertMediaHandler = (storageClient: StorageClient, config: ConvertConfig) =>
    async ({ mediaId, mediaStorageBucket, mediaRoutingKey, mediaName }: Convert) => {
        const mediaStream = await storageClient.downloadObject(mediaStorageBucket, mediaRoutingKey);
        const { workDirPath, mediaPath, mpdPath } = initializeWorkspace(mediaName);
        try {
            await writeMediaToDirectory(mediaStream, mediaPath);
            const video = await getVideoMetadata(mediaId, mediaPath);
            await convertMediaToDashStream(mediaPath, mpdPath, video);
            await uploadStreamToStorage(storageClient, mediaName, workDirPath, config);
        } finally {
            await cleanupWorkspace(workDirPath);
        }
    };

