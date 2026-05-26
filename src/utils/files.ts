import { mkdir, readdir, rm } from 'fs/promises';
import { join } from 'path';

const TMP_PATH = join(__dirname, '../../tmp');

export const formatPath = (filePath: string) => filePath.replace(/\\/g, '/');

export const collectFilesRecursively = async (dirPath: string): Promise<string[]> => {
    const dirEntries = await readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(dirEntries.map(async (entry) => {
        const entryPath = join(dirPath, entry.name);
        if (entry.isDirectory()) {
            return collectFilesRecursively(entryPath);
        }

        if (entry.isFile()) {
            return [entryPath];
        }

        return [];
    }));

    return files.flat();
};

export const createTempFolder = () => mkdir(TMP_PATH, { recursive: true });

export const cleanTempFolder = async () => {
    const entries = await readdir(TMP_PATH, { withFileTypes: true }).catch(() => []);
    await Promise.all(entries.map(entry => rm(join(TMP_PATH, entry.name), { recursive: true, force: true })));
};
