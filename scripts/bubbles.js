// =============================================================================
// TalkToMe PIXI bubble layer
// =============================================================================
// This replaces the old HTML overlay bubbles.
//
// Why PIXI?
// Foundry renders scenes with PIXI. Putting TalkToMe bubbles into the canvas
// means they pan and zoom with the scene instead of needing browser DOM
// coordinate conversions.
//
// The bubble still uses sockets. Each connected client receives the speech event
// and draws the bubble locally inside their own canvas.

import { TTM_ID } from "./constants.js";

export class TalkToMeBubbleManager {
  constructor() {
    // Parent PIXI container for every active speech bubble.
    this.layer = null;

    // Active bubble data, keyed by bubble id.
    this.bubbles = new Map();

    // Bound updater used by Foundry hooks.
    this.boundUpdate = () => this.updatePositions();
  }

  // Initialise the PIXI layer and update hooks.
  init() {
    this.ensureLayer();

    Hooks.on("canvasReady", () => {
      this.clear();
      this.ensureLayer();
    });

    Hooks.on("canvasPan", this.boundUpdate);
    Hooks.on("updateToken", this.boundUpdate);
    Hooks.on("controlToken", this.boundUpdate);
    Hooks.on("refreshToken", this.boundUpdate);
  }

  // Create the canvas layer if it does not already exist.
  ensureLayer() {
    if (!canvas?.stage) return null;

    if (this.layer && !this.layer.destroyed) return this.layer;

    const layer = new PIXI.Container();
    layer.name = "talk-to-me-bubble-layer";
    layer.sortableChildren = true;
    layer.zIndex = 999999;

    // Adding to canvas.stage means the layer exists in world space.
    // Each bubble is positioned using scene/world coordinates.
    canvas.stage.addChild(layer);

    this.layer = layer;
    return layer;
  }

  // Display one speech bubble.
  show({
    sceneId = "",
    tokenId = "",
    text = "",
    speakerName = "",
    duration = null,
    bubbleId = "",
    world = null
  } = {}) {
    if (!canvas?.scene || sceneId !== canvas.scene.id) return;
    if (!text) return;

    const token = tokenId ? canvas.tokens?.get(tokenId) : null;

    // If the receiving client cannot resolve the token, use the world position
    // sent by the GM through the socket payload.
    if (!token && !world) return;

    const layer = this.ensureLayer();
    if (!layer) return;

    const id = bubbleId || `${sceneId}.${tokenId || "world"}.${Date.now()}`;

    // Replace any older active bubble from this same token.
    if (tokenId) this.removeByToken(tokenId);

    const container = this.createBubbleDisplay({
      text,
      speakerName: speakerName || token?.name || "NPC"
    });

    container.name = `talk-to-me-bubble-${id}`;
    container.alpha = 0;
    container.zIndex = 999999;

    layer.addChild(container);

    const timeout = window.setTimeout(
      () => this.remove(id),
      duration ?? game.settings.get(TTM_ID, "bubbleDuration") ?? 5500
    );

    this.bubbles.set(id, {
      id,
      tokenId,
      world,
      container,
      timeout
    });

    this.updateBubblePosition(id);

    // Small fade-in animation.
    this.fade(container, 0, 1, 160);
  }

