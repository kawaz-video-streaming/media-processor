import { mkdir, readdir } from 'fs/promises';
import { join } from 'path';

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

export const createTempFolder = () => mkdir(join(__dirname, '../../tmp'), { recursive: true });
