import { AmqpClient } from '@ido_kawaz/amqp-client';
import { StorageClient, StorageError } from '@ido_kawaz/storage-client';
import { ConversionFatalError, ConversionRetriableError } from '../errors';
import { convertMediaHandler, onConvertSuccessHandler } from '../handler';
import { ConvertConfig, VideoMetadata, WorkPaths } from '../types';

jest.mock('../utils', () => ({
    initializeWorkspace: jest.fn(),
    cleanupWorkspace: jest.fn()
}));

jest.mock('../logic', () => ({
    convertMedia: jest.fn()
}));

import { initializeWorkspace, cleanupWorkspace } from '../utils';
import * as logic from '../logic';

const mockedInitializeWorkspace = initializeWorkspace as jest.MockedFunction<typeof initializeWorkspace>;
const mockedCleanup = cleanupWorkspace as jest.MockedFunction<typeof cleanupWorkspace>;
const mockedConvertMedia = logic.convertMedia as jest.MockedFunction<typeof logic.convertMedia>;

describe('convertMediaHandler', () => {
    const mockStorageClient = {
        downloadObject: jest.fn(),
        uploadObject: jest.fn(),
        ensureBucket: jest.fn()
    } as unknown as StorageClient;

    const config: ConvertConfig = {
        vodBucketName: 'vod-bucket'
    };

    const mockWorkPaths: WorkPaths = {
        workDirPath: '/tmp/video-abc123',
        mediaPath: '/tmp/video-abc123/video.mp4',
        mpdPath: '/tmp/video-abc123/output.mpd'
    };

    const mockVideo: VideoMetadata = {
        title: 'video',
        durationInMs: 0,
        is10bit: false,
        chapters: [],
        videoStreams: [],
        audioStreams: [],
        subtitleStreams: []
    };

    const basePayload = {
        mediaId: '507f1f77bcf86cd799439011',
        mediaName: 'video.mp4',
        mediaStorageBucket: 'raw-bucket',
        mediaRoutingKey: 'media/video.mp4'
    };

    beforeEach(() => {
        mockedInitializeWorkspace.mockReturnValue(mockWorkPaths);
        mockedConvertMedia.mockResolvedValue(mockVideo);
        mockedCleanup.mockResolvedValue(undefined);
    });

    it('should initialize workspace with the convert payload', async () => {
        const handler = convertMediaHandler(mockStorageClient, config);
        await handler(basePayload);

        expect(mockedInitializeWorkspace).toHaveBeenCalledWith(basePayload);
    });

    it('should call logic.convertMedia with correct arguments', async () => {
        const handler = convertMediaHandler(mockStorageClient, config);
        await handler(basePayload);

        expect(mockedConvertMedia).toHaveBeenCalledWith(config, mockStorageClient, basePayload, mockWorkPaths);
    });

    it('should return videoMetadata and workDirPath on success', async () => {
        const handler = convertMediaHandler(mockStorageClient, config);
        const result = await handler(basePayload);

        expect(result).toEqual({ videoMetadata: mockVideo, workDirPath: mockWorkPaths.workDirPath });
    });

    it('should throw ConversionFatalError with workDirPath when logic.convertMedia fails', async () => {
        mockedConvertMedia.mockRejectedValue(new Error('FFmpeg failure'));

        const handler = convertMediaHandler(mockStorageClient, config);
        await expect(handler(basePayload)).rejects.toBeInstanceOf(ConversionFatalError);
        await expect(handler(basePayload)).rejects.toMatchObject({ workDirPath: mockWorkPaths.workDirPath });
        expect(mockedCleanup).not.toHaveBeenCalled();
    });

    it('should throw ConversionRetriableError when a StorageError occurs', async () => {
        const storageErr = Object.setPrototypeOf(new Error('Bucket unavailable'), StorageError.prototype);
        mockedConvertMedia.mockRejectedValue(storageErr);

        const handler = convertMediaHandler(mockStorageClient, config);
        await expect(handler(basePayload)).rejects.toBeInstanceOf(ConversionRetriableError);
    });
});

