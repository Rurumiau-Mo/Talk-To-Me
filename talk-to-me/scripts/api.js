// =============================================================================
// TalkToMe public API
// =============================================================================
// Exposes game.talkToMe and coordinates UI, speech, bubbles, tiles, and entry checks.

import { TTM_ID, TTM_MATT_ID, TTM_TAGGER_ID } from "./constants.js";
import { TalkToMeApp } from "./app.js";
import { TalkToMeBubbleManager } from "./bubbles.js";

import { ttmIsGM, ttmModuleActive, ttmNotice } from "./helpers.js";
import { activateUtilityTemplate } from "./utilities.js";

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
    this.clickListenersActive = false;
    this.boundSwitchLeftClick = event => this.handleSwitchTileClick("left", event);
    this.boundSwitchDoubleLeftClick = event => this.handleSwitchTileClick("double-left", event);
    this.boundSwitchRightClick = event => this.handleSwitchTileClick("right", event);
  }

  initBubbles() {
    this.bubbles.init();
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

  async triggerSpeechTile(tileId, tokenLike = null, overrides = {}) {
    const doc = canvas.scene?.tiles?.get(tileId);
    if (doc) await activateUtilityTemplate(doc, tokenLike, overrides);

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
    this.clickListenersActive = false;
    this.boundSwitchLeftClick = event => this.handleSwitchTileClick("left", event);
    this.boundSwitchDoubleLeftClick = event => this.handleSwitchTileClick("double-left", event);
    this.boundSwitchRightClick = event => this.handleSwitchTileClick("right", event);
}

async scanMovementTriggers({ primeOnly = false } = {}) {
  if (!ttmIsGM()) return;
  if (!canvas?.scene || !canvas.tokens) return;

  const tokens = canvas.tokens.placeables ?? [];
  const tiles = this.getManagedSpeechTiles()
    .filter(tile => TTM_MOVEMENT_TRIGGERS.includes(tile.getFlag(TTM_ID, "speech")?.trigger));

  for (const tileDoc of tiles) {
    const flags = tileDoc.getFlag(TTM_ID, "speech");
    if (!flags?.managed) continue;

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

      let shouldTrigger = false;

      if (flags.trigger === "enter") shouldTrigger = !wasInside && insideNow;
      if (flags.trigger === "exit") shouldTrigger = wasInside && !insideNow;

      this.entryState.set(stateKey, insideNow);

      if (!shouldTrigger) continue;

      const now = Date.now();
      const last = this.entryCooldown.get(stateKey) ?? 0;
      const cooldown = Number(game.settings.get(TTM_ID, "triggerCooldown") ?? 1000);

      if (now - last < cooldown) continue;

      this.entryCooldown.set(stateKey, now);
      await this.triggerSpeechTile(tileDoc.id, token);
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

}