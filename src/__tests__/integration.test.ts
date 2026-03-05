import { Readable } from 'stream';
import { StorageClient } from '@ido_kawaz/storage-client';
import { convertMediaHandler } from '../background/convert/handler';
import { validateConvertPayload, ConvertConfig, Convert } from '../background/convert/types';
import { CONVERT_MEDIA_CONSUMER_EXCHANGE, CONVERT_MEDIA_CONSUMER_TOPIC } from '../background/convert/binding';

jest.mock('../background/convert/utils', () => ({
    initializeWorkspace: jest.fn(),
    writeMediaToDirectory: jest.fn(),
    generateSubtitleTracks: jest.fn(),
    convertMediaToDashStream: jest.fn(),
    uploadStreamToStorage: jest.fn(),
    cleanupWorkspace: jest.fn()
}));

import {
    initializeWorkspace,
    writeMediaToDirectory,
    generateSubtitleTracks,
    convertMediaToDashStream,
    uploadStreamToStorage,
    cleanupWorkspace
} from '../background/convert/utils';

const mockedInitializeWorkspace = initializeWorkspace as jest.MockedFunction<typeof initializeWorkspace>;
const mockedWriteMedia = writeMediaToDirectory as jest.MockedFunction<typeof writeMediaToDirectory>;
const mockedGenerateSubtitles = generateSubtitleTracks as jest.MockedFunction<typeof generateSubtitleTracks>;
const mockedConvertMedia = convertMediaToDashStream as jest.MockedFunction<typeof convertMediaToDashStream>;
const mockedUploadStream = uploadStreamToStorage as jest.MockedFunction<typeof uploadStreamToStorage>;
const mockedCleanup = cleanupWorkspace as jest.MockedFunction<typeof cleanupWorkspace>;

