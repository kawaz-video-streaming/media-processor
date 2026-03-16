import { StorageClient, StorageObject } from '@ido_kawaz/storage-client';
import { FfprobeData, FfprobeStream } from 'fluent-ffmpeg';
import { createReadStream, createWriteStream, mkdtempSync } from 'fs';
import { readFile, rm, writeFile } from 'fs/promises';
import { basename, extname, join, relative, resolve } from 'path';
import { isEmpty, isNil } from 'ramda';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { runFfmpeg, runFfprobe } from '../../utils/ffmpeg';
import { collectFilesRecursively, formatPath } from '../../utils/files';
import { NonVideoMediaError } from './errors';
import { AudioStream, ConvertConfig, SubtitleStream, VideoChapter, VideoMetadata, VideoStream, WorkPaths } from './types';


export const initializeWorkspace = (mediaId: string, mediaName: string): WorkPaths => {
    const workDirPath = formatPath(resolve(mkdtempSync(join(__dirname, '../../../tmp', `${mediaId}-`))));
    const mediaPath = formatPath(resolve(workDirPath, mediaName));
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

const formatVttTimestamp = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
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

const formatDurationInMs = (duration: string | null) => {
    if (isNil(duration) || typeof duration !== 'string') {
        return 0;
    }
    const [hours, minutes, seconds] = duration.split(':').map(Number);
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

const BROWSER_COMPATIBLE_VIDEO_CODECS = new Set(['h264', 'vp9', 'av1']);
const BROWSER_COMPATIBLE_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus']);

const getVideoStreams = (mediaStreams: FfprobeStream[], defaultVideoTitle: string, defaultVideoDuration: number): VideoStream[] => {
    const videoStreams = mediaStreams.filter(({ codec_type }) => codec_type === 'video').map(stream => ({
        codec: stream.codec_name ?? 'unknown',
        title: stream.tags?.title ?? defaultVideoTitle,
        duration: formatDurationInMs(stream.tags?.DURATION ?? null) ?? defaultVideoDuration
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
            codec: stream.codec_name ?? 'unknown',
            title: stream.tags?.title ?? 'Audio',
            language: stream.tags?.language ?? 'und',
            duration: formatDurationInMs(stream.tags?.DURATION ?? null) ?? defaultAudioDuration
        }));

const getSubtitleStreams = (mediaStreams: FfprobeStream[]): SubtitleStream[] =>
    mediaStreams
        .filter(({ codec_type, codec_name }) => codec_type === 'subtitle' && codec_name === 'ass')
        .map((stream, index) => ({
            index: stream.index ?? index,
            language: stream.tags?.language ?? 'und',
            title: stream.tags?.title ?? 'Subtitle',
            duration: formatDurationInMs(stream.tags?.DURATION ?? null) ?? 0
        }));

export const getVideoChapters = (mediaData: FfprobeData): VideoChapter[] => mediaData.chapters.map(chapter => ({
    chapterName: chapter.tags?.title ?? 'Chapter',
    chapterStartTime: chapter.start_time ?? 0,
    chapterEndTime: chapter.end_time ?? 0
}));


export const getVideoMetadata = async (mediaPath: string): Promise<VideoMetadata> => {
    const mediaData = await runFfprobe(mediaPath);
    const mediaTitle = (mediaData.format.tags?.title as string) ?? basename(mediaPath, extname(mediaPath));
    const mediaDuration = mediaData.format.duration ?? 0;
    const mediaChapters = getVideoChapters(mediaData);
    const mediaStreams = mediaData.streams ?? [];
    const mediaVideoStreams = getVideoStreams(mediaStreams, mediaTitle, mediaDuration);
    const mediaAudioStreams = getAudioStreams(mediaStreams, mediaDuration);
    const mediaSubtitleStreams = getSubtitleStreams(mediaStreams);
    return {
        title: mediaTitle,
        duration: mediaDuration,
        chapters: mediaChapters,
        videoStreams: mediaVideoStreams,
        audioStreams: mediaAudioStreams,
        subtitleStreams: mediaSubtitleStreams
    };
}


export const convertMediaToDashStream = async (mediaPath: string, mpdPath: string, videoMetadata: VideoMetadata) => {
    const { videoStreams, audioStreams } = videoMetadata;
    const videoCodecOption = videoStreams.every(s => BROWSER_COMPATIBLE_VIDEO_CODECS.has(s.codec)) ? '-c:v copy' : '-c:v h264_nvenc';
    const audioCodecOption = audioStreams.every(s => BROWSER_COMPATIBLE_AUDIO_CODECS.has(s.codec)) ? '-c:a copy' : '-c:a aac';
    await runFfmpeg(mediaPath, mpdPath, [
        '-f dash',
        '-map 0:v',
        '-map 0:a?',
        videoCodecOption,
        audioCodecOption,
        '-use_template', '1',
        '-use_timeline', '1',
        '-seg_duration', '15',
        '-init_seg_name', 'init_v$RepresentationID$.m4s',
        '-media_seg_name', 'seg_v$RepresentationID$_$Number%03d$.m4s'
    ], true);
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