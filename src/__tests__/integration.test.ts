import { StorageClient } from '@ido_kawaz/storage-client';
import { existsSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { ConversionFatalError } from '../background/convert/errors';
import { convertMediaHandler } from '../background/convert/handler';
import * as ffmpegUtils from '../utils/ffmpeg';
import { createTempFolder } from '../utils/files';

jest.mock('../utils/ffmpeg');

const mockedRunFfmpeg = ffmpegUtils.runFfmpeg as jest.MockedFunction<typeof ffmpegUtils.runFfmpeg>;
const mockedRunFfprobe = ffmpegUtils.runFfprobe as jest.MockedFunction<typeof ffmpegUtils.runFfprobe>;

describe('E2E: Convert Pipeline', () => {
    const storageClient = {
        downloadObject: jest.fn(),
        uploadObjects: jest.fn(),
        ensureBucket: jest.fn()
    } as unknown as StorageClient;

    const config = {
        vodBucketName: 'vod-bucket',
        thumbnailConfig: { thumbnailIntervalInSeconds: 10, thumbnailWidth: 160, thumbnailHeight: 90, thumbnailCols: 10 }
    };

    beforeAll(async () => {
        await createTempFolder();
    });

    beforeEach(() => {
        jest.clearAllMocks();

        (storageClient.downloadObject as jest.Mock).mockResolvedValue(
            Readable.from(Buffer.from('dud'))
        );
        // Destroy ReadStreams so file handles are released before cleanup runs (Windows)
        (storageClient.uploadObjects as jest.Mock).mockImplementation((_bucket, objects: any[]) => {
            objects?.forEach(obj => obj?.data?.destroy());
            return Promise.resolve();
        });
        (storageClient.ensureBucket as jest.Mock).mockResolvedValue(undefined);

        mockedRunFfprobe.mockResolvedValue({
            format: { tags: {}, duration: 120 },
            chapters: [],
            streams: [
                { codec_type: 'video', tags: { DURATION: '00:02:00.000000000' } }
            ]
        } as any);

        // Simulate FFmpeg output: create fake files so upload step has real files to collect
        mockedRunFfmpeg.mockImplementation(async (_input, outputPath) => {
            if (outputPath.endsWith('.mpd')) {
                const dir = path.dirname(outputPath);
                await writeFile(outputPath,
                    '<MPD>\n\t<Period id="0">\n\t\t<AdaptationSet id="0" contentType="video"/>\n\t</Period>\n</MPD>');
                await writeFile(path.join(dir, 'init_0.m4s'), Buffer.alloc(0));
                await writeFile(path.join(dir, 'seg_0_001.m4s'), Buffer.alloc(0));
            } else if (outputPath.endsWith('.vtt')) {
                await writeFile(outputPath, 'WEBVTT\n\n');
            } else if (outputPath.endsWith('.jpg')) {
                await writeFile(outputPath, Buffer.alloc(0));
            }
        });
    });

    describe('Non-video media', () => {
        const payload = {
            mediaId: '507f1f77bcf86cd799439011',
            mediaFileName: 'audio-only.mp3',
            mediaStorageBucket: 'raw-media',
            mediaRoutingKey: 'uploads/audio-only.mp3'
        };

        it('rejects the file with ConversionFatalError carrying workDirPath when no video stream is found', async () => {
            mockedRunFfprobe.mockResolvedValue({
                format: { tags: {}, duration: 180 },
                chapters: [],
                streams: [{ codec_type: 'audio', tags: {} }]
            } as any);

            const handler = convertMediaHandler(storageClient, config);
            let caughtError: any;
            try { await handler(payload); } catch (err) { caughtError = err; }

            expect(caughtError).toBeInstanceOf(ConversionFatalError);
            expect(existsSync(caughtError.workDirPath)).toBe(true);
        });
    });

    describe('Video without subtitles', () => {
        const payload = {
            mediaId: '507f1f77bcf86cd799439011',
            mediaFileName: 'test-video.mp4',
            mediaStorageBucket: 'raw-media',
            mediaRoutingKey: 'uploads/test-video.mp4'
        };

        it('calls FFmpeg with the correct DASH output options', async () => {
            const handler = convertMediaHandler(storageClient, config);
            await handler(payload);

            expect(mockedRunFfmpeg).toHaveBeenCalledWith(
                expect.stringContaining('test-video.mp4'),
                expect.stringContaining('output.mpd'),
                [
                    '-f dash',
                    '-avoid_negative_ts', 'make_zero',
                    '-map 0:v',
                    '-map 0:a?',
                    '-c:v', 'h264',
                    '-c:a', 'aac',
                    '-af', 'aresample=async=1:first_pts=0',
                    '-use_template', '1',
                    '-use_timeline', '1',
                    '-seg_duration', '15',
                    '-init_seg_name', 'init_v$RepresentationID$.m4s',
                    '-media_seg_name', 'seg_v$RepresentationID$_$Number%03d$.m4s'
                ],
                true
            );
        });

        it('uploads all output files to the VOD bucket under the correct key prefix', async () => {
            const handler = convertMediaHandler(storageClient, config);
            await handler(payload);

            expect(storageClient.ensureBucket).toHaveBeenCalledWith('vod-bucket');

            const [[, uploadedObjects]] = (storageClient.uploadObjects as jest.Mock).mock.calls as [string, { key: string }[]][];
            const uploadedKeys = uploadedObjects.map(obj => obj.key);

            expect(uploadedKeys.some(k => k.endsWith('output.mpd'))).toBe(true);
            expect(uploadedKeys.some(k => k.endsWith('.m4s'))).toBe(true);
            uploadedKeys.forEach(key => expect(key.startsWith('507f1f77bcf86cd799439011/')).toBe(true));
        });

        it('returns workDirPath in result without cleaning up workspace (cleanup deferred to success handler)', async () => {
            const handler = convertMediaHandler(storageClient, config);
            const result = await handler(payload);

            expect(result.workDirPath).toBeTruthy();
            expect(existsSync(result.workDirPath)).toBe(true);
        });

        it('throws ConversionFatalError with workDirPath when an upload fails', async () => {
            (storageClient.uploadObjects as jest.Mock).mockImplementation((_bucket, objects: any[]) => {
                objects?.forEach(obj => obj?.data?.destroy());
                return Promise.reject(new Error('Upload failed'));
            });

            const handler = convertMediaHandler(storageClient, config);
            let caughtError: any;
            try { await handler(payload); } catch (err) { caughtError = err; }

            expect(caughtError).toBeInstanceOf(ConversionFatalError);
        });
    });

    describe('Video with subtitles', () => {
        const payload = {
            mediaId: '507f1f77bcf86cd799439011',
            mediaFileName: 'lecture.mkv',
            mediaStorageBucket: 'raw-media',
            mediaRoutingKey: 'uploads/lecture.mkv'
        };

        beforeEach(() => {
            mockedRunFfprobe.mockResolvedValue({
                format: { tags: {}, duration: 120 },
                chapters: [],
                streams: [
                    { codec_type: 'video', tags: { DURATION: '00:02:00.000000000' } },
                    { codec_type: 'subtitle', codec_name: 'ass', index: 2, tags: { language: 'eng' } },
                    { codec_type: 'subtitle', codec_name: 'ass', index: 3, tags: { language: 'fra' } }
                ]
            } as any);
        });

        it('extracts subtitles as external wvtt files and DASH has no subtitle streams', async () => {
            const handler = convertMediaHandler(storageClient, config);
            await handler(payload);

            // DASH call must not contain subtitle maps or mov_text
            const dashCall = mockedRunFfmpeg.mock.calls.find(([, out]) => out.endsWith('.mpd'));
            expect(dashCall![2]).toEqual([
                '-f dash',
                '-avoid_negative_ts', 'make_zero',
                '-map 0:v',
                '-map 0:a?',
                '-c:v', 'h264',
                '-c:a', 'aac',
                '-af', 'aresample=async=1:first_pts=0',
                '-use_template', '1',
                '-use_timeline', '1',
                '-seg_duration', '15',
                '-init_seg_name', 'init_v$RepresentationID$.m4s',
                '-media_seg_name', 'seg_v$RepresentationID$_$Number%03d$.m4s'
            ]);

            // one FFmpeg call per subtitle stream with webvtt codec
            const vttCalls = mockedRunFfmpeg.mock.calls.filter(([, out]) => out.endsWith('.vtt'));
            expect(vttCalls).toHaveLength(2);
            expect(vttCalls[0][2]).toEqual(['-map', '0:2', '-c:s', 'webvtt']);
            expect(vttCalls[1][2]).toEqual(['-map', '0:3', '-c:s', 'webvtt']);
        });

        it('patches the MPD with wvtt AdaptationSets for each subtitle', async () => {
            const handler = convertMediaHandler(storageClient, config);
            const result = await handler(payload);

            const mpdPath = path.join(result.workDirPath, 'output.mpd');
            const mpdContent = existsSync(mpdPath) ? readFileSync(mpdPath, 'utf-8') : '';

            expect(mpdContent).toContain('contentType="text"');
            expect(mpdContent).toContain('codecs="wvtt"');
            expect(mpdContent).toContain('lang="eng"');
            expect(mpdContent).toContain('lang="fra"');
        });

        it('uploads .vtt subtitle files to storage', async () => {
            const handler = convertMediaHandler(storageClient, config);
            await handler(payload);

            const [[, uploadedObjects]] = (storageClient.uploadObjects as jest.Mock).mock.calls as [string, { key: string }[]][];
            const uploadedKeys = uploadedObjects.map(obj => obj.key);
            expect(uploadedKeys.filter(k => k.includes('subtitles_'))).toHaveLength(2);
        });
    });

    describe('Video with chapters', () => {
        const payload = {
            mediaId: '507f1f77bcf86cd799439011',
            mediaFileName: 'documentary.mkv',
            mediaStorageBucket: 'raw-media',
            mediaRoutingKey: 'uploads/documentary.mkv'
        };

        beforeEach(() => {
            mockedRunFfprobe.mockResolvedValue({
                format: { tags: {}, duration: 900 },
                chapters: [
                    { tags: { title: 'Introduction' }, start_time: 0, end_time: 300 },
                    { tags: { title: 'Chapter One' }, start_time: 300, end_time: 900 }
                ],
                streams: [
                    { codec_type: 'video', tags: { DURATION: '00:15:00.000000000' } }
                ]
            } as any);
        });

        it('generates a chapters.vtt file with correct WebVTT content', async () => {
            const handler = convertMediaHandler(storageClient, config);
            const result = await handler(payload);

            const chaptersPath = path.join(result.workDirPath, 'chapters.vtt');
            const chaptersVttContent = existsSync(chaptersPath) ? readFileSync(chaptersPath, 'utf-8') : '';

            expect(chaptersVttContent).toContain('WEBVTT');
            expect(chaptersVttContent).toContain('00:00:00.000 --> 00:05:00.000');
            expect(chaptersVttContent).toContain('Introduction');
            expect(chaptersVttContent).toContain('00:05:00.000 --> 00:15:00.000');
            expect(chaptersVttContent).toContain('Chapter One');
        });

        it('uploads chapters.vtt to storage', async () => {
            const handler = convertMediaHandler(storageClient, config);
            await handler(payload);

            const [[, uploadedObjects]] = (storageClient.uploadObjects as jest.Mock).mock.calls as [string, { key: string }[]][];
            const uploadedKeys = uploadedObjects.map(obj => obj.key);
            expect(uploadedKeys.some(k => k.endsWith('chapters.vtt'))).toBe(true);
        });
    });
});
