import { TTM_ID, TTM_SOCKET_ACTIONS } from "./constants.js";
import { placementManager } from "./placement-manager.js";

class ActivationManager {
  constructor(api) {
    this.api = api;
    this.active = false;
    this.recent = new Map();
    this.cooldownMs = 200;
    this.boundClick = event => this.handleEvent("left", event);
    this.boundDoubleClick = event => this.handleEvent("double-left", event);
    this.boundContext = event => this.handleEvent("right", event);
  }

  start() {
    if (this.active) return;
    const view = canvas?.app?.view;
    if (!view) return;

    view.addEventListener("click", this.boundClick, true);
    view.addEventListener("dblclick", this.boundDoubleClick, true);
    view.addEventListener("contextmenu", this.boundContext, true);
    this.active = true;
  }

  stop() {
    if (!this.active) return;
    const view = canvas?.app?.view;
    if (!view) return;

    view.removeEventListener("click", this.boundClick, true);
    view.removeEventListener("dblclick", this.boundDoubleClick, true);
    view.removeEventListener("contextmenu", this.boundContext, true);
    this.active = false;
  }

  worldPoint(event) {
    const view = canvas?.app?.view;
    if (!view || !canvas?.stage) return null;
    const rect = view.getBoundingClientRect();
    return canvas.stage.worldTransform.applyInverse({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    });
  }

  getImageWorldBounds(tileDoc) {
    const placeable = this.getTilePlaceable(tileDoc);
    const visual = placeable?.mesh ?? placeable;

    try {
      if (visual?.getBounds && canvas?.stage?.worldTransform) {
        const bounds = visual.getBounds();
        const topLeft = canvas.stage.worldTransform.applyInverse({
          x: bounds.x,
          y: bounds.y
        });
        const bottomRight = canvas.stage.worldTransform.applyInverse({
          x: bounds.x + bounds.width,
          y: bounds.y + bounds.height
        });

        return {
          left: Math.min(topLeft.x, bottomRight.x),
          top: Math.min(topLeft.y, bottomRight.y),
          right: Math.max(topLeft.x, bottomRight.x),
          bottom: Math.max(topLeft.y, bottomRight.y)
        };
      }
    } catch (error) {
      console.warn("TalkToMe could not resolve rendered tile image bounds.", error);
    }

    const left = Number(tileDoc?.x ?? 0);
    const top = Number(tileDoc?.y ?? 0);
    return {
      left,
      top,
      right: left + Number(tileDoc?.width ?? 0),
      bottom: top + Number(tileDoc?.height ?? 0)
    };
  }

  pointInTileImage(tileDoc, point) {
    const bounds = this.getImageWorldBounds(tileDoc);
    return point.x >= bounds.left
      && point.x <= bounds.right
      && point.y >= bounds.top
      && point.y <= bounds.bottom;
  }

  isClickable(tileDoc) {
    const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};
    const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
    const trigger = speech.trigger ?? utility.trigger ?? "manual";
    return speech.managed === true && trigger === "switch";
  }

  matches(clickType, activation = "left") {
    return activation === "any"
      || activation === clickType
      || (activation === "left" && ["left", "click", "leftclick", "left-click"].includes(clickType));
  }

  tokenFor(userId, tokenId = null) {
    if (tokenId) {
      const explicit = canvas.tokens?.get(tokenId);
      if (explicit?.document) return explicit;
    }

    const user = game.users?.get(userId) ?? game.user;
    return canvas.tokens?.controlled?.find(token => token.actor?.testUserPermission?.(user, "OWNER"))
      ?? canvas.tokens?.placeables?.find(token => token.actor?.testUserPermission?.(user, "OWNER"))
      ?? null;
  }

  getTokenVisionOrigin(token) {
  try {
    const origin = token?.document?.getVisionOrigin?.();
    if (origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)) {
      return origin;
    }
  } catch (error) {
    console.warn("TalkToMe could not read the token vision origin.", error);
  }

  const bounds = token?.bounds;
  if (bounds) {
    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
      elevation: Number(token?.document?.elevation ?? 0)
    };
  }

  const grid = Number(canvas?.grid?.size ?? canvas?.scene?.grid?.size ?? 100);
  return {
    x: Number(token?.document?.x ?? 0) + Number(token?.document?.width ?? 1) * grid / 2,
    y: Number(token?.document?.y ?? 0) + Number(token?.document?.height ?? 1) * grid / 2,
    elevation: Number(token?.document?.elevation ?? 0)
  };
}

