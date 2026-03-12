import ffmpeg, { FfprobeData } from 'fluent-ffmpeg';
import { execFile } from 'child_process';
import { isNotNil } from 'ramda';
import { Readable } from 'stream';

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

export const runFfmpeg = (inputSources: (string | Readable)[], outputPath: string, outputOptions: string[] = [], logProgress: boolean = false) =>
    new Promise<void>((resolve, reject) => {
        const command = ffmpeg();
        inputSources.map(source => command.addInput(source));
        command
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
    });