import { TTM_ID } from "./constants.js";

class PlacementManager {
  centerOnPoint(x, y, width, height) {
    return {
      x: Math.round(Number(x) - Number(width || 100) / 2),
      y: Math.round(Number(y) - Number(height || 100) / 2)
    };
  }

  addPlacementFlags(utility = {}) {
    return {
      ...utility,
      awaitingPlacement: true,
      placementStartedAt: Date.now()
    };
  }

  isReady(tileDoc) {
    const utility = tileDoc?.getFlag?.(TTM_ID, "utility") ?? {};
    return utility.awaitingPlacement !== true;
  }

  async finish(tileDoc) {
    if (!tileDoc) return null;

    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await tileDoc.update({
      [`flags.${TTM_ID}.utility.awaitingPlacement`]: false
    });

    return canvas.scene?.tiles?.get(tileDoc.id) ?? tileDoc;
  }
}

export const placementManager = new PlacementManager();
