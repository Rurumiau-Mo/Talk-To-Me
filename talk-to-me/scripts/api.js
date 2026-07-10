// =============================================================================
// TalkToMe public API
// =============================================================================
// Exposes game.talkToMe and coordinates UI, speech, bubbles, tiles, and entry checks.

import { TTM_ID, TTM_SOCKET_ACTIONS, TTM_MATT_ID, TTM_TAGGER_ID } from "./constants.js";
import { TalkToMeApp } from "./app.js";
import { TalkToMeBubbleManager } from "./bubbles.js";

import { ttmIsGM, ttmModuleActive, ttmNotice } from "./helpers.js";
import { activateUtilityTemplate, applyUtilityTemplateActions, runTeleportUtility, toggleLightTile } from "./utilities.js";

import {
  broadcastSpeech,
  getTable,
  panZoomToToken,
  postToChat,
  resolveToken,
  rollTable,
  sayCustomBubble,
  sayFoundryBubble
} from "./speech.js";

import { generateOpenMacro, generateScript } from "./macros.js";
import { ActivationManager } from "./activation-manager.js";
import { lightManager } from "./light-manager.js";

import {
  TTM_ACTION_TRIGGERS,
  TTM_MOVEMENT_TRIGGERS,
  createSpeechTile,
  getManagedSpeechTiles,
  pointInTile,
  tileContainsToken,
  triggerSpeechTile
} from "./tiles.js";

export class TalkToMe {
  constructor() {
    this.app = new TalkToMeApp(this);
    this.bubbles = new TalkToMeBubbleManager();

    this.entryState = new Map();
    this.entryCooldown = new Map();
    this.triggerScanInterval = null;
    this.tileClickListenersActive = false;
    this.lastTileClickAt = 0;
    this.boundTileCanvasClick = event => this.handleTileCanvasPointer("left", event);
    this.boundTileCanvasDoubleClick = event => this.handleTileCanvasPointer("double-left", event);
    this.boundTileCanvasRightClick = event => this.handleTileCanvasPointer("right", event);
    this.boundTilePlaceablePointerTap = event => this.handleTilePlaceablePointer("left", event);
    this.boundTilePlaceableRightClick = event => this.handleTilePlaceablePointer("right", event);
    this.talkToMeClickOverlay = null;
    this.teleportClickScannerActive = false;
    this.boundTeleportCanvasClick = event => this.handleTeleportCanvasClick(event);
    this.clickListenersActive = false;
    this.boundSwitchLeftClick = event => this.handleSwitchTileClick("left", event);
    this.boundSwitchDoubleLeftClick = event => this.handleSwitchTileClick("double-left", event);
    this.boundSwitchRightClick = event => this.handleSwitchTileClick("right", event);
    this.activationManager = new ActivationManager(this);
  }

  initBubbles() {
    this.bubbles.init();
  }

  isReady() {
    return true;
  }

  open() {
    this.app.open();
  }

  close() {
    this.app.close();
  }

  get mattActive() {
    return ttmModuleActive(TTM_MATT_ID);
  }

  get taggerActive() {
    return ttmModuleActive(TTM_TAGGER_ID);
  }

  getTable(args) {
    return getTable(args);
  }

  rollTable(table) {
    return rollTable(table);
  }

  resolveToken(tokenLike) {
    return resolveToken(tokenLike);
  }

  generateScript(args) {
    return generateScript(args);
  }

  generateOpenMacro() {
    return generateOpenMacro();
  }

  getManagedSpeechTiles() {
    return getManagedSpeechTiles();
  }

