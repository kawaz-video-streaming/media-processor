import { Consumer } from "@ido_kawaz/amqp-client";
import { ConvertMediaConsumerBinding, createConvertMediaConsumerBinding } from "./binding";
import { ConvertMedia, ConvertMediaConfig, validateConvertMediaPayload } from "./index";
import { StorageClient } from "@ido_kawaz/storage-client";
import { convertMediaHandler } from "./handler";


export const createConvertMediaConsumer = (storageClient: StorageClient, config: ConvertMediaConfig) =>
    new Consumer<ConvertMedia, ConvertMediaConsumerBinding>(
        createConvertMediaConsumerBinding(),
        validateConvertMediaPayload,
        convertMediaHandler(storageClient, config));