import { StorageClient, StorageObject } from '@ido_kawaz/storage-client';
import { FfprobeData, FfprobeStream } from 'fluent-ffmpeg';
import { createReadStream, createWriteStream, mkdtempSync } from 'fs';
import { readFile, rm, unlink, writeFile } from 'fs/promises';
import { basename, extname, join, relative, resolve } from 'path';
import { isEmpty, isNil } from 'ramda';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { isEncoderAvailable, runFfmpeg, runFfprobe } from '../../utils/ffmpeg';
import { collectFilesRecursively, formatPath } from '../../utils/files';
import { NonVideoMediaError } from './errors';
import { AudioStream, Convert, ConvertConfig, SubtitleStream, ThumbnailConfig, VideoMetadata, VideoChapter, VideoStream, WorkPaths } from './types';


export const initializeWorkspace = ({ mediaId, mediaFileName }: Convert): WorkPaths => {
    const workDirPath = formatPath(resolve(mkdtempSync(join(__dirname, '../../../tmp', `${mediaId}-`))));
    const mediaPath = formatPath(resolve(workDirPath, mediaFileName));
    const mpdPath = formatPath(resolve(workDirPath, 'output.mpd'));
    return { mediaPath, mpdPath, workDirPath };
}

export const cleanupWorkspace = async (workDirPath: string) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await rm(workDirPath, { recursive: true, force: true });
            break;
        } catch (err) {
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }
    }
}

export const writeMediaToDirectory = (mediaStream: Readable, mediaPath: string) =>
    pipeline(mediaStream, createWriteStream(mediaPath));

const createSubtitlePath = (workDirPath: string, index: number, language: string) =>
    formatPath(resolve(workDirPath, `subtitles_${index}_${language}.vtt`));

const createSubtitleFileToWebVttOutputOptions = (subtitleStreamIndex: number) => [
    '-map', `0:${subtitleStreamIndex}`,
    '-c:s', 'webvtt'
];

export const generateSubtitleTracks = (subtitleStreams: SubtitleStream[], workDirPath: string, mediaPath: string): Promise<string[]> =>
    Promise.all(subtitleStreams.map(async (stream, index) => {
        const subtitlePath = createSubtitlePath(workDirPath, index, stream.language);
        await runFfmpeg(mediaPath, subtitlePath, createSubtitleFileToWebVttOutputOptions(stream.index));
        return subtitlePath;
    }));

const formatVttTimestamp = (milliseconds: number): string => {
    const h = Math.floor(milliseconds / 3600000);
    const m = Math.floor((milliseconds % 3600000) / 60000);
    const s = (milliseconds % 60000) / 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
};

export const generateChaptersTrack = async (chapters: VideoChapter[], workDirPath: string): Promise<void> => {
    if (isEmpty(chapters)) {
        return;
    }
    const lines = ['WEBVTT', ''];
    chapters.forEach((chapter, index) => {
        lines.push(`Chapter ${index + 1}`);
        lines.push(`${formatVttTimestamp(chapter.chapterStartTime)} --> ${formatVttTimestamp(chapter.chapterEndTime)}`);
        lines.push(chapter.chapterName);
        lines.push('');
    });
    const chaptersPath = formatPath(resolve(workDirPath, 'chapters.vtt'));
    await writeFile(chaptersPath, lines.join('\n'), 'utf-8');
};

