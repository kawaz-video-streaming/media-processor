import { StorageClient } from '@ido_kawaz/storage-client';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { ConvertMediaConfig, WorkPaths } from './index';
import { runFfmpeg, runFfprobe } from '../../utils/ffmpeg';
import { collectFilesRecursively, formatPath } from '../../utils/files';
import { RunInBatches } from '../../utils/batches';

const removeExtension = (fileName: string) => fileName.replace(path.extname(fileName), '');

export const initializeWorkspace = (mediaName: string): WorkPaths => {
    const workDirPath = formatPath(path.resolve(fs.mkdtempSync(path.join(__dirname, '../../../tmp', `${removeExtension(mediaName)}-`))));
    const mediaPath = formatPath(path.resolve(workDirPath, mediaName));
    const mpdPath = formatPath(path.resolve(workDirPath, 'output.mpd'));
    return { mediaPath, mpdPath, workDirPath };
}

export const cleanupWorkspace = (workDirPath: string) =>
    fs.promises.rm(workDirPath, { recursive: true, force: true });

export const createSubtitlePath = (workDirPath: string, index: number, language: string) =>
    formatPath(path.resolve(workDirPath, `subtitles_${index}_${language}.vtt`));

export const writeMediaToDirectory = (mediaStream: Readable, mediaPath: string) =>
    pipeline(mediaStream, fs.createWriteStream(mediaPath));

const createSubtitleFileToWebVttOutputOptions = (subtitleStreamIndex: number) => [
    '-map', `0:${subtitleStreamIndex}`,
    '-c:s', 'webvtt'
]

export const generateSubtitleTracks = async (workDirPath: string, mediaPath: string) => {
    const mediaData = await runFfprobe(mediaPath);
    const subtitleStreams = (mediaData.streams ?? []).filter(stream => stream.codec_type === 'subtitle');
    await Promise.all(subtitleStreams
        .map(async (stream, index) => {
            const subtitleLanguage = stream.tags?.language ?? 'unknown';
            const subtitlePath = createSubtitlePath(workDirPath, index, subtitleLanguage);
            await runFfmpeg(mediaPath, subtitlePath, createSubtitleFileToWebVttOutputOptions(stream.index));
        }));
}

export const convertMediaToDashStream = async (mediaSource: string | Readable, mpdPath: string) => {
    await runFfmpeg(mediaSource, mpdPath, [
        '-f dash',
        '-map 0:v',
        '-map 0:a?',
        '-c:v copy',
        '-c:a copy',
        '-use_template', '1',
        '-use_timeline', '1',
        '-seg_duration', '15',
        '-init_seg_name', 'init_$RepresentationID$.m4s',
        '-media_seg_name', 'seg_$RepresentationID$_$Number%03d$.m4s'
    ], true);
    if (typeof mediaSource === 'string') {
        await fs.promises.unlink(mediaSource);
    }
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
    { vodBucketName, uploadingBatchSize }: ConvertMediaConfig,
) => {
    const uploadBucket = vodBucketName;
    await storageClient.ensureBucket(uploadBucket);
    const filesToUpload = await collectFilesRecursively(workDirPath);
    const uploadFileToStorage = createUploadFileToStorage(storageClient, workDirPath, mediaName, uploadBucket);
    const generateProgressMessage = (index: number, totalBatches: number) => `Uploaded ${index / totalBatches * 100}% of files to storage (${index}/${totalBatches} batches)`;
    await RunInBatches(filesToUpload, uploadingBatchSize, uploadFileToStorage, generateProgressMessage);
};