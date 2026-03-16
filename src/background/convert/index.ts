import { AmqpClient, Consumer } from "@ido_kawaz/amqp-client";
import { StorageClient } from "@ido_kawaz/storage-client";
import { ConvertMediaConsumerBinding, createConvertConsumerBinding } from "./binding";
import { convertMediaHandler, onConvertSuccessHandler } from "./handler";
import { Convert, ConvertConfig, validateConvertPayload, VideoMetadata } from "./types";


export const createConvertConsumer = (storageClient: StorageClient, amqpClient: AmqpClient, config: ConvertConfig) =>
    new Consumer<Convert, ConvertMediaConsumerBinding, VideoMetadata>('convert', createConvertConsumerBinding())
        .on('validateMessage', validateConvertPayload)
        .on('handleMessage', convertMediaHandler(storageClient, config))
        .on('handleSuccess', onConvertSuccessHandler(amqpClient));