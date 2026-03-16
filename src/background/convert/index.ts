import { AmqpClient, Consumer } from "@ido_kawaz/amqp-client";
import { StorageClient } from "@ido_kawaz/storage-client";
import { ConvertMediaConsumerBinding, createConvertConsumerBinding } from "./binding";
import { convertMediaHandler } from "./handler";
import { Convert, ConvertConfig, validateConvertPayload, Video, VideoMetadata } from "./types";
import { isNotEmpty } from "ramda";


export const createConvertConsumer = (storageClient: StorageClient, amqpClient: AmqpClient, config: ConvertConfig) =>
    new Consumer<Convert, ConvertMediaConsumerBinding, VideoMetadata>('convert', createConvertConsumerBinding())
        .on('validateMessage', validateConvertPayload)
        .on('handleMessage', convertMediaHandler(storageClient, config))
        .on('handleSuccess', async ({ mediaId }, videoMetadata) => {
            const video: Video = {
                id: mediaId,
                playUrl: `${mediaId}/output.mpd`,
                ...(isNotEmpty(videoMetadata.chapters) ? { chaptersUrl: `${mediaId}/chapters.vtt` } : {}),
                ...videoMetadata
            }
            amqpClient.publish('register', 'register.media', { video });
        });