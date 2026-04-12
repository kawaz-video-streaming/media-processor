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
    const mockAmqpClient = {
        publish: jest.fn()
    } as unknown as AmqpClient;

    const mockStorageClient = {
        downloadObject: jest.fn(),
        uploadObject: jest.fn(),
        ensureBucket: jest.fn()
    } as unknown as StorageClient;

    const config: ConvertConfig = {
        vodBucketName: 'vod-bucket',
        thumbnailConfig: { thumbnailIntervalInSeconds: 10, thumbnailWidth: 160, thumbnailHeight: 90, thumbnailCols: 10 }
    };

    const mockWorkPaths: WorkPaths = {
        workDirPath: '/tmp/video-abc123',
        mediaPath: '/tmp/video-abc123/video.mp4',
        mpdPath: '/tmp/video-abc123/output.mpd'
    };

    const mockVideo: VideoMetadata = {
        name: 'video',
        durationInMs: 0,
        chapters: [],
        videoStreams: [],
        audioStreams: [],
        subtitleStreams: []
    };

    const basePayload = {
        mediaId: '507f1f77bcf86cd799439011',
        mediaFileName: 'video.mp4',
        mediaStorageBucket: 'raw-bucket',
        mediaRoutingKey: 'media/video.mp4'
    };

    beforeEach(() => {
        mockedInitializeWorkspace.mockReturnValue(mockWorkPaths);
        mockedConvertMedia.mockResolvedValue(mockVideo);
        mockedCleanup.mockResolvedValue(undefined);
    });

    it('should initialize workspace with the convert payload', async () => {
        const handler = convertMediaHandler(mockAmqpClient, mockStorageClient, config);
        await handler(basePayload);

        expect(mockedInitializeWorkspace).toHaveBeenCalledWith(basePayload);
    });

    it('should call logic.convertMedia with correct arguments', async () => {
        const handler = convertMediaHandler(mockAmqpClient, mockStorageClient, config);
        await handler(basePayload);

        expect(mockedConvertMedia).toHaveBeenCalledWith(mockAmqpClient, config, mockStorageClient, basePayload, mockWorkPaths);
    });

    it('should return videoMetadata and workDirPath on success', async () => {
        const handler = convertMediaHandler(mockAmqpClient, mockStorageClient, config);
        const result = await handler(basePayload);

        expect(result).toEqual({ videoMetadata: mockVideo, workDirPath: mockWorkPaths.workDirPath });
    });

    it('should throw ConversionFatalError with workDirPath when logic.convertMedia fails', async () => {
        mockedConvertMedia.mockRejectedValue(new Error('FFmpeg failure'));

        const handler = convertMediaHandler(mockAmqpClient, mockStorageClient, config);
        await expect(handler(basePayload)).rejects.toBeInstanceOf(ConversionFatalError);
        await expect(handler(basePayload)).rejects.toMatchObject({ workDirPath: mockWorkPaths.workDirPath });
        expect(mockedCleanup).not.toHaveBeenCalled();
    });

    it('should throw ConversionRetriableError when a StorageError occurs', async () => {
        const storageErr = Object.setPrototypeOf(new Error('Bucket unavailable'), StorageError.prototype);
        mockedConvertMedia.mockRejectedValue(storageErr);

        const handler = convertMediaHandler(mockAmqpClient, mockStorageClient, config);
        await expect(handler(basePayload)).rejects.toBeInstanceOf(ConversionRetriableError);
    });
});

