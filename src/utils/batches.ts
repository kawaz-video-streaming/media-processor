
const batchify = <T>(items: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
        items.slice(i * size, Math.min(i * size + size, items.length))
    );

export const RunInBatches = async <T, R>(
    items: T[],
    batchSize: number,
    handler: (item: T) => Promise<R>,
    generateProgressMessage: (index: number, totalBatches: number) => string
): Promise<R[]> => {
    const batches = batchify(items, batchSize);
    const count = batches.length;
    const progressInterval = Math.max(1, Math.floor(count / 10));
    let results: R[] = [];
    for (let i = 0; i < count; i++) {
        results = results.concat(await Promise.all(batches[i].map(handler)));
        if (i % progressInterval === 0 || i === count - 1) {
            console.log(generateProgressMessage(i + 1, count));
        }
    }
    return results;
}