import { getConfig } from "./config";
import { startSystem } from "./services/system";
import { createTempFolder } from "./utils/files";

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