  createSpeechTile(args) {
    return createSpeechTile(args);
  }

async teleportTileNow(tileId, tokenLike = null) {
  const tileDoc = canvas.scene?.tiles?.get(tileId);
  if (!tileDoc) return false;

  return runTeleportUtility(tileDoc, tokenLike, { debug: true });
}

async toggleSelectedLightTile() {
  const tile = canvas.tiles?.controlled?.[0] ?? canvas.tiles?.placeables?.find(t => t.controlled);
  const tileDoc = tile?.document;

  if (!tileDoc) {
    ui.notifications.warn("Select a Light tile first.");
    return false;
  }

  const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
  if (utility.template !== "light") {
    ui.notifications.warn("Selected tile is not a TalkToMe Light template.");
    return false;
  }

  await toggleLightTile(tileDoc);
  return true;
}

debugLightTiles() {
  const lights = (canvas.scene?.tiles?.contents ?? [])
    .filter(tileDoc => (tileDoc.getFlag(TTM_ID, "utility") ?? {}).template === "light")
    .map(tileDoc => ({
      id: tileDoc.id,
      name: tileDoc.name,
      x: tileDoc.x,
      y: tileDoc.y,
      width: tileDoc.width,
      height: tileDoc.height,
      utility: tileDoc.getFlag(TTM_ID, "utility")
    }));

  console.log("TalkToMe Light tiles", lights);
  ui.notifications.info(`TalkToMe found ${lights.length} Light tile${lights.length === 1 ? "" : "s"}.`);
  return lights;
}

async toggleFirstLightTile() {
  const tileDoc = (canvas.scene?.tiles?.contents ?? [])
    .find(tile => (tile.getFlag(TTM_ID, "utility") ?? {}).template === "light");

  if (!tileDoc) {
    ui.notifications.warn("No TalkToMe Light tile found on this scene.");
    return false;
  }

  await toggleLightTile(tileDoc);
  return true;
}

getPlayerVisionToken(userId = game.user?.id, tokenId = null) {
  if (!canvas?.tokens) return null;

  if (tokenId) {
    const requested = canvas.tokens.get(tokenId);
    if (requested?.document) return requested;
  }

  const user = game.users?.get(userId) ?? game.user;
  const controlled = canvas.tokens.controlled?.find(token => {
    if (!user) return true;
    return token.actor?.testUserPermission?.(user, "OWNER") === true;
  });

  if (controlled?.document) return controlled;

  return canvas.tokens.placeables?.find(token => {
    if (!token?.document || !token.actor || !user) return false;
    return token.actor.testUserPermission?.(user, "OWNER") === true;
  }) ?? null;
}

canUserSeeTile(tileDoc, {
  userId = game.user?.id,
  tokenId = null,
  notify = false
} = {}) {
  if (!tileDoc) return false;

  const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
  if (utility.requirePlayerVision !== true) return true;

  const user = game.users?.get(userId) ?? game.user;
  if (user?.isGM) return true;

  const token = this.getPlayerVisionToken(userId, tokenId);

  if (!token?.document) {
    if (notify) {
      ui.notifications.warn("You need an owned token with vision to activate this tile.");
    }
    return false;
  }

  if (!canvas.scene?.tokenVision) return true;

  const point = {
    x: Number(tileDoc.x ?? 0) + Number(tileDoc.width ?? 0) / 2,
    y: Number(tileDoc.y ?? 0) + Number(tileDoc.height ?? 0) / 2
  };

  let visible = false;

  try {
    const visibility = canvas.visibility ?? canvas.effects?.visibility;
    if (visibility?.testVisibility) {
      visible = visibility.testVisibility(point, {
        object: token,
        tolerance: 2
      }) === true;
    } else if (token.vision?.containsPoint) {
      visible = token.vision.containsPoint(point) === true;
    }
  } catch (error) {
    console.warn("TalkToMe player vision check failed.", error);
    visible = false;
  }

  if (!visible && notify) {
    ui.notifications.warn("Your token cannot see this tile.");
  }

  return visible;
}

async toggleLightTileById(tileId, userId = game.user?.id, tokenId = null) {
  const tileDoc = canvas.scene?.tiles?.get(tileId);

  if (!tileDoc) {
    ui.notifications.warn("TalkToMe could not find the Light tile.");
    return false;
  }

  const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
  if (utility.template !== "light") {
    ui.notifications.warn("TalkToMe tile is not a Light template.");
    return false;
  }

  if (!this.canUserSeeTile(tileDoc, {
    userId,
    tokenId,
    notify: game.user?.id === userId
  })) {
    return false;
  }

  await toggleLightTile(tileDoc);
  return true;
}

debugLightMattFlags() {
  const tiles = (canvas.scene?.tiles?.contents ?? [])
    .filter(tile => (tile.getFlag(TTM_ID, "utility") ?? {}).template === "light")
    .map(tile => ({
      id: tile.id,
      name: tile.name,
      utility: tile.getFlag(TTM_ID, "utility"),
      matt: tile.getFlag("monks-active-tiles")
    }));

  console.log("TalkToMe Light MATT flags", tiles);
  ui.notifications.info(`TalkToMe found ${tiles.length} Light tile${tiles.length === 1 ? "" : "s"}.`);
  return tiles;
}

  async triggerSpeechTile(tileId, tokenLike = null, overrides = {}) {
    // `triggerSpeechTile` in tiles.js owns the complete activation route.
    // Do not pre-activate here or utility actions run twice.
    return triggerSpeechTile(this, tileId, tokenLike, overrides);
  }

