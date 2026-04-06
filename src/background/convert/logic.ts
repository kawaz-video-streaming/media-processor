import { StorageClient } from "@ido_kawaz/storage-client";
import { Convert, ConvertConfig, WorkPaths } from "./types";
import { addSubtitlesToMpd, convertMediaToDashStream, generateChaptersTrack, generateSubtitleTracks, generateThumbnailsTrack, getVideoMetadata, uploadStreamToStorage, writeMediaToDirectory } from "./utils";

export const convertMedia = async (
    config: ConvertConfig,
    storageClient: StorageClient,
    { mediaId, mediaStorageBucket, mediaRoutingKey }: Convert,
    { mediaPath, workDirPath, mpdPath, }: WorkPaths
) => {
    const mediaStream = await storageClient.downloadObject(mediaStorageBucket, mediaRoutingKey);
    await writeMediaToDirectory(mediaStream, mediaPath);
    const videoMetadata = await getVideoMetadata(mediaPath);
    const { subtitleStreams, chapters } = videoMetadata;
    const subtitlePaths = await generateSubtitleTracks(subtitleStreams, workDirPath, mediaPath);
    await generateChaptersTrack(chapters, workDirPath);
    await generateThumbnailsTrack(mediaPath, workDirPath, videoMetadata.durationInMs, config.thumbnailConfig);
    await convertMediaToDashStream(mediaPath, mpdPath);
    await addSubtitlesToMpd(mpdPath, subtitlePaths, subtitleStreams);
    await uploadStreamToStorage(storageClient, mediaId, workDirPath, config);
    return videoMetadata;
}