import { NonVideoMediaError } from '../errors';
import { getVideoChapters, getVideoMetadata } from '../utils';

jest.mock('../../../utils/ffmpeg');

import * as ffmpegUtils from '../../../utils/ffmpeg';

const mockedRunFfprobe = ffmpegUtils.runFfprobe as jest.MockedFunction<typeof ffmpegUtils.runFfprobe>;

const MEDIA_PATH = '/tmp/workspace/video.mp4';

describe('getVideoChapters', () => {
    it('maps chapter fields correctly', () => {
        const result = getVideoChapters({
            chapters: [
                { tags: { title: 'Intro' }, start_time: 0, end_time: 30 },
                { tags: { title: 'Main' }, start_time: 30, end_time: 120 }
            ]
        } as any);

        expect(result).toEqual([
            { chapterName: 'Intro', chapterStartTime: 0, chapterEndTime: 30000 },
            { chapterName: 'Main', chapterStartTime: 30000, chapterEndTime: 120000 }
        ]);
    });

    it('defaults chapterName to "Chapter" when title tag is missing', () => {
        const result = getVideoChapters({
            chapters: [{ tags: {}, start_time: 0, end_time: 10 }]
        } as any);

        expect(result[0].chapterName).toBe('Chapter 1');
    });

    it('defaults start and end times to 0 when missing', () => {
        const result = getVideoChapters({
            chapters: [{ tags: { title: 'X' } }]
        } as any);

        expect(result[0].chapterStartTime).toBe(0);
        expect(result[0].chapterEndTime).toBe(0);
    });

    it('returns empty array when there are no chapters', () => {
        expect(getVideoChapters({ chapters: [] } as any)).toEqual([]);
    });
});

describe('getVideoMetadata', () => {
    beforeEach(() => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: { title: 'My Video' }, duration: 120 },
            chapters: [],
            streams: [
                { codec_type: 'video', tags: { DURATION: '00:02:00.000000000' } }
            ]
        } as any);
    });

    it('probes the media file at the given path', async () => {
        await getVideoMetadata(MEDIA_PATH);
        expect(mockedRunFfprobe).toHaveBeenCalledWith(MEDIA_PATH);
    });

    it('uses format.tags.title as title when present', async () => {
        const video = await getVideoMetadata(MEDIA_PATH);
        expect(video.name).toBe('My Video');
    });

    it('falls back to filename (without extension) when title tag is absent', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [{ codec_type: 'video', tags: {} }]
        } as any);

        const video = await getVideoMetadata(MEDIA_PATH);
        expect(video.name).toBe('video');
    });

    it('sets duration from format.duration', async () => {
        const video = await getVideoMetadata(MEDIA_PATH);
        expect(video.durationInMs).toBe(120000);
    });

    it('throws NonVideoMediaError when there are no video streams', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [{ codec_type: 'audio', tags: {} }]
        } as any);

        await expect(getVideoMetadata(MEDIA_PATH)).rejects.toThrow(NonVideoMediaError);
    });

    it('throws NonVideoMediaError when streams array is empty', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: []
        } as any);

        await expect(getVideoMetadata(MEDIA_PATH)).rejects.toThrow(NonVideoMediaError);
    });

    it('includes subtitle streams with codec_name "ass", "subrip", or "vtt"', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [
                { codec_type: 'video', tags: {} },
                { codec_type: 'subtitle', codec_name: 'ass', index: 1, tags: { language: 'eng' } },
                { codec_type: 'subtitle', codec_name: 'subrip', index: 2, tags: { language: 'fra' } },
                { codec_type: 'subtitle', codec_name: 'dvd_subtitle', index: 3, tags: { language: 'deu' } }
            ]
        } as any);

        const video = await getVideoMetadata(MEDIA_PATH);
        expect(video.subtitleStreams).toHaveLength(2);
        expect(video.subtitleStreams[0].language).toBe('eng');
        expect(video.subtitleStreams[1].language).toBe('fra');
    });

    it('uses actual FFprobe stream index for subtitle index', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [
                { codec_type: 'video', tags: {} },
                { codec_type: 'subtitle', codec_name: 'ass', index: 5, tags: { language: 'eng' } },
                { codec_type: 'subtitle', codec_name: 'ass', index: 8, tags: { language: 'fra' } }
            ]
        } as any);

        const video = await getVideoMetadata(MEDIA_PATH);
        expect(video.subtitleStreams[0].index).toBe(5);
        expect(video.subtitleStreams[1].index).toBe(8);
    });

    it('sets subtitle language to the raw language tag', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [
                { codec_type: 'video', tags: {} },
                { codec_type: 'subtitle', codec_name: 'ass', index: 1, tags: { language: 'jpn' } }
            ]
        } as any);

        const video = await getVideoMetadata(MEDIA_PATH);
        expect(video.subtitleStreams[0].language).toBe('jpn');
    });

    it('sets subtitle title from title tag when present', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [
                { codec_type: 'video', tags: {} },
                { codec_type: 'subtitle', codec_name: 'ass', index: 1, tags: { title: 'Commentary', language: 'eng' } }
            ]
        } as any);

        const video = await getVideoMetadata(MEDIA_PATH);
        expect(video.subtitleStreams[0].title).toBe('Commentary');
        expect(video.subtitleStreams[0].language).toBe('eng');
    });

    it('sets audio title from title tag when present', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [
                { codec_type: 'video', tags: {} },
                { codec_type: 'audio', tags: { title: 'Stereo', language: 'eng', DURATION: '00:02:00.000000000' } }
            ]
        } as any);

        const video = await getVideoMetadata(MEDIA_PATH);
        expect(video.audioStreams[0].title).toBe('Stereo');
    });

    it('defaults audio title to "Audio" when title tag is absent', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [
                { codec_type: 'video', tags: {} },
                { codec_type: 'audio', tags: { language: 'jpn', DURATION: '00:01:00.000000000' } }
            ]
        } as any);

        const video = await getVideoMetadata(MEDIA_PATH);
        expect(video.audioStreams[0].title).toBe('Audio');
    });
});


