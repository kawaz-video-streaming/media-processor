import { AmqpClient, Consumer } from "@ido_kawaz/amqp-client";
import { StorageClient } from "@ido_kawaz/storage-client";
import { ConvertMediaConsumerBinding, createConvertConsumerBinding } from "./binding";
import { ConversionFatalError, ConversionRetriableError } from "./errors";
import { ConvertHandlerSuccessResult, convertMediaHandler, onConvertSuccessHandler } from "./handler";
import { Convert, ConvertConfig, validateConvertPayload } from "./types";
import { cleanupWorkspace } from "./utils";


export const createConvertConsumer = (storageClient: StorageClient, amqpClient: AmqpClient, config: ConvertConfig) =>
    new Consumer<Convert, ConvertMediaConsumerBinding, ConvertHandlerSuccessResult>('convert', createConvertConsumerBinding())
        .on('validateMessage', validateConvertPayload)
        .on('handleMessage', convertMediaHandler(storageClient, config))
        .on('handleSuccess', onConvertSuccessHandler(amqpClient))
        .on('handleRetriableError', async (error) => {
            if (error instanceof ConversionRetriableError) {
                await cleanupWorkspace(error.workDirPath);
            }
        })
        .on('handleFatalError', async (error, payload) => {
            if (validateConvertPayload(payload)) {
                amqpClient.publish('progress', 'progress.media', { mediaId: payload.mediaId, status: 'failed' });
            }
            if (error instanceof ConversionFatalError) {
                await cleanupWorkspace(error.workDirPath);
            }
        });