describe('onConvertSuccessHandler', () => {
    const mockAmqpClient = {
        publish: jest.fn()
    } as unknown as AmqpClient;

    const basePayload = {
        mediaId: '507f1f77bcf86cd799439011',
        mediaFileName: 'video.mp4',
        mediaStorageBucket: 'raw-bucket',
        mediaRoutingKey: 'media/video.mp4'
    };

    const baseMetadata: VideoMetadata = {
        name: 'My Video',
        durationInMs: 120000,
        chapters: [],
        videoStreams: [],
        audioStreams: [],
        subtitleStreams: []
    };

    beforeEach(() => {
        mockedCleanup.mockResolvedValue(undefined);
    });

    it('publishes to progress.media with mediaId, status completed, percentage 100, and playUrl in metadata', async () => {
        const handler = onConvertSuccessHandler(mockAmqpClient);
        await handler(basePayload, { videoMetadata: baseMetadata, workDirPath: '/tmp/abc' });

        expect(mockAmqpClient.publish).toHaveBeenCalledWith(
            'progress',
            'progress.media',
            expect.objectContaining({
                mediaId: '507f1f77bcf86cd799439011',
                status: 'completed',
                percentage: 100,
                metadata: expect.objectContaining({
                    playUrl: '507f1f77bcf86cd799439011/output.mpd'
                })
            })
        );
    });

    it('includes thumbnailsUrl in metadata', async () => {
        const handler = onConvertSuccessHandler(mockAmqpClient);
        await handler(basePayload, { videoMetadata: baseMetadata, workDirPath: '/tmp/abc' });

        const { metadata } = (mockAmqpClient.publish as jest.Mock).mock.calls[0][2];
        expect(metadata.thumbnailsUrl).toBe('507f1f77bcf86cd799439011/thumbnails.vtt');
    });

    it('omits chaptersUrl and chapters when chapters array is empty', async () => {
        const handler = onConvertSuccessHandler(mockAmqpClient);
        await handler(basePayload, { videoMetadata: baseMetadata, workDirPath: '/tmp/abc' });

        const { metadata } = (mockAmqpClient.publish as jest.Mock).mock.calls[0][2];
        expect(metadata).not.toHaveProperty('chaptersUrl');
        expect(metadata).not.toHaveProperty('chapters');
    });

    it('includes chaptersUrl and chapters when chapters are present', async () => {
        const metadataWithChapters: VideoMetadata = {
            ...baseMetadata,
            chapters: [{ chapterName: 'Intro', chapterStartTime: 0, chapterEndTime: 30000 }]
        };

        const handler = onConvertSuccessHandler(mockAmqpClient);
        await handler(basePayload, { videoMetadata: metadataWithChapters, workDirPath: '/tmp/abc' });

        const { metadata } = (mockAmqpClient.publish as jest.Mock).mock.calls[0][2];
        expect(metadata.chaptersUrl).toBe('507f1f77bcf86cd799439011/chapters.vtt');
        expect(metadata.chapters).toEqual(metadataWithChapters.chapters);
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

        const { metadata } = (mockAmqpClient.publish as jest.Mock).mock.calls[0][2];
        expect(metadata.subtitleStreams).toEqual([
            { language: 'eng', title: 'English', durationInMs: 120000 },
            { language: 'fra', title: 'French', durationInMs: 120000 }
        ]);
    });

    it('strips codec and channels from audio streams in published metadata', async () => {
        const metadataWithAudio: VideoMetadata = {
            ...baseMetadata,
            audioStreams: [
                { title: 'Stereo', language: 'eng', durationInMs: 120000, codec: 'ac3', channels: 6 },
                { title: 'Surround', language: 'jpn', durationInMs: 120000, codec: 'aac', channels: 2 }
            ]
        };

        const handler = onConvertSuccessHandler(mockAmqpClient);
        await handler(basePayload, { videoMetadata: metadataWithAudio, workDirPath: '/tmp/abc' });

        const { metadata } = (mockAmqpClient.publish as jest.Mock).mock.calls[0][2];
        expect(metadata.audioStreams).toEqual([
            { title: 'Stereo', language: 'eng', durationInMs: 120000 },
            { title: 'Surround', language: 'jpn', durationInMs: 120000 }
        ]);
    });

    it('cleans up workspace after publishing', async () => {
        const handler = onConvertSuccessHandler(mockAmqpClient);
        await handler(basePayload, { videoMetadata: baseMetadata, workDirPath: '/tmp/abc' });

        expect(mockedCleanup).toHaveBeenCalledWith('/tmp/abc');
    });

});
