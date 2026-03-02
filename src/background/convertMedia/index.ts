import { Consumer } from "@ido_kawaz/amqp-client";
import { StorageClient } from "@ido_kawaz/storage-client";
import { ConvertMediaConsumerBinding, createConvertMediaConsumerBinding } from "./binding";
import { convertMediaHandler } from "./handler";
import { ConvertMedia, ConvertMediaConfig, validateConvertMediaPayload } from "./types";


export const createConvertMediaConsumer = (storageClient: StorageClient, config: ConvertMediaConfig) =>
    new Consumer<ConvertMedia, ConvertMediaConsumerBinding>(
        'convert-media',
        createConvertMediaConsumerBinding(),
        validateConvertMediaPayload,
        convertMediaHandler(storageClient, config));