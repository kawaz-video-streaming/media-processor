export class NonVideoMediaError extends Error {
    constructor() {
        super('No video stream found in media');
    }
}
