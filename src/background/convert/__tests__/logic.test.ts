import { AmqpClient } from '@ido_kawaz/amqp-client';
import { Readable } from 'stream';
import { StorageClient } from '@ido_kawaz/storage-client';
import { convertMedia } from '../logic';
import { ConvertConfig, VideoMetadata, WorkPaths } from '../types';

jest.mock('../utils', () => ({
    writeMediaToDirectory: jest.fn(),
    getVideoMetadata: jest.fn(),
    generateSubtitleTracks: jest.fn(),
    generateChaptersTrack: jest.fn(),
    generateThumbnailsTrack: jest.fn(),
    convertMediaToDashStream: jest.fn(),
    addSubtitlesToMpd: jest.fn(),
    uploadStreamToStorage: jest.fn()
}));

import {
    writeMediaToDirectory,
    getVideoMetadata,
    generateSubtitleTracks,
    generateChaptersTrack,
    generateThumbnailsTrack,
    convertMediaToDashStream,
    addSubtitlesToMpd,
    uploadStreamToStorage
} from '../utils';

const mockedWriteMedia = writeMediaToDirectory as jest.MockedFunction<typeof writeMediaToDirectory>;
const mockedGetVideoMetadata = getVideoMetadata as jest.MockedFunction<typeof getVideoMetadata>;
const mockedGenerateSubtitleTracks = generateSubtitleTracks as jest.MockedFunction<typeof generateSubtitleTracks>;
const mockedGenerateChaptersTrack = generateChaptersTrack as jest.MockedFunction<typeof generateChaptersTrack>;
const mockedGenerateThumbnailsTrack = generateThumbnailsTrack as jest.MockedFunction<typeof generateThumbnailsTrack>;
const mockedConvertMediaToDash = convertMediaToDashStream as jest.MockedFunction<typeof convertMediaToDashStream>;
const mockedAddSubtitlesToMpd = addSubtitlesToMpd as jest.MockedFunction<typeof addSubtitlesToMpd>;
const mockedUploadStream = uploadStreamToStorage as jest.MockedFunction<typeof uploadStreamToStorage>;