  async say({
    token = null,
    tableId = null,
    tableName = null,
    text = "",
    npcName = "",
    postChat = null,
    broadcast = true,
    zoomToSpeaker = null,
    bubbleOptions = {}
  } = {}) {
    const resolvedToken = this.resolveToken(token);
    const table = this.getTable({ tableId, tableName });

    let finalText = String(text ?? "").trim();

    if (!finalText) {
      if (!table) {
        ttmNotice("warn", "TalkToMe: choose a RollTable or enter custom speech.");
        return null;
      }

      finalText = await this.rollTable(table);
    }

    if (!finalText) {
      ttmNotice("warn", "TalkToMe: no speech text was produced.");
      return null;
    }

    const shouldZoom = zoomToSpeaker ?? game.settings.get(TTM_ID, "zoomToSpeakerByDefault");
    if (resolvedToken && shouldZoom) await panZoomToToken(resolvedToken);

    if (!resolvedToken && !npcName) {
      ttmNotice("warn", "TalkToMe: select/target a token or provide a custom NPC name.");
      return null;
    }

    const useCustom = game.settings.get(TTM_ID, "useCustomBubbles");

    if (resolvedToken) {
      if (useCustom) {
        const bubbleId = `${canvas.scene?.id}.${resolvedToken.document.id}.${Date.now()}`;
        await sayCustomBubble(resolvedToken, finalText, npcName, null, bubbleId);
        if (broadcast) await broadcastSpeech(resolvedToken, finalText, npcName, null, bubbleId, shouldZoom);
      } else {
        await sayFoundryBubble(resolvedToken, finalText, bubbleOptions);
      }
    }

    const shouldPostChat = postChat ?? game.settings.get(TTM_ID, "postChatByDefault");
    if (shouldPostChat) await postToChat(resolvedToken, finalText, npcName);

    return finalText;
  }


startTriggerScanner() {
  this.stopTriggerScanner();

  if (!ttmIsGM()) return;

  const interval = Math.max(100, Number(game.settings.get(TTM_ID, "triggerScanInterval") ?? 200));

  this.triggerScanInterval = window.setInterval(() => {
    this.scanMovementTriggers();
  }, interval);

  // Prime the state immediately.
  this.scanMovementTriggers({ primeOnly: true });
}

stopTriggerScanner() {
  if (!this.triggerScanInterval) return;

  window.clearInterval(this.triggerScanInterval);
  this.triggerScanInterval = null;
    this.tileClickListenersActive = false;
    this.lastTileClickAt = 0;
    this.boundTileCanvasClick = event => this.handleTileCanvasPointer("left", event);
    this.boundTileCanvasDoubleClick = event => this.handleTileCanvasPointer("double-left", event);
    this.boundTileCanvasRightClick = event => this.handleTileCanvasPointer("right", event);
    this.boundTilePlaceablePointerTap = event => this.handleTilePlaceablePointer("left", event);
    this.boundTilePlaceableRightClick = event => this.handleTilePlaceablePointer("right", event);
    this.talkToMeClickOverlay = null;
    this.clickListenersActive = false;
    this.boundSwitchLeftClick = event => this.handleSwitchTileClick("left", event);
    this.boundSwitchDoubleLeftClick = event => this.handleSwitchTileClick("double-left", event);
    this.boundSwitchRightClick = event => this.handleSwitchTileClick("right", event);
}

async scanMovementTriggers({ primeOnly = false } = {}) {
  if (!ttmIsGM()) return;
  if (!canvas?.scene || !canvas.tokens) return;

  const tokens = canvas.tokens.placeables ?? [];

  // Scan every TalkToMe tile with an enter/exit trigger.
  // Utility tiles such as switches and lights are not always managed speech tiles.
  const tiles = (canvas.scene.tiles?.contents ?? []).filter(tileDoc => {
    const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};
    const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
    const trigger = speech.trigger ?? utility.trigger;

    return Boolean(utility.template || speech.managed)
      && TTM_MOVEMENT_TRIGGERS.includes(trigger);
  });

  for (const tileDoc of tiles) {
    const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};
    const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
    const trigger = speech.trigger ?? utility.trigger;

    for (const token of tokens) {
      if (!token?.document) continue;

      const tokenDoc = token.document;
      const tokenId = tokenDoc.id ?? tokenDoc._id;
      if (!tokenId) continue;

      const stateKey = `${canvas.scene.id}.${tileDoc.id}.${tokenId}`;
      const insideNow = tileContainsToken(tileDoc, tokenDoc);
      const hadState = this.entryState.has(stateKey);
      const wasInside = this.entryState.get(stateKey) === true;

      if (!hadState || primeOnly) {
        this.entryState.set(stateKey, insideNow);
        continue;
      }

      const shouldTrigger =
        (trigger === "enter" && !wasInside && insideNow)
        || (trigger === "exit" && wasInside && !insideNow);

      this.entryState.set(stateKey, insideNow);

      if (!shouldTrigger) continue;

      const now = Date.now();
      const last = this.entryCooldown.get(stateKey) ?? 0;
      const cooldown = Number(
        game.settings.get(TTM_ID, "triggerCooldown") ?? 1000
      );

      if (now - last < cooldown) continue;

      this.entryCooldown.set(stateKey, now);

      if (utility.template && utility.template !== "speech") {
        const result = await applyUtilityTemplateActions(this, tileDoc, token);
      } else {
        await this.triggerSpeechTile(tileDoc.id, token, {
          movementTrigger: trigger
        });
      }
    }
  }
}

async triggerActionTiles(triggerType = "manual", tokenLike = null, overrides = {}) {
  if (!TTM_ACTION_TRIGGERS.includes(triggerType)) {
    ttmNotice("warn", `Unknown TalkToMe action trigger: ${triggerType}`);
    return [];
  }

  const matchingTiles = this.getManagedSpeechTiles()
    .filter(tile => tile.getFlag(TTM_ID, "speech")?.trigger === triggerType);

  const results = [];

  for (const tile of matchingTiles) {
    results.push(await this.triggerSpeechTile(tile.id, tokenLike, overrides));
  }

  return results;
}

async triggerSpeechTileByCategory(tileId, category = "manual", tokenLike = null, overrides = {}) {
  const doc = canvas.scene?.tiles?.get(tileId);
  if (!doc) return ttmNotice("warn", "Speech tile not found.");

  const utility = doc.getFlag(TTM_ID, "utility") ?? {};
    if (utility.template === "teleport") {
      await runTeleportUtility(doc, tokenLike ?? this.getTokenOverlappingTileDoc?.(doc, { debug: true }), { debug: true });
    } else {
      await applyUtilityTemplateActions(this, doc, tokenLike);
    }

    const flags = doc.getFlag(TTM_ID, "speech");
  if (!flags?.managed) return ttmNotice("warn", "That tile is not a TalkToMe speech tile.");

  if (flags.trigger !== category && category !== "manual") {
    return ttmNotice("warn", `This speech tile is set to ${flags.trigger}, not ${category}.`);
  }

  return this.triggerSpeechTile(tileId, tokenLike, overrides);
}

