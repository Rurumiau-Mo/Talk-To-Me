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
    world = null,
    typingAnimation = false
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
      text: typingAnimation ? "" : text,
      layoutText: text,
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
      timeout,
      typingInterval: null
    });

    this.updateBubblePosition(id);

    // Small fade-in animation.
    this.fade(container, 0, 1, 160);

    if (typingAnimation) {
      const bubble = this.bubbles.get(id);
      let index = 0;
      const characters = Array.from(String(text));

      window.setTimeout(() => {
        const activeBubble = this.bubbles.get(id);
        if (!activeBubble) return;

        const bodyText = activeBubble.container?.getChildByName?.(
          "talk-to-me-body-text",
          true
        );

        if (!bodyText || bodyText.destroyed) return;

        activeBubble.typingInterval = window.setInterval(() => {
          index += 1;
          bodyText.text = characters.slice(0, index).join("");

          if (index >= characters.length) {
            window.clearInterval(activeBubble.typingInterval);
            activeBubble.typingInterval = null;
          }
        }, 90);
      }, 170);
    }
  }

  // Create the PIXI graphics/text that make up the speech bubble.
  createBubbleDisplay({
    text = "",
    layoutText = null,
    speakerName = ""
  } = {}) {
    const container = new PIXI.Container();

    const setting = (key, fallback) => {
      try {
        const value = game.settings.get(TTM_ID, key);
        return value ?? fallback;
      } catch {
        return fallback;
      }
    };

    const parseColor = (value, fallback) => {
      const raw = String(value ?? "").trim();

      if (/^#[0-9a-f]{6}$/i.test(raw)) {
        return Number.parseInt(raw.slice(1), 16);
      }

      if (/^0x[0-9a-f]{6}$/i.test(raw)) {
        return Number.parseInt(raw.slice(2), 16);
      }

      return fallback;
    };

    const mode = setting("bubbleStyleMode", "generated");
    const maxWidth = Math.max(
      120,
      Number(setting("bubbleMaxWidth", 320))
    );
    const paddingX = Math.max(
      0,
      Number(setting("bubblePaddingX", 12))
    );
    const paddingY = Math.max(
      0,
      Number(setting("bubblePaddingY", 9))
    );
    const nameGap = speakerName ? 4 : 0;
    const bodyFontSize = Math.max(
      8,
      Number(setting("bubbleBodyFontSize", 15))
    );
    const nameFontSize = Math.max(
      8,
      Number(setting("bubbleNameFontSize", 13))
    );
    const textColor = parseColor(
      setting("bubbleTextColor", "#f8f1df"),
      0xf8f1df
    );
    const nameColor = parseColor(
      setting("bubbleNameColor", "#ffd98a"),
      0xffd98a
    );

    const customImageWidth = Math.max(
      80,
      Number(setting("bubbleCustomImageWidth", 360))
    );
    const customImageHeight = Math.max(
      60,
      Number(setting("bubbleCustomImageHeight", 180))
    );
    const textOffsetX = Math.max(
      0,
      Number(setting("bubbleTextOffsetX", 28))
    );
    const textOffsetY = Math.max(
      0,
      Number(setting("bubbleTextOffsetY", 24))
    );

    const usingCustomImage =
      mode === "custom-image"
      && String(setting("bubbleCustomImage", "")).trim();

    const textWrapWidth = usingCustomImage
      ? Math.max(40, customImageWidth - textOffsetX * 2)
      : maxWidth;

    const nameText = new PIXI.Text(speakerName, {
      fontFamily: "Arial",
      fontSize: nameFontSize,
      fontWeight: "bold",
      fill: nameColor,
      wordWrap: true,
      wordWrapWidth: textWrapWidth
    });

    const bodyTextStyle = {
      fontFamily: "Arial",
      fontSize: bodyFontSize,
      fill: textColor,
      wordWrap: true,
      wordWrapWidth: textWrapWidth,
      lineHeight: Math.ceil(bodyFontSize * 1.27)
    };

    const bodyText = new PIXI.Text(text, bodyTextStyle);
    bodyText.name = "talk-to-me-body-text";
    const layoutBodyText = new PIXI.Text(
      layoutText === null ? text : layoutText,
      bodyTextStyle
    );

    if (usingCustomImage) {
      const imagePath = String(
        setting("bubbleCustomImage", "")
      ).trim();
      const sprite = PIXI.Sprite.from(imagePath);

      sprite.width = customImageWidth;
      sprite.height = customImageHeight;
      sprite.alpha = Math.max(
        0,
        Math.min(1, Number(setting("bubbleOpacity", 1)))
      );

      container.addChild(sprite);

      nameText.x = textOffsetX;
      nameText.y = textOffsetY;

      bodyText.x = textOffsetX;
      bodyText.y =
        textOffsetY
        + (speakerName ? nameText.height + nameGap : 0);

      if (speakerName) container.addChild(nameText);
      container.addChild(bodyText);

      // The uploaded PNG supplies the complete bubble artwork.
      // TalkToMe adds only text; no generated box, border, or tail.
      container.pivot.set(
        customImageWidth / 2,
        customImageHeight + 12
      );

      return container;
    }

    nameText.x = paddingX;
    nameText.y = paddingY;

    bodyText.x = paddingX;
    bodyText.y =
      paddingY
      + (speakerName ? nameText.height + nameGap : 0);

    const contentWidth = Math.max(
      speakerName ? nameText.width : 0,
      layoutBodyText.width,
      110
    );

    const contentHeight =
      (speakerName ? nameText.height + nameGap : 0)
      + layoutBodyText.height;

    const boxWidth = Math.min(
      maxWidth + paddingX * 2,
      contentWidth + paddingX * 2
    );
    const boxHeight = contentHeight + paddingY * 2;

    const backgroundColor = parseColor(
      setting("bubbleBackgroundColor", "#141414"),
      0x141414
    );
    const borderColor = parseColor(
      setting("bubbleBorderColor", "#ffdc8c"),
      0xffdc8c
    );
    const opacity = Math.max(
      0,
      Math.min(1, Number(setting("bubbleOpacity", 0.96)))
    );
    const borderWidth = Math.max(
      0,
      Number(setting("bubbleBorderWidth", 2))
    );
    const cornerRadius = Math.max(
      0,
      Number(setting("bubbleCornerRadius", 12))
    );
    const tailEnabled =
      setting("bubbleTailEnabled", true) !== false;

    const bg = new PIXI.Graphics();

    bg.beginFill(backgroundColor, opacity);
    bg.lineStyle(borderWidth, borderColor, 0.85);
    bg.drawRoundedRect(
      0,
      0,
      boxWidth,
      boxHeight,
      cornerRadius
    );
    bg.endFill();

    if (tailEnabled) {
      bg.beginFill(backgroundColor, opacity);
      bg.lineStyle(borderWidth, borderColor, 0.85);
      bg.moveTo(boxWidth / 2 - 10, boxHeight - 1);
      bg.lineTo(boxWidth / 2, boxHeight + 12);
      bg.lineTo(boxWidth / 2 + 10, boxHeight - 1);
      bg.closePath();
      bg.endFill();
    }

    container.addChild(bg);

    if (speakerName) container.addChild(nameText);
    container.addChild(bodyText);

    container.pivot.set(
      boxWidth / 2,
      boxHeight + (tailEnabled ? 22 : 10)
    );

    return container;
  }

  // Remove one bubble by id.
  remove(id) {
    const data = this.bubbles.get(id);
    if (!data) return;

    window.clearTimeout(data.timeout);
    if (data.typingInterval) {
      window.clearInterval(data.typingInterval);
    }

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
    if (data.typingInterval) {
      window.clearInterval(data.typingInterval);
    }

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