describe('convertMedia', () => {
    const mockMediaStream = new Readable({ read() { this.push(null); } });

    const mockAmqpClient = {
        publish: jest.fn()
    } as unknown as AmqpClient;

    const mockStorageClient = {
        downloadObject: jest.fn().mockResolvedValue(mockMediaStream),
        uploadObjects: jest.fn(),
        ensureBucket: jest.fn()
    } as unknown as StorageClient;

    const config: ConvertConfig = {
        vodBucketName: 'vod-bucket',
        thumbnailConfig: { thumbnailIntervalInSeconds: 10, thumbnailWidth: 160, thumbnailHeight: 90, thumbnailCols: 10 }
    };

    const payload = {
        mediaId: '507f1f77bcf86cd799439011',
        mediaFileName: 'video.mp4',
        mediaStorageBucket: 'raw-bucket',
        mediaRoutingKey: 'media/video.mp4'
    };

    const workPaths: WorkPaths = {
        workDirPath: '/tmp/video-abc123',
        mediaPath: '/tmp/video-abc123/video.mp4',
        mpdPath: '/tmp/video-abc123/output.mpd'
    };

    const mockVideoMetadata: VideoMetadata = {
        name: 'video',
        durationInMs: 0,
        chapters: [],
        videoStreams: [],
        audioStreams: [],
        subtitleStreams: []
    };

    beforeEach(() => {
        (mockStorageClient.downloadObject as jest.Mock).mockResolvedValue(mockMediaStream);
        mockedWriteMedia.mockResolvedValue(undefined);
        mockedGetVideoMetadata.mockResolvedValue(mockVideoMetadata);
        mockedGenerateSubtitleTracks.mockResolvedValue([]);
        mockedGenerateChaptersTrack.mockResolvedValue(undefined);
        mockedGenerateThumbnailsTrack.mockResolvedValue(undefined);
        mockedConvertMediaToDash.mockResolvedValue(undefined);
        mockedAddSubtitlesToMpd.mockResolvedValue(undefined);
        mockedUploadStream.mockResolvedValue(undefined);
    });

    it('downloads media from storage with correct bucket and key', async () => {
        await convertMedia(mockAmqpClient, config, mockStorageClient, payload, workPaths);

        expect(mockStorageClient.downloadObject).toHaveBeenCalledWith('raw-bucket', 'media/video.mp4');
    });

    it('writes downloaded media stream to workspace directory', async () => {
        await convertMedia(mockAmqpClient, config, mockStorageClient, payload, workPaths);

        expect(mockedWriteMedia).toHaveBeenCalledWith(mockMediaStream, workPaths.mediaPath);
    });

    it('probes media to extract video metadata', async () => {
        await convertMedia(mockAmqpClient, config, mockStorageClient, payload, workPaths);

        expect(mockedGetVideoMetadata).toHaveBeenCalledWith(workPaths.mediaPath);
    });

    it('generates subtitle tracks from video metadata', async () => {
        await convertMedia(mockAmqpClient, config, mockStorageClient, payload, workPaths);

        expect(mockedGenerateSubtitleTracks).toHaveBeenCalledWith(
            mockVideoMetadata.subtitleStreams,
            workPaths.workDirPath,
            workPaths.mediaPath
        );
    });

    it('generates chapters track from video metadata', async () => {
        await convertMedia(mockAmqpClient, config, mockStorageClient, payload, workPaths);

        expect(mockedGenerateChaptersTrack).toHaveBeenCalledWith(
            mockVideoMetadata.chapters,
            workPaths.workDirPath
        );
    });

    it('generates thumbnails track with media path, work dir, and duration', async () => {
        await convertMedia(mockAmqpClient, config, mockStorageClient, payload, workPaths);

        expect(mockedGenerateThumbnailsTrack).toHaveBeenCalledWith(
            workPaths.mediaPath,
            workPaths.workDirPath,
            mockVideoMetadata.durationInMs,
            config.thumbnailConfig
        );
    });

    it('converts media to DASH stream with media path, mpd path, audio streams, amqp client, and media id', async () => {
        await convertMedia(mockAmqpClient, config, mockStorageClient, payload, workPaths);

        expect(mockedConvertMediaToDash).toHaveBeenCalledWith(
            workPaths.mediaPath,
            workPaths.mpdPath,
            mockVideoMetadata.audioStreams,
            mockAmqpClient,
            payload.mediaId
        );
    });

    it('patches MPD with subtitle tracks after DASH conversion', async () => {
        const mockSubtitlePaths = ['/tmp/video-abc123/subtitles_0_eng.vtt'];
        mockedGenerateSubtitleTracks.mockResolvedValue(mockSubtitlePaths);

        await convertMedia(mockAmqpClient, config, mockStorageClient, payload, workPaths);

        expect(mockedAddSubtitlesToMpd).toHaveBeenCalledWith(
            workPaths.mpdPath,
            mockSubtitlePaths,
            mockVideoMetadata.subtitleStreams
        );
    });

    it('uploads converted stream to storage', async () => {
        await convertMedia(mockAmqpClient, config, mockStorageClient, payload, workPaths);

        expect(mockedUploadStream).toHaveBeenCalledWith(
            mockStorageClient,
            '507f1f77bcf86cd799439011',
            workPaths.workDirPath,
            config
        );
    });

    it('calls steps in correct order', async () => {
        const callOrder: string[] = [];
        (mockStorageClient.downloadObject as jest.Mock).mockImplementation(async () => { callOrder.push('download'); return mockMediaStream; });
        mockedWriteMedia.mockImplementation(async () => { callOrder.push('writeMedia'); });
        mockedGetVideoMetadata.mockImplementation(async () => { callOrder.push('getVideoMetadata'); return mockVideoMetadata; });
        mockedGenerateSubtitleTracks.mockImplementation(async () => { callOrder.push('generateSubtitles'); return []; });
        mockedGenerateChaptersTrack.mockImplementation(async () => { callOrder.push('generateChapters'); });
        mockedGenerateThumbnailsTrack.mockImplementation(async () => { callOrder.push('generateThumbnails'); });
        mockedConvertMediaToDash.mockImplementation(async () => { callOrder.push('convert'); });
        mockedAddSubtitlesToMpd.mockImplementation(async () => { callOrder.push('addSubtitlesToMpd'); });
        mockedUploadStream.mockImplementation(async () => { callOrder.push('upload'); });

        await convertMedia(mockAmqpClient, config, mockStorageClient, payload, workPaths);

        expect(callOrder).toEqual(['download', 'writeMedia', 'getVideoMetadata', 'generateSubtitles', 'generateChapters', 'generateThumbnails', 'convert', 'addSubtitlesToMpd', 'upload']);
    });

    it('returns videoMetadata', async () => {
        const result = await convertMedia(mockAmqpClient, config, mockStorageClient, payload, workPaths);

        expect(result).toBe(mockVideoMetadata);
    });
});
