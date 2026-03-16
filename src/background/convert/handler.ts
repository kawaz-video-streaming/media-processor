import { StorageClient } from "@ido_kawaz/storage-client";
import { Convert, ConvertConfig } from "./types";
import { addChaptersToMpd, addSubtitlesToMpd, cleanupWorkspace, convertMediaToDashStream, generateChaptersTrack, generateSubtitleTracks, getVideoMetadata, initializeWorkspace, uploadStreamToStorage, writeMediaToDirectory } from "./utils";

export const convertMediaHandler = (storageClient: StorageClient, config: ConvertConfig) =>
    async ({ mediaId, mediaStorageBucket, mediaRoutingKey, mediaName }: Convert) => {
        const mediaStream = await storageClient.downloadObject(mediaStorageBucket, mediaRoutingKey);
        const { workDirPath, mediaPath, mpdPath } = initializeWorkspace(mediaName);
        try {
            await writeMediaToDirectory(mediaStream, mediaPath);
            const video = await getVideoMetadata(mediaId, mediaPath);
            const subtitlePaths = await generateSubtitleTracks(video.subtitleStreams, workDirPath, mediaPath);
            const chaptersPath = await generateChaptersTrack(video.videoChapters, workDirPath);
            await convertMediaToDashStream(mediaPath, mpdPath, video);
            await addSubtitlesToMpd(mpdPath, subtitlePaths, video.subtitleStreams);
            await addChaptersToMpd(mpdPath, chaptersPath);
            await uploadStreamToStorage(storageClient, mediaName, workDirPath, config);
        } finally {
            await cleanupWorkspace(workDirPath);
        }
    };

