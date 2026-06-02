import { addSubtitlesToMpd, generateThumbnailsTrack, getVideoChapters, getVideoMetadata } from '../utils';
import { NonVideoMediaError } from '../errors';

jest.mock('../../../utils/ffmpeg');
jest.mock('fs/promises', () => ({
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(''),
}));

import * as ffmpegUtils from '../../../utils/ffmpeg';
import { writeFile, readFile } from 'fs/promises';

const mockedRunFfprobe = ffmpegUtils.runFfprobe as jest.MockedFunction<typeof ffmpegUtils.runFfprobe>;
const mockedRunFfmpegWithInputOptions = ffmpegUtils.runFfmpegWithInputOptions as jest.MockedFunction<typeof ffmpegUtils.runFfmpegWithInputOptions>;
const mockedWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;
const mockedReadFile = readFile as jest.MockedFunction<typeof readFile>;

const MEDIA_PATH = '/tmp/workspace/video.mp4';

const SAMPLE_MPD = `<?xml version="1.0" encoding="utf-8"?>
<MPD type="static">
\t<Period>
\t\t<AdaptationSet id="0" contentType="video" mimeType="video/mp4">
\t\t\t<Representation id="0" mimeType="video/mp4">
\t\t\t\t<BaseURL>init_v0.m4s</BaseURL>
\t\t\t</Representation>
\t\t</AdaptationSet>
\t</Period>
</MPD>`;

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

describe('generateThumbnailsTrack', () => {
    const WORK_DIR = '/tmp/workspace';
    const thumbnailConfig = { thumbnailIntervalInSeconds: 10, thumbnailWidth: 160, thumbnailHeight: 90, thumbnailCols: 10 };

    beforeEach(() => {
        mockedRunFfmpegWithInputOptions.mockResolvedValue(undefined);
        mockedWriteFile.mockResolvedValue(undefined);
    });

    it('runs ffmpeg to generate sprite sheet from media path', async () => {
        await generateThumbnailsTrack(MEDIA_PATH, WORK_DIR, 60000, thumbnailConfig);

        expect(mockedRunFfmpegWithInputOptions).toHaveBeenCalledWith(
            MEDIA_PATH,
            expect.stringContaining('thumbnails.jpg'),
            expect.any(Array),
            expect.arrayContaining(['-vf', expect.stringContaining('fps='), '-frames:v', '1'])
        );
    });

    it('writes a thumbnails.vtt file to the work directory', async () => {
        await generateThumbnailsTrack(MEDIA_PATH, WORK_DIR, 60000, thumbnailConfig);

        expect(mockedWriteFile).toHaveBeenCalledWith(
            expect.stringContaining('thumbnails.vtt'),
            expect.stringContaining('WEBVTT'),
            'utf-8'
        );
    });

    it('generates one vtt cue per thumbnail interval', async () => {
        await generateThumbnailsTrack(MEDIA_PATH, WORK_DIR, 30000, thumbnailConfig);

        const vttContent = (mockedWriteFile.mock.calls[0][1] as string);
        const cueCount = (vttContent.match(/-->/g) ?? []).length;
        expect(cueCount).toBe(3); // 30s / 10s interval = 3 cues
    });

    it('clamps the last cue end time to media duration', async () => {
        await generateThumbnailsTrack(MEDIA_PATH, WORK_DIR, 25000, thumbnailConfig);

        const vttContent = (mockedWriteFile.mock.calls[0][1] as string);
        expect(vttContent).toContain('00:00:20.000 --> 00:00:25.000');
    });

    it('includes xywh sprite coordinates in each cue', async () => {
        await generateThumbnailsTrack(MEDIA_PATH, WORK_DIR, 20000, thumbnailConfig);

        const vttContent = (mockedWriteFile.mock.calls[0][1] as string);
        expect(vttContent).toContain('thumbnails.jpg#xywh=0,0,');
        expect(vttContent).toContain('thumbnails.jpg#xywh=160,0,');
    });

    it('produces a single cue for very short media', async () => {
        await generateThumbnailsTrack(MEDIA_PATH, WORK_DIR, 5000, thumbnailConfig);

        const vttContent = (mockedWriteFile.mock.calls[0][1] as string);
        const cueCount = (vttContent.match(/-->/g) ?? []).length;
        expect(cueCount).toBe(1);
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

    it('uses the title tag directly when it is a meaningful value', async () => {
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

    it('generates a language-based title when the subtitle title tag is absent', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [
                { codec_type: 'video', tags: {} },
                { codec_type: 'subtitle', codec_name: 'ass', index: 1, tags: { language: 'eng' } }
            ]
        } as any);

        const video = await getVideoMetadata(MEDIA_PATH);
        expect(video.subtitleStreams[0].title).toBe('English');
    });

    it('generates a language-based title when the subtitle title tag is a generic value', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [
                { codec_type: 'video', tags: {} },
                { codec_type: 'subtitle', codec_name: 'ass', index: 1, tags: { title: 'Subtitle', language: 'fra' } }
            ]
        } as any);

        const video = await getVideoMetadata(MEDIA_PATH);
        expect(video.subtitleStreams[0].title).toBe('French');
    });

    it('disambiguates same-language subtitle tracks with a counter suffix', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [
                { codec_type: 'video', tags: {} },
                { codec_type: 'subtitle', codec_name: 'ass', index: 1, tags: { language: 'eng' } },
                { codec_type: 'subtitle', codec_name: 'ass', index: 2, tags: { language: 'eng' } }
            ]
        } as any);

        const video = await getVideoMetadata(MEDIA_PATH);
        expect(video.subtitleStreams[0].title).toBe('English');
        expect(video.subtitleStreams[1].title).toBe('English (2)');
    });

    it('does not add a counter suffix when same-language tracks have distinct meaningful titles', async () => {
        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 0 },
            chapters: [],
            streams: [
                { codec_type: 'video', tags: {} },
                { codec_type: 'subtitle', codec_name: 'ass', index: 1, tags: { title: 'English SDH', language: 'eng' } },
                { codec_type: 'subtitle', codec_name: 'ass', index: 2, tags: { title: 'Forced', language: 'eng' } }
            ]
        } as any);

        const video = await getVideoMetadata(MEDIA_PATH);
        expect(video.subtitleStreams[0].title).toBe('English SDH');
        expect(video.subtitleStreams[1].title).toBe('Forced');
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

