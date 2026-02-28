import fs from 'fs';
import path from 'path';

export const formatPath = (filePath: string) => filePath.replace(/\\/g, '/');

export const collectFilesRecursively = async (dirPath: string): Promise<string[]> => {
    const dirEntries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(dirEntries.map(async (entry) => {
        const entryPath = path.join(dirPath, entry.name);
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

export const createTempFolder = () => fs.promises.mkdir(path.join(__dirname, '../../tmp'), { recursive: true });
