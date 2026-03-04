import { Consumer } from "@ido_kawaz/amqp-client";
import { StorageClient } from "@ido_kawaz/storage-client";
import { ConvertMediaConsumerBinding, createConvertConsumerBinding } from "./binding";
import { convertMediaHandler } from "./handler";
import { Convert, ConvertConfig, validateConvertPayload } from "./types";


export const createConvertConsumer = (storageClient: StorageClient, config: ConvertConfig) =>
    new Consumer<Convert, ConvertMediaConsumerBinding>('convert', createConvertConsumerBinding())
        .on('validateMessage', validateConvertPayload)
        .on('handleMessage', convertMediaHandler(storageClient, config));