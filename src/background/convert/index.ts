import { AmqpClient, Consumer } from "@ido_kawaz/amqp-client";
import { StorageClient } from "@ido_kawaz/storage-client";
import { ConvertMediaConsumerBinding, createConvertConsumerBinding } from "./binding";
import { ConversionFatalError, ConversionRetriableError } from "./errors";
import { convertMediaHandler, onConvertSuccessHandler } from "./handler";
import { Convert, ConvertConfig, ConvertHandlerSuccessResult, Progress, validateConvertPayload } from "./types";
import { cleanupWorkspace } from "./utils";


export const createConvertConsumer = (storageClient: StorageClient, amqpClient: AmqpClient, config: ConvertConfig) =>
    new Consumer<Convert, ConvertMediaConsumerBinding, ConvertHandlerSuccessResult>('convert', createConvertConsumerBinding())
        .on('validateMessage', validateConvertPayload)
        .on('handleMessage', convertMediaHandler(amqpClient, storageClient, config))
        .on('handleSuccess', onConvertSuccessHandler(amqpClient))
        .on('handleRetriableError', async (error) => {
            if (error instanceof ConversionRetriableError) {
                await cleanupWorkspace(error.workDirPath);
            }
        })
        .on('handleFatalError', async (error, payload) => {
            if (validateConvertPayload(payload)) {
                amqpClient.publish<Progress>('progress', 'progress.media', { mediaId: payload.mediaId, percentage: 0, status: 'failed' });
            }
            if (error instanceof ConversionFatalError) {
                await cleanupWorkspace(error.workDirPath);
            }
        });
