import { KafkaJS } from "@confluentinc/kafka-javascript";

const { Kafka } = KafkaJS;

// single shared client for the whole process - producer and consumer
// each get their own instance from this, but the underlying connection
// config lives in exactly one place.
const kafka = new Kafka({
  kafkaJS: {
    brokers: ["localhost:9092"],
    clientId: "crypto-exchange-api",
  },
});

export const TRADE_TOPIC = "trade-events";
export const DEPTH_TOPIC = "depth-events";

export const kafkaProducer = kafka.producer({
  kafkaJS: {
    allowAutoTopicCreation: true,
  },
});

export function createKafkaConsumer(groupId: string) {
  return kafka.consumer({ kafkaJS: { groupId } });
}

let producerConnected = false;

// connects once, lazily, on first publish - avoids a separate boot-time
// step and avoids reconnecting on every single publish call
export async function ensureProducerConnected(): Promise<void> {
  if (producerConnected) return;
  await kafkaProducer.connect();
  producerConnected = true;
}