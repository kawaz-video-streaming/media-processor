import { validateConvertPayload } from '../types';

describe('validateConvertPayload', () => {
    const validPayload = {
        mediaId: '507f1f77bcf86cd799439011',
        mediaName: 'video.mp4',
        mediaStorageBucket: 'raw-bucket',
        mediaRoutingKey: 'media/video.mp4'
    };

    it('should return true for a valid payload', () => {
        expect(validateConvertPayload(validPayload)).toBe(true);
    });

    it('should return false when mediaId is missing', () => {
        const { mediaId: _, ...payload } = validPayload;
        expect(validateConvertPayload(payload)).toBe(false);
    });

    it('should return false when mediaId is not a valid ObjectId', () => {
        const payload = { ...validPayload, mediaId: 'not-an-object-id' };
        expect(validateConvertPayload(payload)).toBe(false);
    });

    it('should return false when mediaName is missing', () => {
        const { mediaName: _, ...payload } = validPayload;
        expect(validateConvertPayload(payload)).toBe(false);
    });

    it('should return false when mediaStorageBucket is missing', () => {
        const { mediaStorageBucket: _, ...payload } = validPayload;
        expect(validateConvertPayload(payload)).toBe(false);
    });

    it('should return false when mediaRoutingKey is missing', () => {
        const { mediaRoutingKey: _, ...payload } = validPayload;
        expect(validateConvertPayload(payload)).toBe(false);
    });

    it('should return false for null payload', () => {
        expect(validateConvertPayload(null)).toBe(false);
    });

    it('should return false for undefined payload', () => {
        expect(validateConvertPayload(undefined)).toBe(false);
    });

    it('should return false when mediaName is not a string', () => {
        const payload = { ...validPayload, mediaName: 123 };
        expect(validateConvertPayload(payload)).toBe(false);
    });
});
