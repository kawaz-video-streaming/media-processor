import { Consumer } from "@ido_kawaz/amqp-client";
import { ConvertMediaConsumerBinding, createConvertMediaConsumerBinding } from "./binding";
import { ConvertMedia, validateConvertMediaPayload } from "./index";
import { StorageClient } from "@ido_kawaz/storage-client";
import { convertMediaHandler } from "./handler";


export const createConvertMediaConsumer = (storageClient: StorageClient) =>
    new Consumer<ConvertMedia, ConvertMediaConsumerBinding>(createConvertMediaConsumerBinding(), validateConvertMediaPayload, convertMediaHandler(storageClient));