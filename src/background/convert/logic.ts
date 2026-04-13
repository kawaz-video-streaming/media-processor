import { StorageClient } from "@ido_kawaz/storage-client";
import { Convert, ConvertConfig, Progress, WorkPaths } from "./types";
import { addSubtitlesToMpd, convertMediaToDashStream, generateChaptersTrack, generateSubtitleTracks, generateThumbnailsTrack, getVideoMetadata, uploadStreamToStorage, writeMediaToDirectory } from "./utils";
import { AmqpClient } from "@ido_kawaz/amqp-client";

export const convertMedia = async (
    amqpClient: AmqpClient,
    config: ConvertConfig,
    storageClient: StorageClient,
    { mediaId, mediaStorageBucket, mediaRoutingKey }: Convert,
    { mediaPath, workDirPath, mpdPath, }: WorkPaths
) => {
    const mediaStream = await storageClient.downloadObject(mediaStorageBucket, mediaRoutingKey);
    await writeMediaToDirectory(mediaStream, mediaPath);
    amqpClient.publish<Progress>('progress', 'progress.media', { mediaId, percentage: 30, status: 'processing' });
    const videoMetadata = await getVideoMetadata(mediaPath);
    const { subtitleStreams, chapters } = videoMetadata;
    const subtitlePaths = await generateSubtitleTracks(subtitleStreams, workDirPath, mediaPath);
    await generateChaptersTrack(chapters, workDirPath);
    await generateThumbnailsTrack(mediaPath, workDirPath, videoMetadata.durationInMs, config.thumbnailConfig);
    amqpClient.publish<Progress>('progress', 'progress.media', { mediaId, percentage: 50, status: 'processing' });
    await convertMediaToDashStream(mediaPath, mpdPath, videoMetadata.audioStreams, amqpClient, mediaId);
    await addSubtitlesToMpd(mpdPath, subtitlePaths, subtitleStreams);
    amqpClient.publish<Progress>('progress', 'progress.media', { mediaId, percentage: 85, status: 'processing' });
    await uploadStreamToStorage(storageClient, mediaId, workDirPath, config);
    return videoMetadata;
}