getTileVisionPoint(tileDoc) {
  const bounds = this.getImageWorldBounds(tileDoc);
  return {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
    elevation: Number(tileDoc?.elevation ?? tileDoc?.z ?? 0)
  };
}

isWallBlocked(token, tileDoc) {
  const origin = this.getTokenVisionOrigin(token);
  const destination = this.getTileVisionPoint(tileDoc);
  const backend = CONFIG.Canvas?.polygonBackends?.sight
    ?? foundry.canvas.geometry.PointSourcePolygon;

  if (!backend?.testCollision) {
    console.warn("TalkToMe could not find Foundry's sight collision backend.");
    return true;
  }

  try {
    return backend.testCollision(origin, destination, {
      type: "sight",
      mode: "any",
      source: token?.vision ?? token
    }) === true;
  } catch (error) {
    console.warn("TalkToMe wall collision check failed.", error);
    return true;
  }
}

canSee(tileDoc, userId, tokenId, notify = false) {
  const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
  const needsVision = utility.requirePlayerVision === true;
  const needsWallCheck = utility.hideBehindWalls === true;

  if (!needsVision && !needsWallCheck) return true;

  const user = game.users?.get(userId) ?? game.user;
  if (user?.isGM) return true;

  const token = this.tokenFor(userId, tokenId);
  if (!token?.document) {
    if (notify) ui.notifications.warn("You need an owned token with vision to activate this tile.");
    return false;
  }

  if (this.isWallBlocked(token, tileDoc)) {
    if (notify) ui.notifications.warn("A wall blocks your token's view of this tile.");
    return false;
  }

  if (!needsVision || !canvas.scene?.tokenVision) return true;

  const point = this.getTileVisionPoint(tileDoc);

  try {
    const visibility = canvas.visibility ?? canvas.effects?.visibility;
    const visible = visibility?.testVisibility
      ? visibility.testVisibility(point, { object: token, tolerance: 2 }) === true
      : token.vision?.containsPoint?.(point) === true;

    if (!visible && notify) ui.notifications.warn("Your token cannot see this tile.");
    return visible;
  } catch (error) {
    console.warn("TalkToMe vision-range check failed.", error);
    if (notify) ui.notifications.warn("Your token cannot see this tile.");
    return false;
  }
}

shouldHideBehindWalls(tileDoc) {
  const utility = tileDoc?.getFlag?.(TTM_ID, "utility") ?? {};
  return utility.hideBehindWalls === true;
}

updateDisplayTreeVisibility(displayObject, visible) {
  if (!displayObject) return;

  const shouldShow = visible === true;

  if (displayObject._talkToMeOriginalAlpha === undefined) {
    displayObject._talkToMeOriginalAlpha = Number(displayObject.alpha ?? 1);
  }

  displayObject.visible = shouldShow;
  displayObject.renderable = shouldShow;
  displayObject.alpha = shouldShow
    ? displayObject._talkToMeOriginalAlpha
    : 0;

  if ("eventMode" in displayObject) {
    displayObject.eventMode = shouldShow ? "auto" : "none";
  }

  if ("interactive" in displayObject) {
    displayObject.interactive = shouldShow;
  }

  for (const child of displayObject.children ?? []) {
    this.updateDisplayTreeVisibility(child, shouldShow);
  }
}

getTilePlaceable(tileDoc) {
  return canvas?.tiles?.get?.(tileDoc?.id)
    ?? canvas?.tiles?.placeables?.find?.(tile => tile?.document?.id === tileDoc?.id)
    ?? null;
}

updatePlaceableVisibility(tileDoc, visible) {
  const placeable = this.getTilePlaceable(tileDoc);
  if (!placeable) return;

  const shouldShow = visible === true;
  placeable._talkToMeWallHidden = !shouldShow;

  this.updateDisplayTreeVisibility(placeable, shouldShow);

  for (const candidate of [
    placeable.mesh,
    placeable.sprite,
    placeable.texture,
    placeable.primary,
    placeable.object,
    placeable.icon
  ]) {
    this.updateDisplayTreeVisibility(candidate, shouldShow);
  }
}

