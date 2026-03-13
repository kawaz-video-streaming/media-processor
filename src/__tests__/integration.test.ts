import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { StorageClient } from '@ido_kawaz/storage-client';
import { convertMediaHandler } from '../background/convert/handler';
import * as convertUtils from '../background/convert/utils';
import { createTempFolder } from '../utils/files';
import * as ffmpegUtils from '../utils/ffmpeg';

jest.mock('../utils/ffmpeg');

const mockedRunFfmpeg = ffmpegUtils.runFfmpeg as jest.MockedFunction<typeof ffmpegUtils.runFfmpeg>;
const mockedRunFfprobe = ffmpegUtils.runFfprobe as jest.MockedFunction<typeof ffmpegUtils.runFfprobe>;

describe('E2E: Convert Pipeline', () => {
    const storageClient = {
        downloadObject: jest.fn(),
        uploadObject: jest.fn(),
        ensureBucket: jest.fn()
    } as unknown as StorageClient;

    const config = {
        vodBucketName: 'vod-bucket',
        uploadingBatchSize: 10
    };

    beforeAll(async () => {
        await createTempFolder();
    });

    beforeEach(() => {
        jest.clearAllMocks();

        (storageClient.downloadObject as jest.Mock).mockResolvedValue(
            Readable.from(Buffer.from('dud'))
        );
        // Destroy the ReadStream so the file handle is released before cleanup runs (Windows)
        (storageClient.uploadObject as jest.Mock).mockImplementation((_bucket, _key, stream: any) => {
            stream?.destroy();
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
                await fs.promises.writeFile(outputPath,
                    '<MPD>\n\t<Period id="0">\n\t\t<AdaptationSet id="0" contentType="video"/>\n\t</Period>\n</MPD>');
                await fs.promises.writeFile(path.join(dir, 'init_0.m4s'), Buffer.alloc(0));
                await fs.promises.writeFile(path.join(dir, 'seg_0_001.m4s'), Buffer.alloc(0));
            } else if (outputPath.endsWith('.vtt')) {
                await fs.promises.writeFile(outputPath, 'WEBVTT\n');
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
            expect(fs.existsSync(workDirPath)).toBe(false);
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
                    '-c:v copy',
                    '-c:a copy',
                    '-use_template', '1',
                    '-use_timeline', '1',
                    '-seg_duration', '15',
                    '-init_seg_name', 'init_$RepresentationID$.m4s',
                    '-media_seg_name', 'seg_$RepresentationID$_$Number%03d$.m4s'
                ],
                true
            );
        });

        it('uploads all output files to the VOD bucket under the correct key prefix', async () => {
            const handler = convertMediaHandler(storageClient, config);
            await handler(payload);

            expect(storageClient.ensureBucket).toHaveBeenCalledWith('vod-bucket');

            const uploadCalls = (storageClient.uploadObject as jest.Mock).mock.calls as [string, string, unknown][];
            const uploadedKeys = uploadCalls.map(([, key]) => key);

            expect(uploadedKeys.some(k => k.endsWith('output.mpd'))).toBe(true);
            expect(uploadedKeys.some(k => k.endsWith('.m4s'))).toBe(true);
            uploadedKeys.forEach(key => expect(key.startsWith('test-video/')).toBe(true));
        });

        it('cleans up workspace after successful conversion', async () => {
            const workspaceSpy = jest.spyOn(convertUtils, 'initializeWorkspace');

            const handler = convertMediaHandler(storageClient, config);
            await handler(payload);

            const { workDirPath } = workspaceSpy.mock.results[0].value;
            expect(fs.existsSync(workDirPath)).toBe(false);
        });

        it('cleans up workspace even when an upload fails', async () => {
            const workspaceSpy = jest.spyOn(convertUtils, 'initializeWorkspace');
            (storageClient.uploadObject as jest.Mock).mockImplementation((_bucket, _key, stream: any) => {
                stream?.destroy();
                return Promise.reject(new Error('Upload failed'));
            });

            const handler = convertMediaHandler(storageClient, config);
            await expect(handler(payload)).rejects.toThrow('Upload failed');

            const { workDirPath } = workspaceSpy.mock.results[0].value;
            expect(fs.existsSync(workDirPath)).toBe(false);
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

        it('extracts each subtitle stream as a WebVTT file', async () => {
            const handler = convertMediaHandler(storageClient, config);
            await handler(payload);

            const vttCalls = mockedRunFfmpeg.mock.calls.filter(([, out]) => out.endsWith('.vtt'));
            expect(vttCalls).toHaveLength(2);
            expect(vttCalls[0][2]).toEqual(['-map', '0:2', '-c:s', 'webvtt']);
            expect(vttCalls[1][2]).toEqual(['-map', '0:3', '-c:s', 'webvtt']);
        });

        it('converts to DASH without subtitle stream maps', async () => {
            const handler = convertMediaHandler(storageClient, config);
            await handler(payload);

            const dashCall = mockedRunFfmpeg.mock.calls.find(([, out]) => out.endsWith('.mpd'));
            expect(dashCall![2]).toEqual([
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
            ]);
        });

        it('injects subtitle AdaptationSets into the MPD', async () => {
            const addSubtitlesSpy = jest.spyOn(convertUtils, 'addSubtitlesToMpd');

            const handler = convertMediaHandler(storageClient, config);
            await handler(payload);

            expect(addSubtitlesSpy).toHaveBeenCalled();
            const [, subtitlePaths, subtitleStreams] = addSubtitlesSpy.mock.calls[0];
            expect(subtitlePaths).toHaveLength(2);
            expect(subtitleStreams[0].subtitleLanguage).toBe('eng');
            expect(subtitleStreams[1].subtitleLanguage).toBe('fra');
        });

        it('uploads WebVTT files alongside DASH segments', async () => {
            const handler = convertMediaHandler(storageClient, config);
            await handler(payload);

            const uploadCalls = (storageClient.uploadObject as jest.Mock).mock.calls as [string, string, unknown][];
            const uploadedKeys = uploadCalls.map(([, key]) => key);
            expect(uploadedKeys.some(k => k.endsWith('.vtt'))).toBe(true);
        });
    });
});
