import { AmqpClient } from '@ido_kawaz/amqp-client';
import { execFile } from 'child_process';
import ffmpeg, { FfprobeData } from 'fluent-ffmpeg';
import { Progress } from '../background/convert/types';
import { isNotNil } from 'ramda';

export const isEncoderAvailable = (encoder: string): Promise<boolean> =>
    new Promise(resolve =>
        execFile('ffmpeg', ['-encoders', '-v', 'quiet'], (_err, stdout) =>
            resolve(stdout.includes(encoder))
        )
    );

export const runFfprobe = (inputPath: string) =>
    new Promise<FfprobeData>((resolve, reject) =>
        execFile('ffprobe', [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            '-show_chapters',
            inputPath
        ], (err, stdout) => err ? reject(err) : resolve(JSON.parse(stdout) as FfprobeData)));

export const runFfmpeg = (inputSource: string, outputPath: string, outputOptions: string[] = [], amqpClient?: AmqpClient, mediaId?: string) =>
    new Promise<void>((resolve, reject) =>
        ffmpeg(inputSource)
            .outputOptions(outputOptions)
            .output(outputPath)
            .on('progress', progress => {
                if (isNotNil(progress.percent)) {
                    const logProgress = isNotNil(mediaId) && isNotNil(amqpClient);
                    const validProgress = !isNaN(progress.percent) && progress.percent >= 0 && progress.percent <= 100;
                    const enoughProgress = progress.percent % 17 < 1;
                    const shouldLog = logProgress && validProgress && enoughProgress;
                    if (shouldLog) {
                        const percentage = 50 + (progress.percent / 100) * 35;
                        amqpClient.publish<Progress>('progress', 'progress.media', { mediaId, percentage, status: 'processing' });
                    }
                }
            })
            .on('error', (err, stdout, stderr) => {
                console.error('Error during conversion:', err.message);
                console.error('FFmpeg stdout:', stdout);
                console.error('FFmpeg stderr:', stderr);
                reject(err);
            })
            .on('end', () => resolve())
            .run()
    );