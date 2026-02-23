import { getConfig } from "./config";
import { startSystem } from "./services/system";

const main = async () => {
    const config = getConfig(process.env);
    await startSystem(config);
};

main().then(() => {
    console.log("System started successfully")
}).catch((error) => {
    console.error(`Error starting the system: \n${error.message}`);
    process.exit(1);
});