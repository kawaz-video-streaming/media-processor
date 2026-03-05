import { Consumer } from '@ido_kawaz/amqp-client';
import { StorageClient } from '@ido_kawaz/storage-client';
import { createConvertConsumer } from '../index';
import { CONVERT_MEDIA_CONSUMER_EXCHANGE, CONVERT_MEDIA_CONSUMER_TOPIC } from '../binding';
import { ConvertConfig } from '../types';

describe('createConvertConsumer', () => {
    const mockStorageClient = {} as unknown as StorageClient;
    const config: ConvertConfig = {
        vodBucketName: 'vod-bucket',
        uploadingBatchSize: 5
    };

    it('should return a Consumer instance', () => {
        const consumer = createConvertConsumer(mockStorageClient, config);
        expect(consumer).toBeInstanceOf(Consumer);
    });

    it('should use correct exchange and topic from binding constants', () => {
        expect(CONVERT_MEDIA_CONSUMER_EXCHANGE).toBe('convert');
        expect(CONVERT_MEDIA_CONSUMER_TOPIC).toBe('convert.media');
    });
});
