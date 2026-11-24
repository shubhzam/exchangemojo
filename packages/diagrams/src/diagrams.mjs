// excalidraw skeletons. every box and arrow is checked against apps/api/src:
// routes/orders.ts, services/order-service.ts, services/balance-service.ts,
// services/streaming-service.ts, streaming/gateway.ts,
// matching-engine/registry.ts, lib/redis.ts, index.ts.
const ORANGE = "#ff7a00";
const TEXT = "#f5f5f5";
const MUTED = "#9a9a9a";
const FONT = 5; // Excalifont
const BOX_FONT = 28;
const ARROW_FONT = 25;

// fixed per-element seed so re-renders draw the same hand-drawn strokes
function seedFor(id) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 2147483647 || 1;
}

function box(id, x, y, width, height, text, { secondary = false, fontSize = BOX_FONT, dashed = false } = {}) {
  return {
    type: "rectangle",
    id,
    seed: seedFor(id),
    x,
    y,
    width,
    height,
    strokeColor: secondary ? MUTED : ORANGE,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: dashed ? "dashed" : "solid",
    roughness: 1,
    roundness: { type: 3 },
    ...(text ? { label: { text, fontSize, fontFamily: FONT, strokeColor: TEXT } } : {}),
  };
}

function arrow(id, from, to, x, y, points, text, { style = "solid", color = ORANGE, fontSize = ARROW_FONT } = {}) {
  return {
    type: "arrow",
    id,
    seed: seedFor(id),
    x,
    y,
    points,
    strokeColor: color,
    strokeStyle: style,
    strokeWidth: 2,
    roughness: 1,
    endArrowhead: "arrow",
    ...(from ? { start: { id: from } } : {}),
    ...(to ? { end: { id: to } } : {}),
    ...(text ? { label: { text, fontSize, fontFamily: FONT, strokeColor: TEXT } } : {}),
  };
}

function text(id, x, y, value, { fontSize = 24, color = MUTED } = {}) {
  return { type: "text", id, seed: seedFor(id), x, y, text: value, fontSize, fontFamily: FONT, strokeColor: color };
}

// straight arrow between two absolute points
const line = (id, from, to, [x1, y1], [x2, y2], label, opts) =>
  arrow(id, from, to, x1, y1, [[0, 0], [x2 - x1, y2 - y1]], label, opts);

export const architecture = [
  // outside the api process
  box("redis", -150, 40, 260, 110, "Redis\nhealth check only", { secondary: true }),
  box("browser", -150, 330, 260, 150, "browser\nNext.js web\n:3000"),
  box("postgres", 1480, 220, 270, 250, "Postgres\norders, trades,\nbalances"),
  box("kafka", 1480, 570, 270, 150, "Kafka\ntrade-events\ndepth-events"),

  // the api process
  box("api", 330, 0, 880, 900, null, { secondary: true }),
  text("api-title", 355, 18, "api process :4000"),
  box("matching", 880, 70, 300, 140, "matching engine\nin-memory book\nper market"),
  box("routes", 420, 330, 260, 140, "routes\nExpress 5"),
  box("order", 880, 330, 300, 140, "order service"),
  box("streaming", 880, 590, 300, 120, "streaming service\n(publisher)"),
  box("gateway", 400, 720, 330, 150, "websocket gateway\nKafka consumer +\nconnection registry"),

  // request path, in the order createOrder runs it
  line("a1", "browser", "routes", [112, 370], [418, 370], "1 POST /api/v3/order"),
  line("a2", "routes", "order", [682, 400], [878, 400], "2 createOrder"),
  line("a3", "order", "postgres", [1182, 360], [1478, 360], "3 reserve funds\nfree to locked (tx 1)"),
  line("a4", "order", "matching", [1030, 328], [1030, 212], "4 match + mutate\nbook (sync)"),
  line("a5", "order", "postgres", [1182, 440], [1478, 440], "5 persist + settle\n(tx 2, commit)"),
  line("a6", "order", "streaming", [1030, 472], [1030, 588], "6 publish,\nnot awaited", { style: "dashed" }),
  line("a7", "routes", "browser", [418, 440], [112, 440], "7 201 + fills"),
  line("a8", "streaming", "kafka", [1182, 650], [1478, 650], "8 produce"),
  line("a9", "kafka", "gateway", [1478, 700], [732, 810], "9 consume"),
  line("a10", "gateway", "browser", [398, 790], [-20, 482], "10 push\n@trade, @depth"),

  // boot and health only
  line("d1", "postgres", "matching", [1560, 218], [1182, 130], "boot: rebuild books\nfrom resting orders", { style: "dotted" }),
  line("d2", "routes", "redis", [480, 328], [20, 152], "GET /health\nPING", { style: "dotted" }),

  text(
    "legend",
    -150,
    930,
    "solid: request path    dashed: fire and forget after commit    dotted: boot and /health only",
    { fontSize: 24 },
  ),
];

export const orderStatus = [
  box("start", -80, 300, 230, 110, "POST\n/api/v3/order", { secondary: true }),

  box("resting", 340, 80, 470, 580, null, { secondary: true, dashed: true }),
  text("resting-title", 360, 92, "resting in the book"),
  box("new", 400, 150, 320, 100, "NEW"),
  box("partial", 400, 450, 320, 100, "PARTIALLY_FILLED"),

  box("filled", 1040, 150, 260, 100, "FILLED"),
  box("canceled", 1040, 470, 260, 100, "CANCELED"),

  line("s-new", "start", "new", [152, 330], [398, 210], "no fill"),
  line("s-partial", "start", "partial", [152, 385], [398, 490], "some fills"),
  arrow(
    "s-filled",
    "start",
    "filled",
    35,
    298,
    [[0, 0], [0, -278], [1135, -278], [1135, -150]],
    "fills completely on arrival",
  ),

  line("new-partial", "new", "partial", [560, 252], [560, 448], "maker partly\nfilled"),
  arrow(
    "partial-loop",
    null,
    null,
    640,
    552,
    [[0, 0], [0, 40], [-160, 40], [-160, 2]],
    "more fills",
  ),
  line("resting-filled", "resting", "filled", [812, 200], [1038, 200], "remaining\nreaches 0"),
  line("resting-canceled", "resting", "canceled", [812, 500], [1038, 500], "DELETE\n/api/v3/order"),

  text("note", 1040, 600, "final states: cancel returns\n404 order_not_found"),
];
