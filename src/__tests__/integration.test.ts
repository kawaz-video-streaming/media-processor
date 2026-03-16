import { StorageClient } from '@ido_kawaz/storage-client';
import { existsSync, readFileSync } from 'fs';
import { rm, writeFile } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { convertMediaHandler } from '../background/convert/handler';
import * as convertUtils from '../background/convert/utils';
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
        vodBucketName: 'vod-bucket'
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
            }
        });
    });

    describe('Non-video media', () => {
        const payload = {
            mediaId: '507f1f77bcf86cd799439011',
            mediaName: 'audio-only.mp3',
            mediaStorageBucket: 'raw-media',
            mediaRoutingKey: 'uploads/audio-only.mp3'
        };

        it('rejects the file and cleans up the workspace when no video stream is found', async () => {
            const workspaceSpy = jest.spyOn(convertUtils, 'initializeWorkspace');
            mockedRunFfprobe.mockResolvedValue({
                format: { tags: {}, duration: 180 },
                chapters: [],
                streams: [{ codec_type: 'audio', tags: {} }]
            } as any);

            const handler = convertMediaHandler(storageClient, config);
            await expect(handler(payload)).rejects.toThrow('No video stream found in media');

            const { workDirPath } = workspaceSpy.mock.results[0].value;
            expect(existsSync(workDirPath)).toBe(false);
        });
    });

    describe('Video without subtitles', () => {
        const payload = {
            mediaId: '507f1f77bcf86cd799439011',
            mediaName: 'test-video.mp4',
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
                    '-map 0:v',
                    '-map 0:a?',
                    '-c:v h264_nvenc',
                    '-c:a copy',
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

        it('cleans up workspace after successful conversion', async () => {
            const workspaceSpy = jest.spyOn(convertUtils, 'initializeWorkspace');

            const handler = convertMediaHandler(storageClient, config);
            await handler(payload);

            const { workDirPath } = workspaceSpy.mock.results[0].value;
            expect(existsSync(workDirPath)).toBe(false);
        });

        it('cleans up workspace even when an upload fails', async () => {
            const workspaceSpy = jest.spyOn(convertUtils, 'initializeWorkspace');
            (storageClient.uploadObjects as jest.Mock).mockImplementation((_bucket, objects: any[]) => {
                objects?.forEach(obj => obj?.data?.destroy());
                return Promise.reject(new Error('Upload failed'));
            });

            const handler = convertMediaHandler(storageClient, config);
            await expect(handler(payload)).rejects.toThrow('Upload failed');

            const { workDirPath } = workspaceSpy.mock.results[0].value;
            expect(existsSync(workDirPath)).toBe(false);
        });
    });

    describe('Video with subtitles', () => {
        const payload = {
            mediaId: '507f1f77bcf86cd799439011',
            mediaName: 'lecture.mkv',
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
                '-map 0:v',
                '-map 0:a?',
                '-c:v h264_nvenc',
                '-c:a copy',
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
            let mpdContent = '';
            const cleanupSpy = jest.spyOn(convertUtils, 'cleanupWorkspace').mockImplementationOnce(async (workDirPath) => {
                const mpdPath = path.join(workDirPath, 'output.mpd');
                if (existsSync(mpdPath)) {
                    mpdContent = readFileSync(mpdPath, 'utf-8');
                }
                return rm(workDirPath, { recursive: true, force: true });
            });

            const handler = convertMediaHandler(storageClient, config);
            await handler(payload);
            cleanupSpy.mockRestore();

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
            expect(uploadedKeys.filter(k => k.endsWith('.vtt'))).toHaveLength(2);
        });
    });

    describe('Video with chapters', () => {
        const payload = {
            mediaId: '507f1f77bcf86cd799439011',
            mediaName: 'documentary.mkv',
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
            let chaptersVttContent = '';
            const cleanupSpy = jest.spyOn(convertUtils, 'cleanupWorkspace').mockImplementationOnce(async (workDirPath) => {
                const chaptersPath = path.join(workDirPath, 'chapters.vtt');
                if (existsSync(chaptersPath)) {
                    chaptersVttContent = readFileSync(chaptersPath, 'utf-8');
                }
                return rm(workDirPath, { recursive: true, force: true });
            });

            const handler = convertMediaHandler(storageClient, config);
            await handler(payload);
            cleanupSpy.mockRestore();

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
