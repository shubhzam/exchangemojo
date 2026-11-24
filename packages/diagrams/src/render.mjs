// pnpm --filter @repo/diagrams render [out-dir]
//
// renders each skeleton in diagrams.mjs with excalidraw's own
// convertToExcalidrawElements + exportToSvg in headless chromium, then writes
// <name>.excalidraw and a 2x png (default out-dir: apps/docs/diagrams).
// fails if the text did not render in Excalifont.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { start } from "./server.mjs";
import { architecture, orderStatus } from "./diagrams.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.resolve(process.argv[2] ?? path.join(HERE, "../../../apps/docs/diagrams"));
const BG = "#0a0a0a";
await mkdir(OUT, { recursive: true });
const server = await start(47811);
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 2000, height: 1400 } });
const failed = [];
page.on("requestfailed", (r) => failed.push(r.url()));
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto("http://127.0.0.1:47811/");
await page.waitForFunction(() => window.rendererReady === true);

for (const [name, skeleton] of [["architecture", architecture], ["order-status", orderStatus]]) {
  const result = await page.evaluate(async ([s, bg]) => window.renderDiagram(s, bg), [skeleton, BG]);
  const scene = {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements: result.elements,
    appState: { viewBackgroundColor: BG, gridSize: 20 },
    files: {},
  };
  await writeFile(path.join(OUT, `${name}.excalidraw`), JSON.stringify(scene, null, 2) + "\n");

  await page.evaluate((svg) => {
    document.getElementById("stage").innerHTML = svg;
  }, result.svg);
  await page.evaluate(() => document.fonts.ready);

  // font check: the svg must carry an inlined Excalifont face, the text must
  // ask for it first, and the browser must report it loaded
  const fontInfo = await page.evaluate(() => {
    const svg = document.querySelector("#stage svg");
    const style = svg.querySelector("style")?.textContent ?? "";
    const families = [...new Set([...svg.querySelectorAll("text")].map((t) => t.getAttribute("font-family")))];
    const loaded = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family);
    return {
      inlinedFace: /font-family:\s*"?Excalifont/.test(style) && style.includes("base64"),
      families,
      loaded: [...new Set(loaded)],
      checkExcalifont: document.fonts.check('20px "Excalifont"'),
      size: { w: svg.getAttribute("width"), h: svg.getAttribute("height") },
    };
  });
  console.log(name, JSON.stringify(fontInfo));
  if (!fontInfo.inlinedFace || !fontInfo.checkExcalifont || !fontInfo.families.every((f) => f?.startsWith("Excalifont"))) {
    throw new Error(`${name}: text did not render in Excalifont`);
  }

  const png = await page.locator("#stage svg").screenshot({ omitBackground: false });
  await writeFile(path.join(OUT, `${name}.png`), png);
  console.log(`${name}.png ${(png.length / 1024).toFixed(0)}KB`);
}
if (failed.length) console.log("failed requests:", failed);
console.log(`written to ${OUT}`);
await browser.close();
server.close();
