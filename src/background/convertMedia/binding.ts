import { createConsumerBinding } from "@ido_kawaz/amqp-client";

const CONVERT_MEDIA_CONSUMER_QUEUE = 'media-processor-converter'
const CONVERT_MEDIA_CONSUMER_EXCHANGE = 'converter'
const CONVERT_MEDIA_CONSUMER_TOPIC = 'uploaded.media'

export const createConvertMediaConsumerBinding =
    () => createConsumerBinding(CONVERT_MEDIA_CONSUMER_QUEUE, CONVERT_MEDIA_CONSUMER_EXCHANGE, CONVERT_MEDIA_CONSUMER_TOPIC);

export type ConvertMediaConsumerBinding = {
    queue: typeof CONVERT_MEDIA_CONSUMER_QUEUE;
    exchange: typeof CONVERT_MEDIA_CONSUMER_EXCHANGE;
    topic: typeof CONVERT_MEDIA_CONSUMER_TOPIC;
}