async checkEntryTriggersForToken() {
  await this.scanMovementTriggers();
}

resetEntryHistory() {
  this.entryState.clear();
  this.entryCooldown.clear();
  this.scanMovementTriggers({ primeOnly: true });
}

getCanvasWorldPointFromMouseEvent(event) {
  const view = canvas?.app?.view;
  if (!view || !canvas?.stage) return null;

  const rect = view.getBoundingClientRect();

  const screenPoint = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };

  return canvas.stage.worldTransform.applyInverse(screenPoint);
}

clickTypeMatchesActivation(clickType, activation = "left") {
  return activation === "any"
    || activation === clickType
    || (activation === "left" && clickType === "left");
}

getClickableTilesAtPoint(worldPoint) {
  if (!canvas?.scene || !worldPoint) return [];

  return (canvas.scene?.tiles?.contents ?? [])
    .filter(tileDoc => pointInTile(tileDoc, worldPoint))
    .filter(tileDoc => {
      const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};
      const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};

      const speechTrigger = speech.trigger ?? "manual";
      const template = utility.template ?? "speech";

      return (
        speech.managed === true
        && ["switch", "trap", "effect", "manual"].includes(speechTrigger)
      ) || ["switch", "light", "trap", "teleport", "reset"].includes(template);
    });
}

async handleSwitchTileClick(clickType, event) {
  if (!canvas?.scene) return;

  const worldPoint = this.getCanvasWorldPointFromMouseEvent(event);
  if (!worldPoint) return;

  const clickableTiles = this.getClickableTilesAtPoint(worldPoint);
  if (!clickableTiles.length) return;

  for (const tileDoc of clickableTiles) {
    const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};
    const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
    const activation = speech.clickActivation ?? utility.clickActivation ?? "left";

    if (!this.clickTypeMatchesActivation(clickType, activation)) continue;

    if (clickType === "right") {
      event.preventDefault();
      event.stopPropagation();
    }

    if (ttmIsGM()) {
      if (utility.template === "teleport") {
        await runTeleportUtility(tileDoc, canvas.tokens?.controlled?.[0] ?? this.getTokenOverlappingTileDoc(tileDoc, { debug: true }), { debug: true });
        return;
      }

      await this.triggerSpeechTile(tileDoc.id, null, {
        postChat: speech.postChat,
        zoomToSpeaker: speech.zoomToSpeaker
      });
    } else {
      const playerTokenId = canvas.tokens?.controlled?.[0]?.document?.id ?? this.getTokenOverlappingTileDoc?.(tileDoc)?.document?.id ?? null;

      if (!this.canUserSeeTile(tileDoc, {

        userId: game.user.id,

        tokenId: playerTokenId,

        notify: true

      })) continue;


      game.socket.emit(`module.${TTM_ID}`, {
        action: TTM_SOCKET_ACTIONS.REQUEST_TILE_TRIGGER,
        sceneId: canvas.scene.id,
        tileId: tileDoc.id,
        tokenId: canvas.tokens?.controlled?.[0]?.document?.id ?? this.getTokenOverlappingTileDoc?.(tileDoc)?.document?.id ?? null,
        userId: game.user.id,
        clickType
      });
    }
  }
}

async handleRequestedTileTrigger(data = {}) {
  if (!ttmIsGM()) return;
  if (!canvas?.scene || data.sceneId !== canvas.scene.id) return;

  const tileDoc = canvas.scene.tiles?.get(data.tileId);
  if (!tileDoc) return;

  if (!this.canUserSeeTile(tileDoc, {
    userId: data.userId,
    tokenId: data.tokenId,
    notify: false
  })) {
    return;
  }

  const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};
  const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};

  const speechTrigger = speech.trigger ?? "manual";
  const template = utility.template ?? "speech";

  const allowed = speech.managed === true
    && (
      ["switch", "trap", "effect", "manual"].includes(speechTrigger)
      || ["switch", "light", "trap", "teleport", "reset"].includes(template)
    );

  if (!allowed) return;

  const token = data.tokenId
      ? canvas.tokens?.get(data.tokenId)
      : canvas.tokens?.controlled?.[0] ?? null;

  await this.triggerSpeechTile(tileDoc.id, token, {
    postChat: speech.postChat,
    zoomToSpeaker: speech.zoomToSpeaker
  });
}


getCanvasWorldPointFromMouseEvent(event) {
  const view = canvas?.app?.view;
  if (!view || !canvas?.stage) return null;

  const rect = view.getBoundingClientRect();

  const screenPoint = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };

  return canvas.stage.worldTransform.applyInverse(screenPoint);
}

clickTypeMatchesActivation(clickType, activation = "left") {
  return activation === "any"
    || activation === clickType
    || (activation === "left" && ["left", "click", "leftclick", "left-click"].includes(clickType));
}

getClickableTilesAtPoint(worldPoint) {
  if (!canvas?.scene || !worldPoint) return [];

  return this.getManagedSpeechTiles()
    .filter(tileDoc => pointInTile(tileDoc, worldPoint))
    .filter(tileDoc => {
      const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};
      const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
      const template = utility.template ?? "speech";
      const trigger = speech.trigger ?? utility.trigger ?? "manual";

      return speech.managed === true
        && (
          trigger === "switch"
          || ["switch", "light", "trap", "teleport", "reset"].includes(template)
        );
    });
}