applyTileVisibility(tileDoc) {
  if (!tileDoc) return;

  if (tileDoc.hidden === true && !game.user?.isGM) {
    this.updatePlaceableVisibility(tileDoc, false);
    return;
  }

  if (!this.shouldHideBehindWalls(tileDoc) || game.user?.isGM) {
    this.updatePlaceableVisibility(tileDoc, true);
    return;
  }

  const token = this.tokenFor(
    game.user?.id,
    canvas.tokens?.controlled?.[0]?.document?.id ?? null
  );

  const visible = token?.document
    ? this.canSee(tileDoc, game.user.id, token.document.id, false)
    : false;

  this.updatePlaceableVisibility(tileDoc, visible);
}

isPlaceableVisible(tileDoc) {
  const placeable = canvas?.tiles?.get(tileDoc?.id);
  if (!placeable) return false;
  return placeable._talkToMeWallHidden !== true
    && placeable.visible !== false
    && placeable.renderable !== false
    && Number(placeable.alpha ?? 1) > 0;
}

refreshTileVisibility() {
  if (!canvas?.scene || !canvas?.tiles) return;

  for (const tileDoc of canvas.scene.tiles?.contents ?? []) {
    this.applyTileVisibility(tileDoc);
  }
}

  isDuplicate(tileDoc, userId, clickType) {
    const key = `${tileDoc.id}:${userId}:${clickType}`;
    const now = Date.now();
    const previous = this.recent.get(key) ?? 0;
    this.recent.set(key, now);
    return now - previous < this.cooldownMs;
  }

  tilesAt(point) {
    return (canvas.scene?.tiles?.contents ?? [])
      .filter(tileDoc =>
        this.isClickable(tileDoc)
        && (game.user?.isGM || tileDoc.hidden !== true)
        && this.isPlaceableVisible(tileDoc)
        && this.pointInTileImage(tileDoc, point)
      )
      .sort((a, b) => Number(b.sort ?? 0) - Number(a.sort ?? 0));
  }

  async handleEvent(clickType, event) {
    if (!canvas?.scene) return;
    const point = this.worldPoint(event);
    if (!point) return;

    const tileDoc = this.tilesAt(point)[0];
    if (!tileDoc || !placementManager.isReady(tileDoc)) return;

    const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};
    const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
    const activation = speech.clickActivation ?? utility.clickActivation ?? "left";
    if (!this.matches(clickType, activation)) return;
    if (this.isDuplicate(tileDoc, game.user.id, clickType)) return;

    const tokenId = canvas.tokens?.controlled?.[0]?.document?.id ?? null;
    if (!this.canSee(tileDoc, game.user.id, tokenId, true)) return;

    event.preventDefault?.();
    event.stopPropagation?.();

    if (game.user.isGM) {
      await this.execute(tileDoc, tokenId ? canvas.tokens.get(tokenId) : null);
      return;
    }

    game.socket.emit(`module.${TTM_ID}`, {
      action: TTM_SOCKET_ACTIONS.REQUEST_TILE_TRIGGER,
      sceneId: canvas.scene.id,
      tileId: tileDoc.id,
      tokenId,
      userId: game.user.id,
      clickType
    });
  }

  async execute(tileDoc, token = null) {
    const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};
    return this.api.triggerSpeechTile(tileDoc.id, token, {
      postChat: speech.postChat,
      zoomToSpeaker: speech.zoomToSpeaker
    });
  }

  async handleSocketRequest(data = {}) {
    if (!game.user?.isGM) return;
    if (!canvas?.scene || data.sceneId !== canvas.scene.id) return;

    const tileDoc = canvas.scene.tiles?.get(data.tileId);
    if (!tileDoc || !this.isClickable(tileDoc) || !placementManager.isReady(tileDoc)) return;
    if (this.isDuplicate(tileDoc, data.userId, data.clickType ?? "left")) return;
    if (!this.canSee(tileDoc, data.userId, data.tokenId, false)) return;

    const token = data.tokenId ? canvas.tokens?.get(data.tokenId) : null;
    await this.execute(tileDoc, token);
  }
}

export { ActivationManager };
