import { Readable } from 'stream';
import { StorageClient } from '@ido_kawaz/storage-client';
import { convertMediaHandler } from '../handler';
import { ConvertConfig, Video, WorkPaths } from '../types';

jest.mock('../utils', () => ({
    initializeWorkspace: jest.fn(),
    writeMediaToDirectory: jest.fn(),
    getVideoMetadata: jest.fn(),
    convertMediaToDashStream: jest.fn(),
    uploadStreamToStorage: jest.fn(),
    cleanupWorkspace: jest.fn()
}));

import {
    initializeWorkspace,
    writeMediaToDirectory,
    getVideoMetadata,
    convertMediaToDashStream,
    uploadStreamToStorage,
    cleanupWorkspace
} from '../utils';

const mockedInitializeWorkspace = initializeWorkspace as jest.MockedFunction<typeof initializeWorkspace>;
const mockedWriteMedia = writeMediaToDirectory as jest.MockedFunction<typeof writeMediaToDirectory>;
const mockedGetVideoMetadata = getVideoMetadata as jest.MockedFunction<typeof getVideoMetadata>;
const mockedConvertMedia = convertMediaToDashStream as jest.MockedFunction<typeof convertMediaToDashStream>;
const mockedUploadStream = uploadStreamToStorage as jest.MockedFunction<typeof uploadStreamToStorage>;
const mockedCleanup = cleanupWorkspace as jest.MockedFunction<typeof cleanupWorkspace>;

describe('convertMediaHandler', () => {
    const mockMediaStream = new Readable({ read() { this.push(null); } });

    const mockStorageClient = {
        downloadObject: jest.fn().mockResolvedValue(mockMediaStream),
        uploadObject: jest.fn(),
        ensureBucket: jest.fn()
    } as unknown as StorageClient;

    const config: ConvertConfig = {
        vodBucketName: 'vod-bucket',
        uploadingBatchSize: 5
    };

    const mockWorkPaths: WorkPaths = {
        workDirPath: '/tmp/video-abc123',
        mediaPath: '/tmp/video-abc123/video.mp4',
        mpdPath: '/tmp/video-abc123/output.mpd'
    };

    const mockVideo: Video = {
        videoId: '507f1f77bcf86cd799439011',
        videoName: 'video',
        videoDuration: 0,
        videoChapters: [],
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
        mockedWriteMedia.mockResolvedValue(undefined);
        mockedGetVideoMetadata.mockResolvedValue(mockVideo);
        mockedConvertMedia.mockResolvedValue(undefined);
        mockedUploadStream.mockResolvedValue(undefined);
        mockedCleanup.mockResolvedValue(undefined);
    });

    it('should download media from storage with correct bucket and key', async () => {
        const handler = convertMediaHandler(mockStorageClient, config);
        await handler(basePayload);

        expect(mockStorageClient.downloadObject).toHaveBeenCalledWith('raw-bucket', 'media/video.mp4');
    });

    it('should initialize workspace with media name', async () => {
        const handler = convertMediaHandler(mockStorageClient, config);
        await handler(basePayload);

        expect(mockedInitializeWorkspace).toHaveBeenCalledWith('video.mp4');
    });

    it('should write downloaded media stream to workspace directory', async () => {
        const handler = convertMediaHandler(mockStorageClient, config);
        await handler(basePayload);

        expect(mockedWriteMedia).toHaveBeenCalledWith(mockMediaStream, mockWorkPaths.mediaPath);
    });

    it('should probe media to extract video metadata', async () => {
        const handler = convertMediaHandler(mockStorageClient, config);
        await handler(basePayload);

        expect(mockedGetVideoMetadata).toHaveBeenCalledWith('507f1f77bcf86cd799439011', mockWorkPaths.mediaPath);
    });

    it('should convert media to DASH stream with media path and mpd path', async () => {
        const handler = convertMediaHandler(mockStorageClient, config);
        await handler(basePayload);

        expect(mockedConvertMedia).toHaveBeenCalledWith(
            mockWorkPaths.mediaPath,
            mockWorkPaths.mpdPath,
            mockVideo
        );
    });


    it('should upload converted stream to storage', async () => {
        const handler = convertMediaHandler(mockStorageClient, config);
        await handler(basePayload);

        expect(mockedUploadStream).toHaveBeenCalledWith(
            mockStorageClient,
            'video.mp4',
            mockWorkPaths.workDirPath,
            config
        );
    });

    it('should call steps in correct order', async () => {
        const callOrder: string[] = [];
        (mockStorageClient.downloadObject as jest.Mock).mockImplementation(async () => {
            callOrder.push('download');
            return mockMediaStream;
        });
        mockedInitializeWorkspace.mockImplementation(() => {
            callOrder.push('initWorkspace');
            return mockWorkPaths;
        });
        mockedWriteMedia.mockImplementation(async () => { callOrder.push('writeMedia'); });
        mockedGetVideoMetadata.mockImplementation(async () => { callOrder.push('getVideoMetadata'); return mockVideo; });
        mockedConvertMedia.mockImplementation(async () => { callOrder.push('convert'); });
        mockedUploadStream.mockImplementation(async () => { callOrder.push('upload'); });
        mockedCleanup.mockImplementation(async () => { callOrder.push('cleanup'); });

        const handler = convertMediaHandler(mockStorageClient, config);
        await handler(basePayload);

        expect(callOrder).toEqual(['download', 'initWorkspace', 'writeMedia', 'getVideoMetadata', 'convert', 'upload', 'cleanup']);
    });

    it('should cleanup workspace even when conversion fails', async () => {
        mockedConvertMedia.mockRejectedValue(new Error('FFmpeg failure'));

        const handler = convertMediaHandler(mockStorageClient, config);
        await expect(handler(basePayload)).rejects.toThrow('FFmpeg failure');

        expect(mockedCleanup).toHaveBeenCalledWith(mockWorkPaths.workDirPath);
    });

    it('should cleanup workspace even when upload fails', async () => {
        mockedUploadStream.mockRejectedValue(new Error('Upload error'));

        const handler = convertMediaHandler(mockStorageClient, config);
        await expect(handler(basePayload)).rejects.toThrow('Upload error');

        expect(mockedCleanup).toHaveBeenCalledWith(mockWorkPaths.workDirPath);
    });

    it('should cleanup workspace even when metadata extraction fails', async () => {
        mockedGetVideoMetadata.mockRejectedValue(new Error('Probe error'));

        const handler = convertMediaHandler(mockStorageClient, config);
        await expect(handler(basePayload)).rejects.toThrow('Probe error');

        expect(mockedCleanup).toHaveBeenCalledWith(mockWorkPaths.workDirPath);
    });

    it('should propagate storage download error', async () => {
        (mockStorageClient.downloadObject as jest.Mock).mockRejectedValue(new Error('Storage unavailable'));

        const handler = convertMediaHandler(mockStorageClient, config);
        await expect(handler(basePayload)).rejects.toThrow('Storage unavailable');
    });
});