async handleTileCanvasPointer(clickType, event) {
  if (!canvas?.scene) return;

  const worldPoint = this.getCanvasWorldPointFromMouseEvent(event);
  if (!worldPoint) return;

  const tiles = this.getClickableTilesAtPoint(worldPoint);
  if (!tiles.length) return;

  // Prevent double firing when dblclick also creates a normal click.
  const now = Date.now();
  if (clickType === "left" && now - this.lastTileClickAt < 120) return;
  this.lastTileClickAt = now;

  for (const tileDoc of tiles) {
    const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};
    const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
    const activation = speech.clickActivation ?? utility.clickActivation ?? "left";

    if (!this.clickTypeMatchesActivation(clickType, activation)) continue;

    event.preventDefault?.();
    event.stopPropagation?.();

    if (ttmIsGM()) {
      await this.triggerSpeechTile(tileDoc.id, null, {
        postChat: speech.postChat,
        zoomToSpeaker: speech.zoomToSpeaker
      });
    } else {
      const playerTokenId = canvas.tokens?.controlled?.[0]?.document?.id ?? this.getTokenOverlappingTileDoc?.(tileDoc)?.document?.id ?? null;

      if (!this.canUserSeeTile(tileDoc, {

        userId: game.user.id,

        tokenId: playerTokenId,

        notify: true

      })) continue;


      game.socket.emit(`module.${TTM_ID}`, {
        action: TTM_SOCKET_ACTIONS.REQUEST_TILE_TRIGGER,
        sceneId: canvas.scene.id,
        tileId: tileDoc.id,
        tokenId: canvas.tokens?.controlled?.[0]?.document?.id ?? this.getTokenOverlappingTileDoc?.(tileDoc)?.document?.id ?? null,
        userId: game.user.id,
        clickType
      });
    }
  }
}

async handleRequestedTileTrigger(data = {}) {
  if (!ttmIsGM()) return;
  if (!canvas?.scene || data.sceneId !== canvas.scene.id) return;

  const tileDoc = canvas.scene.tiles?.get(data.tileId);
  if (!tileDoc) return;

  if (!this.canUserSeeTile(tileDoc, {
    userId: data.userId,
    tokenId: data.tokenId,
    notify: false
  })) {
    return;
  }

  const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};
  const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
  const template = utility.template ?? "speech";
  const trigger = speech.trigger ?? utility.trigger ?? "manual";

  const allowed = (
    speech.managed === true
    && trigger === "switch"
  ) || ["switch", "light", "trap", "teleport", "reset"].includes(template);

  if (!allowed) return;

  const token = data.tokenId
      ? canvas.tokens?.get(data.tokenId)
      : canvas.tokens?.controlled?.[0] ?? null;

  await this.triggerSpeechTile(tileDoc.id, token, {
    postChat: speech.postChat,
    zoomToSpeaker: speech.zoomToSpeaker
  });
}

startSwitchClickListeners() {
  // Historical method name kept for existing startup calls.
  this.startTileClickListeners();
}

startTileClickListeners() {
  if (this.tileClickListenersActive) return;

  const view = canvas?.app?.view;
  if (!view) return;

  // Capture phase lets TalkToMe see clicks before Foundry tools or other modules consume them.
  view.addEventListener("click", this.boundTileCanvasClick, true);
  view.addEventListener("dblclick", this.boundTileCanvasDoubleClick, true);
  view.addEventListener("contextmenu", this.boundTileCanvasRightClick, true);

  this.tileClickListenersActive = true;

    this.bindClickableTilePlaceables?.();
    this.refreshClickableTileOverlay?.();
}

stopSwitchClickListeners() {
  this.stopTileClickListeners();
}

stopTileClickListeners() {
  if (!this.tileClickListenersActive) return;

  const view = canvas?.app?.view;
  if (!view) return;

  view.removeEventListener("click", this.boundTileCanvasClick, true);
  view.removeEventListener("dblclick", this.boundTileCanvasDoubleClick, true);
  view.removeEventListener("contextmenu", this.boundTileCanvasRightClick, true);

  this.tileClickListenersActive = false;
}



isTalkToMeClickableTile(tileDoc) {
  const speech = tileDoc?.getFlag(TTM_ID, "speech") ?? {};
  const utility = tileDoc?.getFlag(TTM_ID, "utility") ?? {};
  const template = utility.template ?? "speech";
  const trigger = speech.trigger ?? utility.trigger ?? "manual";

  return (
    speech.managed === true
    && trigger === "switch"
  ) || ["switch", "light", "trap", "teleport", "reset"].includes(template);
}

bindClickableTilePlaceables() {
  if (!canvas?.tiles?.placeables) return;

  for (const tile of canvas.tiles.placeables) {
    if (!this.isTalkToMeClickableTile(tile.document)) continue;
    if (tile._talkToMeClickBound) continue;

    tile._talkToMeClickBound = true;
    tile.eventMode = "static";
    tile.interactive = true;
    tile.cursor = "pointer";

    tile.on?.("pointertap", this.boundTilePlaceablePointerTap);
    tile.on?.("rightclick", this.boundTilePlaceableRightClick);
    tile.on?.("rightdown", this.boundTilePlaceableRightClick);
  }
}

