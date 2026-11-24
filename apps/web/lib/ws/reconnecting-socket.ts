const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 10_000;

export type SocketHandlers = {
  onOpen: () => void;
  onClose: () => void;
  onMessage: (data: unknown) => void;
};

// one websocket that reconnects with exponential backoff (500ms doubling,
// capped at 10s, with jitter) until close() is called
export function openReconnectingSocket(url: string, handlers: SocketHandlers): { close: () => void } {
  let socket: WebSocket | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const connect = () => {
    if (closed) return;
    const ws = new WebSocket(url);
    socket = ws;

    ws.onopen = () => {
      attempt = 0;
      handlers.onOpen();
    };
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      handlers.onMessage(parsed);
    };
    ws.onclose = () => {
      if (closed) return;
      handlers.onClose();
      const backoff = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
      const delay = Math.min(BACKOFF_MAX_MS, backoff * (0.8 + Math.random() * 0.4));
      attempt += 1;
      timer = setTimeout(connect, delay);
    };
    // an error is always followed by close, which schedules the retry
    ws.onerror = () => {};
  };

  connect();

  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
    },
  };
}
