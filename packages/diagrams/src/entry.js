import { convertToExcalidrawElements, exportToSvg, FONT_FAMILY } from "@excalidraw/excalidraw";

window.FONT_FAMILY = FONT_FAMILY;

window.renderDiagram = async (skeleton, background) => {
  const elements = convertToExcalidrawElements(skeleton, { regenerateIds: false });
  const appState = {
    exportBackground: true,
    viewBackgroundColor: background,
    exportWithDarkMode: false,
    exportEmbedScene: false,
    exportScale: 1,
  };
  const svg = await exportToSvg({ elements, appState, files: null, exportPadding: 32 });
  return { elements, appState, svg: svg.outerHTML };
};
window.rendererReady = true;