export const generateThumbnailsTrack = async (
    mediaPath: string,
    workDirPath: string,
    durationInMs: number,
    { thumbnailIntervalInSeconds, thumbnailWidth, thumbnailHeight, thumbnailCols }: ThumbnailConfig
): Promise<void> => {
    const spriteSheetPath = formatPath(resolve(workDirPath, 'thumbnails.jpg'));
    const vttPath = formatPath(resolve(workDirPath, 'thumbnails.vtt'));

    const totalFrames = Math.max(1, Math.ceil(durationInMs / 1000 / thumbnailIntervalInSeconds));
    const rows = Math.ceil(totalFrames / thumbnailCols);

    await runFfmpeg(mediaPath, spriteSheetPath, [
        '-vf', `fps=1/${thumbnailIntervalInSeconds},scale=${thumbnailWidth}:${thumbnailHeight},tile=${thumbnailCols}x${rows}`,
        '-frames:v', '1',
        '-q:v', '3'
    ]);

    const lines = ['WEBVTT', ''];
    for (let i = 0; i < totalFrames; i++) {
        const startMs = i * thumbnailIntervalInSeconds * 1000;
        const endMs = Math.min((i + 1) * thumbnailIntervalInSeconds * 1000, durationInMs);
        const x = (i % thumbnailCols) * thumbnailWidth;
        const y = Math.floor(i / thumbnailCols) * thumbnailHeight;
        lines.push(
            `${formatVttTimestamp(startMs)} --> ${formatVttTimestamp(endMs)}`,
            `thumbnails.jpg#xywh=${x},${y},${thumbnailWidth},${thumbnailHeight}`,
            ''
        );
    }
    await writeFile(vttPath, lines.join('\n'), 'utf-8');
};

