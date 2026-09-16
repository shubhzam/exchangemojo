import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { createKafkaConsumer, TRADE_TOPIC, DEPTH_TOPIC } from "../lib/kafka.js";
import { MARKETS, type Market } from "@repo/shared";

// which sockets are subscribed to which stream. key is "<symbol>@<type>",
// e.g. "SOLUSDC@trade". connections come and go with the process's own
// lifecycle - nothing here is rebuilt from postgres, unlike the order book.
const connections = new Map<string, Set<WebSocket>>();

function streamKey(symbol: string, streamType: string): string {
  return `${symbol}@${streamType}`;
}

function parseStreamPath(path: string): { symbol: Market; streamType: "depth" | "trade" } | null {
  // expects "/ws/<symbol>@<type>", e.g. "/ws/SOLUSDC@depth"
  const match = path.match(/^\/ws\/([A-Z]+)@(depth|trade)$/);
  if (!match) return null;

  const [, symbolRaw, streamType] = match;
  if (!MARKETS.includes(symbolRaw as Market)) return null;

  return { symbol: symbolRaw as Market, streamType: streamType as "depth" | "trade" };
}

export function attachStreamingGateway(httpServer: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const parsed = parseStreamPath(req.url ?? "");
    if (!parsed) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const key = streamKey(parsed.symbol, parsed.streamType);
      let set = connections.get(key);
      if (!set) {
        set = new Set();
        connections.set(key, set);
      }
      set.add(ws);

      ws.on("close", () => {
        set?.delete(ws);
      });
    });
  });

  startKafkaConsumer().catch((err) => {
    console.error("kafka consumer failed to start:", err);
  });
}

async function startKafkaConsumer(): Promise<void> {
  const consumer = createKafkaConsumer("ws-gateway");
  await consumer.connect();
  await consumer.subscribe({ topics: [TRADE_TOPIC, DEPTH_TOPIC] });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;

      const event = JSON.parse(message.value.toString());
      const symbol: string = event.s;
      const streamType = topic === TRADE_TOPIC ? "trade" : "depth";
      const key = streamKey(symbol, streamType);

      const set = connections.get(key);
      if (!set || set.size === 0) return;

      const payload = message.value.toString();
      for (const ws of set) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    },
  });
}