describe('addSubtitlesToMpd', () => {
    const MPD_PATH = '/tmp/workspace/output.mpd';
    const subtitleStreams = [
        { index: 1, language: 'eng', title: 'English', durationInMs: 60000 },
        { index: 2, language: 'fra', title: 'French', durationInMs: 60000 },
    ];
    const subtitlePaths = [
        '/tmp/workspace/subtitles_0_eng.vtt',
        '/tmp/workspace/subtitles_1_fra.vtt',
    ];

    beforeEach(() => {
        mockedReadFile.mockResolvedValue(SAMPLE_MPD as any);
        mockedWriteFile.mockResolvedValue(undefined);
    });

    it('does nothing when there are no subtitle paths', async () => {
        await addSubtitlesToMpd(MPD_PATH, [], []);
        expect(mockedWriteFile).not.toHaveBeenCalled();
    });

    it('writes a <Label> element for each subtitle track', async () => {
        await addSubtitlesToMpd(MPD_PATH, subtitlePaths, subtitleStreams);

        const written = mockedWriteFile.mock.calls[0][1] as string;
        expect(written).toContain('<Label>English</Label>');
        expect(written).toContain('<Label>French</Label>');
    });

    it('sets the lang attribute from the subtitle stream language', async () => {
        await addSubtitlesToMpd(MPD_PATH, subtitlePaths, subtitleStreams);

        const written = mockedWriteFile.mock.calls[0][1] as string;
        expect(written).toContain('lang="eng"');
        expect(written).toContain('lang="fra"');
    });

    it('uses the subtitle filename as the BaseURL', async () => {
        await addSubtitlesToMpd(MPD_PATH, subtitlePaths, subtitleStreams);

        const written = mockedWriteFile.mock.calls[0][1] as string;
        expect(written).toContain('<BaseURL>subtitles_0_eng.vtt</BaseURL>');
        expect(written).toContain('<BaseURL>subtitles_1_fra.vtt</BaseURL>');
    });

    it('assigns AdaptationSet ids that do not conflict with existing ids', async () => {
        await addSubtitlesToMpd(MPD_PATH, subtitlePaths, subtitleStreams);

        const written = mockedWriteFile.mock.calls[0][1] as string;
        // existing AdaptationSet has id="0", so subtitle sets get id="1" and id="2"
        expect(written).toContain('AdaptationSet id="1"');
        expect(written).toContain('AdaptationSet id="2"');
    });

    it('injects subtitle sets before the closing </Period> tag', async () => {
        await addSubtitlesToMpd(MPD_PATH, [subtitlePaths[0]], [subtitleStreams[0]]);

        const written = mockedWriteFile.mock.calls[0][1] as string;
        const subtitlePos = written.indexOf('contentType="text"');
        const periodClosePos = written.indexOf('</Period>');
        expect(subtitlePos).toBeLessThan(periodClosePos);
    });
});