describe('onConvertSuccessHandler', () => {
    const mockAmqpClient = {
        publish: jest.fn()
    } as unknown as AmqpClient;

    const basePayload = {
        mediaId: '507f1f77bcf86cd799439011',
        mediaName: 'video.mp4',
        mediaStorageBucket: 'raw-bucket',
        mediaRoutingKey: 'media/video.mp4'
    };

    const baseMetadata: VideoMetadata = {
        title: 'My Video',
        durationInMs: 120000,
        is10bit: false,
        chapters: [],
        videoStreams: [],
        audioStreams: [],
        subtitleStreams: []
    };

    beforeEach(() => {
        mockedCleanup.mockResolvedValue(undefined);
    });

    it('publishes video object to register.media with correct playUrl and _id', async () => {
        const handler = onConvertSuccessHandler(mockAmqpClient);
        await handler(basePayload, { videoMetadata: baseMetadata, workDirPath: '/tmp/abc' });

        expect(mockAmqpClient.publish).toHaveBeenCalledWith(
            'register',
            'register.media',
            expect.objectContaining({
                video: expect.objectContaining({
                    _id: '507f1f77bcf86cd799439011',
                    playUrl: '507f1f77bcf86cd799439011/output.mpd'
                })
            })
        );
    });

    it('omits chaptersUrl and chapters when chapters array is empty', async () => {
        const handler = onConvertSuccessHandler(mockAmqpClient);
        await handler(basePayload, { videoMetadata: baseMetadata, workDirPath: '/tmp/abc' });

        const { video } = (mockAmqpClient.publish as jest.Mock).mock.calls[0][2];
        expect(video).not.toHaveProperty('chaptersUrl');
        expect(video).not.toHaveProperty('chapters');
    });

    it('omits is10bit from the published video object', async () => {
        const metadata10bit: VideoMetadata = { ...baseMetadata, is10bit: true };
        const handler = onConvertSuccessHandler(mockAmqpClient);
        await handler(basePayload, { videoMetadata: metadata10bit, workDirPath: '/tmp/abc' });

        const { video } = (mockAmqpClient.publish as jest.Mock).mock.calls[0][2];
        expect(video).not.toHaveProperty('is10bit');
    });

    it('includes chaptersUrl and chapters when chapters are present', async () => {
        const metadataWithChapters: VideoMetadata = {
            ...baseMetadata,
            chapters: [{ chapterName: 'Intro', chapterStartTime: 0, chapterEndTime: 30000 }]
        };

        const handler = onConvertSuccessHandler(mockAmqpClient);
        await handler(basePayload, { videoMetadata: metadataWithChapters, workDirPath: '/tmp/abc' });

        const { video } = (mockAmqpClient.publish as jest.Mock).mock.calls[0][2];
        expect(video.chaptersUrl).toBe('507f1f77bcf86cd799439011/chapters.vtt');
        expect(video.chapters).toEqual(metadataWithChapters.chapters);
    });

    it('strips index from subtitle streams', async () => {
        const metadataWithSubtitles: VideoMetadata = {
            ...baseMetadata,
            subtitleStreams: [
                { index: 2, language: 'eng', title: 'English', durationInMs: 120000 },
                { index: 5, language: 'fra', title: 'French', durationInMs: 120000 }
            ]
        };

        const handler = onConvertSuccessHandler(mockAmqpClient);
        await handler(basePayload, { videoMetadata: metadataWithSubtitles, workDirPath: '/tmp/abc' });

        const { video } = (mockAmqpClient.publish as jest.Mock).mock.calls[0][2];
        expect(video.subtitleStreams).toEqual([
            { language: 'eng', title: 'English', durationInMs: 120000 },
            { language: 'fra', title: 'French', durationInMs: 120000 }
        ]);
    });

    it('cleans up workspace after publishing', async () => {
        const handler = onConvertSuccessHandler(mockAmqpClient);
        await handler(basePayload, { videoMetadata: baseMetadata, workDirPath: '/tmp/abc' });

        expect(mockedCleanup).toHaveBeenCalledWith('/tmp/abc');
    });
});
