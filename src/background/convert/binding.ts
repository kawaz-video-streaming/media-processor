import { createConsumerBinding } from "@ido_kawaz/amqp-client";

const CONVERT_MEDIA_CONSUMER_QUEUE = 'media-processor-convert'
export const CONVERT_MEDIA_CONSUMER_EXCHANGE = 'convert'
export const CONVERT_MEDIA_CONSUMER_TOPIC = 'convert.media'

export const createConvertConsumerBinding =
    () => createConsumerBinding(CONVERT_MEDIA_CONSUMER_QUEUE, CONVERT_MEDIA_CONSUMER_EXCHANGE, CONVERT_MEDIA_CONSUMER_TOPIC);

export type ConvertMediaConsumerBinding = {
    queue: typeof CONVERT_MEDIA_CONSUMER_QUEUE;
    exchange: typeof CONVERT_MEDIA_CONSUMER_EXCHANGE;
    topic: typeof CONVERT_MEDIA_CONSUMER_TOPIC;
}