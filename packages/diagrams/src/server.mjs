// static server for render.mjs: / -> src/index.html, /bundle.js -> out/bundle.js,
// /assets/* -> excalidraw's dist/prod, which holds the Excalifont files
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PROD = path.join(ROOT, "node_modules/@excalidraw/excalidraw/dist/prod");
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".html": "text/html", ".json": "application/json" };

export function start(port) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    let file;
    if (url.pathname === "/") file = path.join(ROOT, "src/index.html");
    else if (url.pathname === "/bundle.js") file = path.join(ROOT, "out/bundle.js");
    else if (url.pathname.startsWith("/assets/")) file = path.join(PROD, url.pathname.slice("/assets/".length));
    else file = path.join(ROOT, "out", url.pathname);
    if (!path.resolve(file).startsWith(ROOT)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
