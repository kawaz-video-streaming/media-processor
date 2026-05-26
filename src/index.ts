import { getConfig } from "./config";
import { startSystem } from "./services/system";
import { cleanTempFolder, createTempFolder } from "./utils/files";

const shutdown = async () => {
    try {
        await cleanTempFolder();
    } catch (error) {
        console.error('Failed to clean tmp folder during shutdown:', error);
    }
    process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

const main = async () => {
    const config = getConfig(process.env);
    if (config.env === 'local') {
        await createTempFolder();
    }
    await startSystem(config);
};

main().then(() => {
    console.log("System started successfully")
}).catch((error) => {
    console.error(`Error starting the system: \n${error.message}`);
    process.exit(1);
});