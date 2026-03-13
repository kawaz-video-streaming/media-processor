import { StorageClient } from '@ido_kawaz/storage-client';
import { FfprobeData, FfprobeStream } from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { isEmpty, isNotEmpty } from 'ramda';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { RunInBatches } from '../../utils/batches';
import { runFfmpeg, runFfprobe } from '../../utils/ffmpeg';
import { collectFilesRecursively, formatPath } from '../../utils/files';
import { NonVideoMediaError } from './errors';
import { AudioStream, ConvertConfig, SubtitleStream, Video, VideoChapter, VideoStream, WorkPaths } from './types';

const removeExtension = (fileName: string) => fileName.replace(path.extname(fileName), '');

export const initializeWorkspace = (mediaName: string): WorkPaths => {
    const workDirPath = formatPath(path.resolve(fs.mkdtempSync(path.join(__dirname, '../../../tmp', `${removeExtension(mediaName)}-`))));
    const mediaPath = formatPath(path.resolve(workDirPath, mediaName));
    const mpdPath = formatPath(path.resolve(workDirPath, 'output.mpd'));
    return { mediaPath, mpdPath, workDirPath };
}

export const cleanupWorkspace = (workDirPath: string) =>
    fs.promises.rm(workDirPath, { recursive: true, force: true });

export const writeMediaToDirectory = (mediaStream: Readable, mediaPath: string) =>
    pipeline(mediaStream, fs.createWriteStream(mediaPath));

const formatDurationInMs = (duration: any) => {
    if (typeof duration !== 'string') {
        return 0;
    }
    const [hours, minutes, seconds] = duration.split(':').map(Number);
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

const getVideoStreams = (mediaStreams: FfprobeStream[], defaultVideoName: string, defaultVideoDuration: number): VideoStream[] => {
    const videoStreams = mediaStreams.filter(({ codec_type }) => codec_type === 'video').map((stream, index) => ({
        videoIndex: stream.index ?? index,
        videoName: (stream.tags.title as string) ?? defaultVideoName,
        videoDuration: formatDurationInMs(stream.tags.DURATION) ?? defaultVideoDuration
    }));
    if (isEmpty(videoStreams)) {
        throw new NonVideoMediaError();
    }
    return videoStreams;
}

const getAudioStreams = (mediaStreams: FfprobeStream[], defaultAudioDuration: number): AudioStream[] =>
    mediaStreams
        .filter(({ codec_type }) => codec_type === 'audio')
        .map((stream, index) => ({
            audioIndex: stream.index ?? index,
            audioName: `${stream.tags?.title ? `${stream.tags.title} - ` : ''}${stream.tags?.language ?? 'unknown language'}`,
            audioDuration: formatDurationInMs(stream.tags.DURATION) ?? defaultAudioDuration
        }));

const getSubtitleStreams = (mediaStreams: FfprobeStream[]): SubtitleStream[] =>
    mediaStreams
        .filter(({ codec_type, codec_name }) => codec_type === 'subtitle' && codec_name === 'ass')
        .map((stream, index) => ({
            subtitleIndex: stream.index ?? index,
            subtitleLanguage: stream.tags?.language ?? 'und',
            subtitleName: `${stream.tags?.title ? `${stream.tags.title} - ` : ''}${stream.tags?.language ?? 'unknown language'}`,
            subtitleDuration: formatDurationInMs(stream.tags.DURATION) ?? 0
        }));

export const getVideoChapters = (mediaData: FfprobeData): VideoChapter[] => mediaData.chapters.map(chapter => ({
    chapterName: chapter.tags?.title as string ?? 'Chapter',
    chapterStartTime: chapter.start_time ?? 0,
    chapterEndTime: chapter.end_time ?? 0
}));


export const getVideoMetadata = async (mediaId: string, mediaPath: string): Promise<Video> => {
    const mediaData = await runFfprobe(mediaPath);
    const mediaName = (mediaData.format.tags?.title as string) ?? path.basename(mediaPath, path.extname(mediaPath));
    const mediaDuration = mediaData.format.duration ?? 0;
    const mediaChapters = getVideoChapters(mediaData);
    const mediaStreams = mediaData.streams ?? [];
    const mediaVideoStreams = getVideoStreams(mediaStreams, mediaName, mediaDuration);
    const mediaAudioStreams = getAudioStreams(mediaStreams, mediaDuration);
    const mediaSubtitleStreams = getSubtitleStreams(mediaStreams);
    return {
        videoId: mediaId,
        videoName: mediaName,
        videoDuration: mediaDuration,
        videoChapters: mediaChapters,
        videoStreams: mediaVideoStreams,
        audioStreams: mediaAudioStreams,
        subtitleStreams: mediaSubtitleStreams
    };
}


export const convertMediaToDashStream = async (mediaPath: string, mpdPath: string, video: Video) => {
    const { videoStreams, audioStreams, subtitleStreams } = video;
    const subtitleOptions = subtitleStreams.flatMap((stream) => ['-map', `0:${stream.subtitleIndex}`]);
    const subtitleCodecOptions = isNotEmpty(subtitleStreams) ? ['-c:s mov_text'] : [];
    const videoMetadataOptions = videoStreams.flatMap((stream) => [`-map_metadata:s:${stream.videoIndex}`, `0:s:${stream.videoIndex}`]);
    const audioMetadataOptions = audioStreams.flatMap((stream) => [`-map_metadata:s:${stream.audioIndex}`, `0:s:${stream.audioIndex}`]);
    const subtitleMetadataOptions = subtitleStreams.flatMap((stream) => [`-map_metadata:s:${stream.subtitleIndex}`, `0:s:${stream.subtitleIndex}`]);
    await runFfmpeg(mediaPath, mpdPath, [
        '-f dash',
        '-map 0:v',
        '-map 0:a?',
        ...subtitleOptions,
        '-c:v copy',
        '-c:a copy',
        ...subtitleCodecOptions,
        ...videoMetadataOptions,
        ...audioMetadataOptions,
        ...subtitleMetadataOptions,
        '-use_template', '1',
        '-use_timeline', '1',
        '-seg_duration', '15',
        '-init_seg_name', 'init_v$RepresentationID$.m4s',
        '-media_seg_name', 'seg_v$RepresentationID$_$Number%03d$.m4s'
    ], true);
    await fs.promises.unlink(mediaPath);
}


const createUploadFileToStorage = (storageClient: StorageClient, workDirPath: string, mediaName: string, uploadBucket: string) => async (filePath: string) => {
    const relativePath = path.relative(workDirPath, filePath);
    const uploadKey = `${removeExtension(mediaName)}/${formatPath(relativePath)}`;

    await storageClient.uploadObject(uploadBucket, uploadKey, fs.createReadStream(filePath));
}

export const uploadStreamToStorage = async (
    storageClient: StorageClient,
    mediaName: string,
    workDirPath: string,
    { vodBucketName, uploadingBatchSize }: ConvertConfig,
) => {
    const uploadBucket = vodBucketName;
    await storageClient.ensureBucket(uploadBucket);
    const filesToUpload = await collectFilesRecursively(workDirPath);
    const uploadFileToStorage = createUploadFileToStorage(storageClient, workDirPath, mediaName, uploadBucket);
    const generateProgressMessage = (index: number, totalBatches: number) => `Uploaded ${index / totalBatches * 100}% of files to storage (${index}/${totalBatches} batches)`;
    await RunInBatches(filesToUpload, uploadingBatchSize, uploadFileToStorage, generateProgressMessage);
};