async handleTilePlaceablePointer(clickType, event) {
  const tile = event?.currentTarget ?? event?.target;
  const tileDoc = tile?.document;
  if (!tileDoc || !this.isTalkToMeClickableTile(tileDoc)) return;

  const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};
  const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
  const activation = speech.clickActivation ?? utility.clickActivation ?? "left";

  if (!this.clickTypeMatchesActivation(clickType, activation)) return;

  event?.stopPropagation?.();

  if (ttmIsGM()) {
    await this.triggerSpeechTile(tileDoc.id, null, {
      postChat: speech.postChat,
      zoomToSpeaker: speech.zoomToSpeaker
    });
  } else {
    const playerTokenId = canvas.tokens?.controlled?.[0]?.document?.id ?? this.getTokenOverlappingTileDoc?.(tileDoc)?.document?.id ?? null;

    if (!this.canUserSeeTile(tileDoc, {

      userId: game.user.id,

      tokenId: playerTokenId,

      notify: true

    })) return;


    game.socket.emit(`module.${TTM_ID}`, {
      action: TTM_SOCKET_ACTIONS.REQUEST_TILE_TRIGGER,
      sceneId: canvas.scene?.id,
      tileId: tileDoc.id,
      tokenId: canvas.tokens?.controlled?.[0]?.document?.id ?? this.getTokenOverlappingTileDoc?.(tileDoc)?.document?.id ?? null,
      userId: game.user.id,
      clickType
    });
  }
}


ensureClickableTileOverlay() {
  if (!canvas?.stage) return null;

  if (this.talkToMeClickOverlay && !this.talkToMeClickOverlay.destroyed) {
    return this.talkToMeClickOverlay;
  }

  const overlay = new PIXI.Container();
  overlay.name = "TalkToMe.ClickableTileOverlay";
  overlay.sortableChildren = true;
  overlay.zIndex = 999999;
  overlay.eventMode = "static";
  overlay.interactive = true;

  canvas.stage.addChild(overlay);
  this.talkToMeClickOverlay = overlay;

  return overlay;
}

refreshClickableTileOverlay() {
  const overlay = this.ensureClickableTileOverlay();
  if (!overlay || !canvas?.scene) return;

  overlay.removeChildren();

  for (const tileDoc of this.getManagedSpeechTiles()) {
    if (!this.isTalkToMeClickableTile(tileDoc)) continue;

    const hotspot = this.getTileHotspotRect(tileDoc);
    const hit = new PIXI.Graphics();

    hit.name = `TalkToMe.ClickHit.${tileDoc.id}`;
    hit.alpha = 0.001;
    hit.eventMode = "static";
    hit.interactive = true;
    hit.cursor = "pointer";
    hit.zIndex = 999999;

    // Keep the overlay in world space on canvas.stage.
    // Draw locally and set a local hitArea so the click zone cannot drift.
    hit.position.set(hotspot.x, hotspot.y);
    hit.hitArea = new PIXI.Rectangle(0, 0, hotspot.width, hotspot.height);
    hit.beginFill(0xffffff, 0.001);
    hit.drawRect(0, 0, hotspot.width, hotspot.height);
    hit.endFill();

    hit.on("pointertap", event => this.handleOverlayTilePointer(tileDoc.id, "left", event));
    hit.on("rightclick", event => this.handleOverlayTilePointer(tileDoc.id, "right", event));
    hit.on("rightdown", event => this.handleOverlayTilePointer(tileDoc.id, "right", event));

    overlay.addChild(hit);
  }
}

async handleOverlayTilePointer(tileId, clickType, event) {
  const tileDoc = canvas.scene?.tiles?.get(tileId);
  if (!tileDoc || !this.isTalkToMeClickableTile(tileDoc)) return;

  const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};
  const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
  const activation = speech.clickActivation ?? utility.clickActivation ?? "left";

  if (!this.clickTypeMatchesActivation(clickType, activation)) return;

  event?.stopPropagation?.();

  if (ttmIsGM()) {
    await this.triggerSpeechTile(tileDoc.id, null, {
      postChat: speech.postChat,
      zoomToSpeaker: speech.zoomToSpeaker
    });
  } else {
    const playerTokenId = canvas.tokens?.controlled?.[0]?.document?.id ?? this.getTokenOverlappingTileDoc?.(tileDoc)?.document?.id ?? null;

    if (!this.canUserSeeTile(tileDoc, {

      userId: game.user.id,

      tokenId: playerTokenId,

      notify: true

    })) return;


    game.socket.emit(`module.${TTM_ID}`, {
      action: TTM_SOCKET_ACTIONS.REQUEST_TILE_TRIGGER,
      sceneId: canvas.scene?.id,
      tileId: tileDoc.id,
      tokenId: canvas.tokens?.controlled?.[0]?.document?.id ?? this.getTokenOverlappingTileDoc?.(tileDoc)?.document?.id ?? null,
      userId: game.user.id,
      clickType
    });
  }
}


