import ffmpeg, { FfprobeData } from 'fluent-ffmpeg';
import { execFile } from 'child_process';
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

export const runFfmpeg = (inputSource: string, outputPath: string, outputOptions: string[] = [], logProgress: boolean = false) =>
    new Promise<void>((resolve, reject) =>
        ffmpeg(inputSource)
            .outputOptions(outputOptions)
            .output(outputPath)
            .on('progress', progress => {
                if (logProgress && isNotNil(progress.percent) && !isNaN(progress.percent)) {
                    console.log(`Processing: ${progress.percent.toFixed(2)}% done`);
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