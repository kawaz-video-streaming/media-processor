import { NonVideoMediaError } from '../errors';
import { getVideoChapters, getVideoMetadata } from '../utils';

jest.mock('../../../utils/ffmpeg');

import * as ffmpegUtils from '../../../utils/ffmpeg';

const mockedRunFfprobe = ffmpegUtils.runFfprobe as jest.MockedFunction<typeof ffmpegUtils.runFfprobe>;

const MEDIA_ID = '507f1f77bcf86cd799439011';
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
            { chapterName: 'Intro', chapterStartTime: 0, chapterEndTime: 30 },
            { chapterName: 'Main', chapterStartTime: 30, chapterEndTime: 120 }
        ]);
    });

    it('defaults chapterName to "Chapter" when title tag is missing', () => {
        const result = getVideoChapters({
            chapters: [{ tags: {}, start_time: 0, end_time: 10 }]
        } as any);

        expect(result[0].chapterName).toBe('Chapter');
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
        await getVideoMetadata(MEDIA_ID, MEDIA_PATH);
        expect(mockedRunFfprobe).toHaveBeenCalledWith(MEDIA_PATH);
    });

    it('sets videoId from the mediaId parameter', async () => {
        const video = await getVideoMetadata(MEDIA_ID, MEDIA_PATH);
        expect(video.videoId).toBe(MEDIA_ID);
    });

    it('uses format.tags.title as videoName when present', async () => {
        const video = await getVideoMetadata(MEDIA_ID, MEDIA_PATH);
        expect(video.videoName).toBe('My Video');
    });

    it('falls back to filename (without extension) when title tag is absent', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [{ codec_type: 'video', tags: {} }]
        } as any);

        const video = await getVideoMetadata(MEDIA_ID, MEDIA_PATH);
        expect(video.videoName).toBe('video');
    });

    it('sets videoDuration from format.duration', async () => {
        const video = await getVideoMetadata(MEDIA_ID, MEDIA_PATH);
        expect(video.videoDuration).toBe(120);
    });

    it('throws NonVideoMediaError when there are no video streams', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [{ codec_type: 'audio', tags: {} }]
        } as any);

        await expect(getVideoMetadata(MEDIA_ID, MEDIA_PATH)).rejects.toThrow(NonVideoMediaError);
    });

    it('throws NonVideoMediaError when streams array is empty', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: []
        } as any);

        await expect(getVideoMetadata(MEDIA_ID, MEDIA_PATH)).rejects.toThrow(NonVideoMediaError);
    });

    it('only includes subtitle streams with codec_name "ass"', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [
                { codec_type: 'video', tags: {} },
                { codec_type: 'subtitle', codec_name: 'ass', index: 1, tags: { language: 'eng' } },
                { codec_type: 'subtitle', codec_name: 'subrip', index: 2, tags: { language: 'fra' } }
            ]
        } as any);

        const video = await getVideoMetadata(MEDIA_ID, MEDIA_PATH);
        expect(video.subtitleStreams).toHaveLength(1);
        expect(video.subtitleStreams[0].subtitleName).toBe('eng');
        expect(video.subtitleStreams[0].subtitleLanguage).toBe('eng');
    });

    it('uses actual FFprobe stream index for subtitleIndex', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [
                { codec_type: 'video', tags: {} },
                { codec_type: 'subtitle', codec_name: 'ass', index: 5, tags: { language: 'eng' } },
                { codec_type: 'subtitle', codec_name: 'ass', index: 8, tags: { language: 'fra' } }
            ]
        } as any);

        const video = await getVideoMetadata(MEDIA_ID, MEDIA_PATH);
        expect(video.subtitleStreams[0].subtitleIndex).toBe(5);
        expect(video.subtitleStreams[1].subtitleIndex).toBe(8);
    });

    it('sets subtitleLanguage to the raw language tag', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [
                { codec_type: 'video', tags: {} },
                { codec_type: 'subtitle', codec_name: 'ass', index: 1, tags: { language: 'jpn' } }
            ]
        } as any);

        const video = await getVideoMetadata(MEDIA_ID, MEDIA_PATH);
        expect(video.subtitleStreams[0].subtitleLanguage).toBe('jpn');
    });

    it('formats subtitle name as "title - language" when title tag is present', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [
                { codec_type: 'video', tags: {} },
                { codec_type: 'subtitle', codec_name: 'ass', index: 1, tags: { title: 'Commentary', language: 'eng' } }
            ]
        } as any);

        const video = await getVideoMetadata(MEDIA_ID, MEDIA_PATH);
        expect(video.subtitleStreams[0].subtitleName).toBe('Commentary - eng');
        expect(video.subtitleStreams[0].subtitleLanguage).toBe('eng');
    });

    it('formats audio name as "title - language" when title tag is present', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [
                { codec_type: 'video', tags: {} },
                { codec_type: 'audio', tags: { title: 'Stereo', language: 'eng', DURATION: '00:02:00.000000000' } }
            ]
        } as any);

        const video = await getVideoMetadata(MEDIA_ID, MEDIA_PATH);
        expect(video.audioStreams[0].audioName).toBe('Stereo - eng');
    });

    it('formats audio name as just language when title tag is absent', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [
                { codec_type: 'video', tags: {} },
                { codec_type: 'audio', tags: { language: 'jpn', DURATION: '00:01:00.000000000' } }
            ]
        } as any);

        const video = await getVideoMetadata(MEDIA_ID, MEDIA_PATH);
        expect(video.audioStreams[0].audioName).toBe('jpn');
    });

    it('uses actual FFprobe stream index for videoIndex', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [
                { codec_type: 'video', index: 3, tags: {} }
            ]
        } as any);

        const video = await getVideoMetadata(MEDIA_ID, MEDIA_PATH);
        expect(video.videoStreams[0].videoIndex).toBe(3);
    });

    it('uses actual FFprobe stream index for audioIndex', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [
                { codec_type: 'video', index: 0, tags: {} },
                { codec_type: 'audio', index: 2, tags: { DURATION: '00:01:00.000000000' } }
            ]
        } as any);

        const video = await getVideoMetadata(MEDIA_ID, MEDIA_PATH);
        expect(video.audioStreams[0].audioIndex).toBe(2);
    });
});


