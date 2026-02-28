import ffmpeg, { ffprobe, FfprobeData } from 'fluent-ffmpeg';
import { isNotNil } from 'ramda';
import { Readable } from 'stream';

export const runFfprobe = (inputPath: string) =>
    new Promise<FfprobeData>((resolve, reject) => ffprobe(inputPath, (err, data) => err ? reject(err) : resolve(data)));

export const runFfmpeg = (inputSource: string | Readable, outputPath: string, outputOptions: string[] = [], logProgress: boolean = false) =>
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