const formatDurationInMs = (duration: any) => {
    if (typeof duration !== 'string' || isNil<string>(duration)) {
        return undefined;
    }
    const [hours, minutes, seconds] = duration.split(':').map(Number);
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

const getVideoStreams = (mediaStreams: FfprobeStream[], defaultVideoTitle: string, defaultVideoDuration: number): VideoStream[] => {
    const videoStreams = mediaStreams.filter(({ codec_type }) => codec_type === 'video').map(stream => ({
        title: stream.tags?.title ?? defaultVideoTitle,
        durationInMs: formatDurationInMs(stream.tags?.DURATION) ?? defaultVideoDuration
    }));
    if (isEmpty(videoStreams)) {
        throw new NonVideoMediaError();
    }
    return videoStreams;
}

const getAudioStreams = (mediaStreams: FfprobeStream[], defaultAudioDuration: number): AudioStream[] =>
    mediaStreams
        .filter(({ codec_type }) => codec_type === 'audio')
        .map(stream => ({
            title: stream.tags?.title ?? 'Audio',
            language: stream.tags?.language ?? 'und',
            durationInMs: formatDurationInMs(stream.tags?.DURATION) ?? defaultAudioDuration
        }));

const getSubtitleStreams = (mediaStreams: FfprobeStream[], defaultSubtitleDuration: number): SubtitleStream[] =>
    mediaStreams
        .filter(({ codec_type, codec_name }) => codec_type === 'subtitle' && ['ass', 'subrip', 'vtt'].includes(codec_name ?? ''))
        .map((stream, index) => ({
            index: stream.index ?? index,
            language: stream.tags?.language ?? 'und',
            title: stream.tags?.title ?? 'Subtitle',
            durationInMs: formatDurationInMs(stream.tags?.DURATION) ?? defaultSubtitleDuration
        }));

export const getVideoChapters = (mediaData: FfprobeData): VideoChapter[] => mediaData.chapters.map((chapter, index) => ({
    chapterName: chapter.tags?.title ?? `Chapter ${index + 1}`,
    chapterStartTime: (chapter.start_time ?? 0) * 1000,
    chapterEndTime: (chapter.end_time ?? 0) * 1000
}));

export const getVideoMetadata = async (mediaPath: string): Promise<VideoMetadata> => {
    const mediaData = await runFfprobe(mediaPath);
    const mediaName = (mediaData.format.tags?.title as string) ?? basename(mediaPath, extname(mediaPath));
    const mediaDurationInMs = (mediaData.format.duration ?? 0) * 1000;
    const mediaChapters = getVideoChapters(mediaData);
    const mediaStreams = mediaData.streams ?? [];
    const mediaVideoStreams = getVideoStreams(mediaStreams, mediaName, mediaDurationInMs);
    const mediaAudioStreams = getAudioStreams(mediaStreams, mediaDurationInMs);
    const mediaSubtitleStreams = getSubtitleStreams(mediaStreams, mediaDurationInMs);
    return {
        name: mediaName,
        durationInMs: mediaDurationInMs,
        chapters: mediaChapters,
        videoStreams: mediaVideoStreams,
        audioStreams: mediaAudioStreams,
        subtitleStreams: mediaSubtitleStreams
    };
}


const buildDashOutputOptions = (videoEncoder: string, extraVideoOptions: string[] = []) => [
    '-f dash',
    '-avoid_negative_ts', 'make_zero',
    '-map 0:v',
    '-map 0:a?',
    '-c:v', videoEncoder,
    ...extraVideoOptions,
    '-c:a', 'aac',
    '-af', 'aresample=async=1:first_pts=0',
    '-use_template', '1',
    '-use_timeline', '1',
    '-seg_duration', '15',
    '-init_seg_name', 'init_v$RepresentationID$.m4s',
    '-media_seg_name', 'seg_v$RepresentationID$_$Number%03d$.m4s'
];

export const convertMediaToDashStream = async (mediaPath: string, mpdPath: string) => {
    const videoEncoder = await isEncoderAvailable('h264_nvenc') ? 'h264_nvenc' : 'h264';
    const extraVideoOptions = videoEncoder === 'h264_nvenc' ? ['-pix_fmt', 'yuv420p'] : [];
    await runFfmpeg(mediaPath, mpdPath, buildDashOutputOptions(videoEncoder, extraVideoOptions), true);
    await unlink(mediaPath);
}

export const addSubtitlesToMpd = async (mpdPath: string, subtitlePaths: string[], subtitleStreams: SubtitleStream[]) => {
    if (isEmpty(subtitlePaths)) {
        return;
    }
    const mpdContent = await readFile(mpdPath, 'utf-8');
    const idMatches = [...mpdContent.matchAll(/id="(\d+)"/g)];
    const maxId = idMatches.reduce((max, match) => Math.max(max, parseInt(match[1])), -1);
    const subtitleSets = subtitlePaths.map((subtitlePath, index) => {
        const id = maxId + 1 + index;
        const { language: subtitleLanguage } = subtitleStreams[index];
        const fileName = basename(subtitlePath);
        return [
            `\t\t<AdaptationSet id="${id}" contentType="text" mimeType="text/vtt" lang="${subtitleLanguage}">`,
            `\t\t\t<Role schemeIdUri="urn:mpeg:dash:role:2011" value="subtitle"/>`,
            `\t\t\t<Representation id="${id}" mimeType="text/vtt" codecs="wvtt">`,
            `\t\t\t\t<BaseURL>${fileName}</BaseURL>`,
            `\t\t\t</Representation>`,
            `\t\t</AdaptationSet>`,
        ].join('\n');
    }).join('\n');
    const modified = mpdContent.replace('\n\t</Period>', `\n${subtitleSets}\n\t</Period>`);
    await writeFile(mpdPath, modified, 'utf-8');
}

const createStorageObjectsToUpload = (workDirPath: string, mediaId: string, filesPaths: string[]): StorageObject[] =>
    filesPaths.map(filePath => {
        const relativePath = relative(workDirPath, filePath);
        const uploadKey = `${mediaId}/${formatPath(relativePath)}`;
        return { key: uploadKey, data: createReadStream(filePath) };
    });

export const uploadStreamToStorage = async (
    storageClient: StorageClient,
    mediaId: string,
    workDirPath: string,
    { vodBucketName }: ConvertConfig,
) => {
    const uploadBucket = vodBucketName;
    await storageClient.ensureBucket(uploadBucket);
    const filesToUpload = await collectFilesRecursively(workDirPath);
    const storageObjects = createStorageObjectsToUpload(workDirPath, mediaId, filesToUpload);
    await storageClient.uploadObjects(uploadBucket, storageObjects);
};