describe('Media Processor Integration', () => {
    const mockMediaStream = new Readable({ read() { this.push(Buffer.from('fake-media-data')); this.push(null); } });

    const mockStorageClient = {
        downloadObject: jest.fn(),
        uploadObject: jest.fn(),
        ensureBucket: jest.fn()
    } as unknown as StorageClient;

    const config: ConvertConfig = {
        vodBucketName: 'vod-bucket',
        uploadingBatchSize: 5
    };

    const mockWorkPaths = {
        workDirPath: '/tmp/test-video-abc',
        mediaPath: '/tmp/test-video-abc/test-video.mp4',
        mpdPath: '/tmp/test-video-abc/output.mpd'
    };

    beforeEach(() => {
        (mockStorageClient.downloadObject as jest.Mock).mockResolvedValue(mockMediaStream);
        mockedInitializeWorkspace.mockReturnValue(mockWorkPaths);
        mockedWriteMedia.mockResolvedValue(undefined);
        mockedGenerateSubtitles.mockResolvedValue(undefined);
        mockedConvertMedia.mockResolvedValue(undefined);
        mockedUploadStream.mockResolvedValue(undefined);
        mockedCleanup.mockResolvedValue(undefined);
    });

    describe('Full convert pipeline — video without subtitles', () => {
        const payload: Convert = {
            mediaName: 'test-video.mp4',
            mediaStorageBucket: 'raw-media',
            mediaRoutingKey: 'uploads/test-video.mp4',
            areSubtitlesIncluded: false
        };

        it('should validate the convert payload', () => {
            expect(validateConvertPayload(payload)).toBe(true);
        });

        it('should process full pipeline: download → write → convert → upload → cleanup', async () => {
            const handler = convertMediaHandler(mockStorageClient, config);
            await handler(payload);

            expect(mockStorageClient.downloadObject).toHaveBeenCalledWith('raw-media', 'uploads/test-video.mp4');
            expect(mockedInitializeWorkspace).toHaveBeenCalledWith('test-video.mp4');
            expect(mockedWriteMedia).toHaveBeenCalledWith(mockMediaStream, mockWorkPaths.mediaPath);
            expect(mockedGenerateSubtitles).not.toHaveBeenCalled();
            expect(mockedConvertMedia).toHaveBeenCalledWith(mockWorkPaths.mediaPath, mockWorkPaths.mpdPath);
            expect(mockedUploadStream).toHaveBeenCalledWith(mockStorageClient, 'test-video.mp4', mockWorkPaths.workDirPath, config);
            expect(mockedCleanup).toHaveBeenCalledWith(mockWorkPaths.workDirPath);
        });
    });

    describe('Full convert pipeline — video with subtitles', () => {
        const payload: Convert = {
            mediaName: 'lecture.mkv',
            mediaStorageBucket: 'raw-media',
            mediaRoutingKey: 'uploads/lecture.mkv',
            areSubtitlesIncluded: true
        };

        it('should generate subtitle tracks before conversion', async () => {
            mockedInitializeWorkspace.mockReturnValue({
                workDirPath: '/tmp/lecture-abc',
                mediaPath: '/tmp/lecture-abc/lecture.mkv',
                mpdPath: '/tmp/lecture-abc/output.mpd'
            });

            const handler = convertMediaHandler(mockStorageClient, config);
            await handler(payload);

            expect(mockedGenerateSubtitles).toHaveBeenCalledWith('/tmp/lecture-abc', '/tmp/lecture-abc/lecture.mkv');
            expect(mockedConvertMedia).toHaveBeenCalledWith('/tmp/lecture-abc/lecture.mkv', '/tmp/lecture-abc/output.mpd');
            expect(mockedUploadStream).toHaveBeenCalled();
            expect(mockedCleanup).toHaveBeenCalledWith('/tmp/lecture-abc');
        });
    });

    describe('Error handling — storage download failure', () => {
        it('should propagate errors and not proceed with conversion', async () => {
            (mockStorageClient.downloadObject as jest.Mock).mockRejectedValue(new Error('Storage connection refused'));

            const handler = convertMediaHandler(mockStorageClient, config);
            await expect(handler({
                mediaName: 'video.mp4',
                mediaStorageBucket: 'raw-media',
                mediaRoutingKey: 'uploads/video.mp4',
                areSubtitlesIncluded: false
            })).rejects.toThrow('Storage connection refused');

            expect(mockedWriteMedia).not.toHaveBeenCalled();
            expect(mockedConvertMedia).not.toHaveBeenCalled();
            expect(mockedUploadStream).not.toHaveBeenCalled();
        });
    });

    describe('Error handling — conversion failure with cleanup', () => {
        it('should cleanup workspace even when conversion throws', async () => {
            mockedConvertMedia.mockRejectedValue(new Error('FFmpeg process crashed'));

            const handler = convertMediaHandler(mockStorageClient, config);
            await expect(handler({
                mediaName: 'broken.mp4',
                mediaStorageBucket: 'raw-media',
                mediaRoutingKey: 'uploads/broken.mp4',
                areSubtitlesIncluded: false
            })).rejects.toThrow('FFmpeg process crashed');

            expect(mockedCleanup).toHaveBeenCalledWith(mockWorkPaths.workDirPath);
        });
    });

    describe('Payload validation edge cases in pipeline', () => {
        it('should reject invalid payload before processing', () => {
            const invalidPayload = { mediaName: 123 };
            expect(validateConvertPayload(invalidPayload)).toBe(false);
        });

        it('should accept payload with areSubtitlesIncluded omitted and default to false', () => {
            const partialPayload = {
                mediaName: 'video.mp4',
                mediaStorageBucket: 'raw-media',
                mediaRoutingKey: 'uploads/video.mp4'
            };
            expect(validateConvertPayload(partialPayload)).toBe(true);
        });
    });

    describe('Consumer binding configuration', () => {
        it('should use correct exchange and topic from binding constants', () => {
            expect(CONVERT_MEDIA_CONSUMER_EXCHANGE).toBe('convert');
            expect(CONVERT_MEDIA_CONSUMER_TOPIC).toBe('convert.media');
        });
    });
});
