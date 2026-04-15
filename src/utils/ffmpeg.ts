import { execFile } from 'child_process';
import ffmpeg, { FfprobeData } from 'fluent-ffmpeg';
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

export const runFfmpegWithInputOptions = (inputSource: string, outputPath: string, inputOptions: string[], outputOptions: string[] = []) =>
    new Promise<void>((resolve, reject) =>
        ffmpeg(inputSource)
            .inputOptions(inputOptions)
            .outputOptions(outputOptions)
            .output(outputPath)
            .on('error', (err, stdout, stderr) => {
                console.error('Error during conversion:', err.message);
                console.error('FFmpeg stdout:', stdout);
                console.error('FFmpeg stderr:', stderr);
                reject(err);
            })
            .on('end', () => resolve())
            .run()
    );

export const runFfmpeg = (inputSource: string, outputPath: string, outputOptions: string[] = [], onProgress?: (pct: number) => void) =>
    new Promise<void>((resolve, reject) =>
        ffmpeg(inputSource)
            .outputOptions(outputOptions)
            .output(outputPath)
            .on('progress', progress => {
                if (onProgress && isNotNil(progress.percent)) {
                    const validProgress = !isNaN(progress.percent) && progress.percent >= 0 && progress.percent <= 100;
                    if (validProgress) {
                        onProgress(progress.percent);
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