getTileHotspotRect(tileDoc) {
  const utility = tileDoc?.getFlag(TTM_ID, "utility") ?? {};
  const size = Math.max(8, Number(utility.hotspotSize ?? 64));
  const offsetX = Number(utility.hotspotOffsetX ?? 0);
  const offsetY = Number(utility.hotspotOffsetY ?? 0);

  // Use rendered tile bounds when possible.
  const placeable = canvas.tiles?.get(tileDoc?.id);
  const renderedBounds = placeable?.bounds;

  const x = Number(renderedBounds?.x ?? tileDoc?.x ?? 0);
  const y = Number(renderedBounds?.y ?? tileDoc?.y ?? 0);
  const width = Number(renderedBounds?.width ?? tileDoc?.width ?? 0);
  const height = Number(renderedBounds?.height ?? tileDoc?.height ?? 0);

  return {
    x: x + width / 2 - size / 2 + offsetX,
    y: y + height / 2 - size / 2 + offsetY,
    width: size,
    height: size
  };
}



startTeleportClickScanner() {
  if (this.teleportClickScannerActive) return;

  const view = canvas?.app?.view;
  if (!view) return;

  view.addEventListener("pointerdown", this.boundTeleportCanvasClick, true);
  this.teleportClickScannerActive = true;
}

stopTeleportClickScanner() {
  if (!this.teleportClickScannerActive) return;

  const view = canvas?.app?.view;
  if (!view) return;

  view.removeEventListener("pointerdown", this.boundTeleportCanvasClick, true);
  this.teleportClickScannerActive = false;
}

getTokenAtWorldPoint(worldPoint) {
  if (!worldPoint) return null;

  const gridSize = canvas.grid?.size ?? canvas.scene?.grid?.size ?? 100;

  return canvas.tokens?.placeables?.find(token => {
    const doc = token.document;
    const left = Number(doc.x ?? 0);
    const top = Number(doc.y ?? 0);
    const right = left + Number(doc.width ?? 1) * gridSize;
    const bottom = top + Number(doc.height ?? 1) * gridSize;

    return worldPoint.x >= left
      && worldPoint.x <= right
      && worldPoint.y >= top
      && worldPoint.y <= bottom;
  }) ?? null;
}

getTokenOverlappingTileDoc(tileDoc) {
  if (!tileDoc) return null;

  const gridSize = canvas.grid?.size ?? canvas.scene?.grid?.size ?? 100;
  const tileLeft = Number(tileDoc.x ?? 0);
  const tileTop = Number(tileDoc.y ?? 0);
  const tileRight = tileLeft + Number(tileDoc.width ?? 0);
  const tileBottom = tileTop + Number(tileDoc.height ?? 0);

  return canvas.tokens?.placeables?.find(token => {
    const doc = token.document;
    const tokenLeft = Number(doc.x ?? 0);
    const tokenTop = Number(doc.y ?? 0);
    const tokenRight = tokenLeft + Number(doc.width ?? 1) * gridSize;
    const tokenBottom = tokenTop + Number(doc.height ?? 1) * gridSize;

    return tokenLeft < tileRight
      && tokenRight > tileLeft
      && tokenTop < tileBottom
      && tokenBottom > tileTop;
  }) ?? null;
}

getTeleportTilesAtWorldPoint(worldPoint) {
  if (!canvas?.scene || !worldPoint) return [];

  return canvas.scene.tiles
    ?.filter(tileDoc => {
      const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
      const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};

      if (utility.template !== "teleport") return false;
      if (speech.managed !== true) return false;

      const trigger = speech.trigger ?? utility.trigger ?? "manual";
      if (trigger !== "switch") return false;

      const left = Number(tileDoc.x ?? 0);
      const top = Number(tileDoc.y ?? 0);
      const right = left + Number(tileDoc.width ?? 0);
      const bottom = top + Number(tileDoc.height ?? 0);

      return worldPoint.x >= left
        && worldPoint.x <= right
        && worldPoint.y >= top
        && worldPoint.y <= bottom;
    }) ?? [];
}

async handleTeleportCanvasClick(event) {
  if (!canvas?.scene) return;

  const worldPoint = this.getCanvasWorldPointFromMouseEvent(event);
  if (!worldPoint) return;

  const teleportTiles = this.getTeleportTilesAtWorldPoint(worldPoint);
  if (!teleportTiles.length) return;

  event.preventDefault?.();
  event.stopPropagation?.();

  for (const tileDoc of teleportTiles) {
    const token = canvas.tokens?.controlled?.[0]
      ?? this.getTokenAtWorldPoint(worldPoint)
      ?? this.getTokenOverlappingTileDoc(tileDoc)
      ?? null;

    if (ttmIsGM()) {
      await runTeleportUtility(tileDoc, token, { debug: true });
    } else {
      game.socket.emit(`module.${TTM_ID}`, {
        action: "hardTeleport",
        sceneId: canvas.scene.id,
        tileId: tileDoc.id,
        tokenId: token?.document?.id ?? null,
        userId: game.user.id
      });
    }
  }
}

async handleHardTeleportRequest(data = {}) {
  if (!ttmIsGM()) return;
  if (!canvas?.scene || data.sceneId !== canvas.scene.id) return;

  const tileDoc = canvas.scene.tiles?.get(data.tileId);
  if (!tileDoc) return;

  const token = data.tokenId
    ? canvas.tokens?.get(data.tokenId)
    : this.getTokenOverlappingTileDoc(tileDoc) ?? canvas.tokens?.controlled?.[0] ?? null;

  await runTeleportUtility(tileDoc, token, { debug: true });
}

