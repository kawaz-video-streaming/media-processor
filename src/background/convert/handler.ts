import { StorageClient } from "@ido_kawaz/storage-client";
import { Convert, ConvertConfig } from "./types";
import { addSubtitlesToMpd, cleanupWorkspace, convertMediaToDashStream, generateChaptersTrack, generateSubtitleTracks, getVideoMetadata, initializeWorkspace, uploadStreamToStorage, writeMediaToDirectory } from "./utils";

export const convertMediaHandler = (storageClient: StorageClient, config: ConvertConfig) =>
    async ({ mediaStorageBucket, mediaRoutingKey, mediaName, mediaId }: Convert) => {
        const mediaStream = await storageClient.downloadObject(mediaStorageBucket, mediaRoutingKey);
        const { workDirPath, mediaPath, mpdPath } = initializeWorkspace(mediaId, mediaName);
        try {
            await writeMediaToDirectory(mediaStream, mediaPath);
            const videoMetadata = await getVideoMetadata(mediaPath);
            const subtitlePaths = await generateSubtitleTracks(videoMetadata.subtitleStreams, workDirPath, mediaPath);
            await generateChaptersTrack(videoMetadata.chapters, workDirPath);
            await convertMediaToDashStream(mediaPath, mpdPath, videoMetadata);
            await addSubtitlesToMpd(mpdPath, subtitlePaths, videoMetadata.subtitleStreams);
            await uploadStreamToStorage(storageClient, mediaId, workDirPath, config);
            return videoMetadata
        } finally {
            await cleanupWorkspace(workDirPath);
        }
    };