  // Create the PIXI graphics/text that make up the speech bubble.
  createBubbleDisplay({ text = "", speakerName = "" } = {}) {
    const container = new PIXI.Container();

    const maxWidth = 320;
    const paddingX = 12;
    const paddingY = 9;
    const nameGap = speakerName ? 4 : 0;

    const nameText = new PIXI.Text(speakerName, {
      fontFamily: "Arial",
      fontSize: 13,
      fontWeight: "bold",
      fill: 0xffd98a,
      wordWrap: true,
      wordWrapWidth: maxWidth
    });

    const bodyText = new PIXI.Text(text, {
      fontFamily: "Arial",
      fontSize: 15,
      fill: 0xf8f1df,
      wordWrap: true,
      wordWrapWidth: maxWidth,
      lineHeight: 19
    });

    nameText.x = paddingX;
    nameText.y = paddingY;

    bodyText.x = paddingX;
    bodyText.y = paddingY + (speakerName ? nameText.height + nameGap : 0);

    const contentWidth = Math.max(
      speakerName ? nameText.width : 0,
      bodyText.width,
      110
    );

    const contentHeight =
      (speakerName ? nameText.height + nameGap : 0) + bodyText.height;

    const boxWidth = Math.min(maxWidth + paddingX * 2, contentWidth + paddingX * 2);
    const boxHeight = contentHeight + paddingY * 2;

    const bg = new PIXI.Graphics();

    // Background box.
    bg.beginFill(0x141414, 0.96);
    bg.lineStyle(2, 0xffdc8c, 0.85);
    bg.drawRoundedRect(0, 0, boxWidth, boxHeight, 12);
    bg.endFill();

    // Bubble tail.
    bg.beginFill(0x141414, 0.96);
    bg.lineStyle(2, 0xffdc8c, 0.85);
    bg.moveTo(boxWidth / 2 - 10, boxHeight - 1);
    bg.lineTo(boxWidth / 2, boxHeight + 12);
    bg.lineTo(boxWidth / 2 + 10, boxHeight - 1);
    bg.closePath();
    bg.endFill();

    container.addChild(bg);

    if (speakerName) container.addChild(nameText);
    container.addChild(bodyText);

    // Pivot makes it easy to place the bubble above the token centre.
    container.pivot.set(boxWidth / 2, boxHeight + 22);

    return container;
  }

  // Remove one bubble by id.
  remove(id) {
    const data = this.bubbles.get(id);
    if (!data) return;

    window.clearTimeout(data.timeout);

    this.fade(data.container, data.container.alpha, 0, 220, () => {
      if (!data.container.destroyed) {
        data.container.destroy({ children: true });
      }

      this.bubbles.delete(id);
    });
  }

  // Remove any active bubble belonging to a token.
  removeByToken(tokenId) {
    for (const [id, data] of this.bubbles.entries()) {
      if (data.tokenId === tokenId) this.remove(id);
    }
  }

  // Clear every active bubble.
  clear() {
    for (const data of this.bubbles.values()) {
      window.clearTimeout(data.timeout);

      if (!data.container.destroyed) {
        data.container.destroy({ children: true });
      }
    }

    this.bubbles.clear();

    if (this.layer && !this.layer.destroyed) {
      this.layer.removeChildren();
    }
  }

  // Reposition every bubble.
  updatePositions() {
    for (const id of this.bubbles.keys()) {
      this.updateBubblePosition(id);
    }
  }

  // Reposition one bubble in canvas world space.
  updateBubblePosition(id) {
    const data = this.bubbles.get(id);
    if (!data || data.container.destroyed) return;

    const token = data.tokenId ? canvas.tokens?.get(data.tokenId) : null;

    let worldX = null;
    let worldY = null;

    if (token && token.visible !== false) {
      worldX = token.center?.x ?? token.document.x;
      worldY = token.document.y;
    } else if (data.world) {
      worldX = data.world.x;
      worldY = data.world.y;
    }

    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
      data.container.visible = false;
      return;
    }

    data.container.visible = true;
    data.container.position.set(worldX, worldY);

    // Keep the bubble readable at different zoom levels.
    // The canvas stage scales during zoom, so we counter-scale the bubble.
    const stageScale = canvas.stage?.scale?.x ?? 1;
    const inverseScale = stageScale ? 1 / stageScale : 1;
    data.container.scale.set(inverseScale);
  }

  // Basic alpha tween for fade in/out.
  fade(displayObject, from, to, duration = 200, done = null) {
    const start = performance.now();

    displayObject.alpha = from;

    const tick = now => {
      if (displayObject.destroyed) return;

      const progress = Math.min((now - start) / duration, 1);
      displayObject.alpha = from + (to - from) * progress;

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else if (done) {
        done();
      }
    };

    requestAnimationFrame(tick);
  }
}