startCleanTeleportScanner() {
  if (this.cleanTeleportScannerActive) return;

  const view = canvas?.app?.view;
  if (!view) return;

  this.boundCleanTeleportPointer = this.boundCleanTeleportPointer ?? (event => this.handleCleanTeleportPointer(event));
  view.addEventListener("pointerdown", this.boundCleanTeleportPointer, true);
  this.cleanTeleportScannerActive = true;
}

getTeleportTileAtPoint(worldPoint) {
  if (!worldPoint || !canvas?.scene) return null;

  return canvas.scene.tiles?.find(tileDoc => {
    const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
    const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};
    const trigger = utility.trigger ?? speech.trigger ?? "manual";

    if (utility.template !== "teleport") return false;
    if (trigger !== "switch") return false;

    const left = Number(tileDoc.x ?? 0);
    const top = Number(tileDoc.y ?? 0);
    const right = left + Number(tileDoc.width ?? 0);
    const bottom = top + Number(tileDoc.height ?? 0);

    return worldPoint.x >= left
      && worldPoint.x <= right
      && worldPoint.y >= top
      && worldPoint.y <= bottom;
  }) ?? null;
}

getTokenAtTeleportClick(worldPoint, tileDoc) {
  const selected = canvas.tokens?.controlled?.[0];
  if (selected?.document) return selected;

  const gridSize = canvas.grid?.size ?? canvas.scene?.grid?.size ?? 100;

  const clicked = canvas.tokens?.placeables?.find(token => {
    const doc = token.document;
    const left = Number(doc.x ?? 0);
    const top = Number(doc.y ?? 0);
    const right = left + Number(doc.width ?? 1) * gridSize;
    const bottom = top + Number(doc.height ?? 1) * gridSize;

    return worldPoint.x >= left
      && worldPoint.x <= right
      && worldPoint.y >= top
      && worldPoint.y <= bottom;
  });

  if (clicked?.document) return clicked;

  const tileLeft = Number(tileDoc.x ?? 0);
  const tileTop = Number(tileDoc.y ?? 0);
  const tileRight = tileLeft + Number(tileDoc.width ?? 0);
  const tileBottom = tileTop + Number(tileDoc.height ?? 0);

  return canvas.tokens?.placeables?.find(token => {
    const doc = token.document;
    const tokenLeft = Number(doc.x ?? 0);
    const tokenTop = Number(doc.y ?? 0);
    const tokenRight = tokenLeft + Number(doc.width ?? 1) * gridSize;
    const tokenBottom = tokenTop + Number(doc.height ?? 1) * gridSize;

    return tokenLeft < tileRight
      && tokenRight > tileLeft
      && tokenTop < tileBottom
      && tokenBottom > tileTop;
  }) ?? null;
}

async handleCleanTeleportPointer(event) {
  if (!canvas?.scene) return;

  const worldPoint = this.getCanvasWorldPointFromMouseEvent(event);
  const tileDoc = this.getTeleportTileAtPoint(worldPoint);

  if (!tileDoc) return;

  event.preventDefault?.();
  event.stopPropagation?.();

  const token = this.getTokenAtTeleportClick(worldPoint, tileDoc);

  if (ttmIsGM()) {
    await runTeleportUtility(tileDoc, token, { debug: true });
    return;
  }

  game.socket.emit(`module.${TTM_ID}`, {
    action: "cleanTeleport",
    sceneId: canvas.scene.id,
    tileId: tileDoc.id,
    tokenId: token?.document?.id ?? null,
    userId: game.user.id
  });
}

async handleCleanTeleportSocket(data = {}) {
  if (!ttmIsGM()) return;
  if (!canvas?.scene || data.sceneId !== canvas.scene.id) return;

  const tileDoc = canvas.scene.tiles?.get(data.tileId);
  if (!tileDoc) return;

  const token = data.tokenId ? canvas.tokens?.get(data.tokenId) : null;
  await runTeleportUtility(tileDoc, token, { debug: true });
}


startSwitchClickListeners() {
  this.activationManager.start();
}

startTileClickListeners() {
  this.activationManager.start();
}

stopSwitchClickListeners() {
  this.activationManager.stop();
}

stopTileClickListeners() {
  this.activationManager.stop();
}

bindClickableTilePlaceables() {
  // ActivationManager owns the only click listener.
}

refreshClickableTileOverlay() {
  if (this.talkToMeClickOverlay && !this.talkToMeClickOverlay.destroyed) {
    this.talkToMeClickOverlay.destroy({ children: true });
  }
  this.talkToMeClickOverlay = null;
}

async handleTileCanvasPointer(clickType, event) {
  return this.activationManager.handleEvent(clickType, event);
}

async handleSwitchTileClick(clickType, event) {
  return this.activationManager.handleEvent(clickType, event);
}

async handleTilePlaceablePointer() {
  // Disabled: the single canvas listener handles tile activation.
}

async handleRequestedTileTrigger(data = {}) {
  return this.activationManager.handleSocketRequest(data);
}

canUserSeeTile(tileDoc, options = {}) {
  return this.activationManager.canSee(
    tileDoc,
    options.userId ?? game.user?.id,
    options.tokenId ?? null,
    options.notify === true
  );
}

async toggleLightTileById(tileId, userId = game.user?.id, tokenId = null) {
  const tileDoc = canvas.scene?.tiles?.get(tileId);
  if (!tileDoc) return false;
  if (!this.activationManager.canSee(tileDoc, userId, tokenId, game.user?.id === userId)) return false;
  return lightManager.toggle(tileDoc);
}

}
