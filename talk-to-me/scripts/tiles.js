// =============================================================================
// Tiles
// =============================================================================
// Creates TalkToMe tiles and runs speech-tile activation.

import {
  TTM_ID,
  TTM_MATT_ID,
  TTM_TAGGER_ID,
  TTM_TILE_SCHEMA_VERSION
} from "./constants.js";

import {
  ttmCurrentPlacementPosition,
  ttmIsGM,
  ttmModuleActive,
  ttmNotice,
  ttmSlug,
  ttmTokenById
} from "./helpers.js";

import { generateLeftClickTileMacroScript, generateMattPresetScript, generateTileTriggerScript } from "./macros.js";
import { resolveToken } from "./speech.js";
import {
  resolveConversationLine,
  playConversationSequence
} from "./conversation.js";
import { placementManager } from "./placement-manager.js";
import { lightManager } from "./light-manager.js";
import {
  applyUtilityTemplateActions,
  canActivateTileNow,
  runTeleportUtility
} from "./utilities.js";

export const TTM_MOVEMENT_TRIGGERS = ["enter", "exit"];
export const TTM_ACTION_TRIGGERS = ["switch", "trap", "effect", "manual"];

export const TTM_PRESET_LABELS = {
  enter: "Speech: Token Enters",
  exit: "Speech: Token Exits",
  switch: "Speech: Switch Activated",
  trap: "Speech: Trap Triggered",
  effect: "Speech: Magic/Effect Triggered",
  manual: "Speech: Manual"
};

export const TTM_SWITCH_CLICK_LABELS = {
  left: "Left Click",
  "double-left": "Double Left Click",
  right: "Right Click",
  any: "Any Click"
};

export function getManagedSpeechTiles() {
  return canvas.scene?.tiles
    ?.filter(t => t.getFlag(TTM_ID, "speech")?.managed === true)
    ?.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")) ?? [];
}

export function getGridSize() {
  return canvas.scene?.grid?.size ?? canvas.grid?.size ?? 100;
}

export function getTileRect(tileDoc) {
  const x = Number(tileDoc?.x ?? 0);
  const y = Number(tileDoc?.y ?? 0);
  const w = Number(tileDoc?.width ?? 0);
  const h = Number(tileDoc?.height ?? 0);

  return {
    left: Math.min(x, x + w),
    top: Math.min(y, y + h),
    right: Math.max(x, x + w),
    bottom: Math.max(y, y + h)
  };
}

export function getTokenRect(tokenDoc) {
  const grid = getGridSize();

  const x = Number(tokenDoc?.x ?? 0);
  const y = Number(tokenDoc?.y ?? 0);
  const w = Math.max(grid * 0.25, Number(tokenDoc?.width ?? 1) * grid);
  const h = Math.max(grid * 0.25, Number(tokenDoc?.height ?? 1) * grid);

  return {
    left: x,
    top: y,
    right: x + w,
    bottom: y + h
  };
}

export function rectsOverlap(a, b) {
  if (!a || !b) return false;

  return a.right >= b.left
    && a.left <= b.right
    && a.bottom >= b.top
    && a.top <= b.bottom;
}

export function tileContainsToken(tileDoc, tokenDoc) {
  return rectsOverlap(getTileRect(tileDoc), getTokenRect(tokenDoc));
}

export function pointInTile(tileDoc, point) {
  if (!tileDoc || !point) return false;

  const rect = getTileRect(tileDoc);

  return point.x >= rect.left
    && point.x <= rect.right
    && point.y >= rect.top
    && point.y <= rect.bottom;
}

export function templateLabel(template = "speech", trigger = "enter") {
  const labels = {
    speech: TTM_PRESET_LABELS[trigger] || "Speech Tile",
    switch: "Switch Activation",
    light: "Light Activation",
    trap: "Trap Activation",
    teleport: "Teleport Activation",
    reset: "Create Reset Tile"
  };

  return labels[template] || "Speech Tile";
}

export function mattTriggerModeForTalkToMe(trigger, clickActivation = "left") {
  if (trigger === "enter") return "enter";
  if (trigger === "exit") return "exit";

  if (trigger === "switch") {
    if (clickActivation === "double-left") return "dblclick";
    if (clickActivation === "right") return "rightclick";
    if (clickActivation === "any") return "click";

    // MATT builds have used slightly different names over time.
    // TalkToMe stores this as "click", and generateMattFlags also writes
    // left-click aliases into the triggers list.
    return "click";
  }

  if (trigger === "trap") return "enter";
  if (trigger === "effect") return "manual";
  return "manual";
}

export function generateMattFlags({
  trigger = "enter",
  script = "",
  tileName = "TalkToMe Speech",
  clickActivation = "left"
} = {}) {
  const mattTrigger = mattTriggerModeForTalkToMe(trigger, clickActivation);
  const isManual = mattTrigger === "manual";

  const triggers = isManual ? [] : [mattTrigger];

  // Explicit left-click compatibility for Monk's Active Tile Triggers.
  // Different MATT versions have used click, leftclick, and left-click style names.
  if (trigger === "switch" && clickActivation === "left") {
    for (const alias of ["click", "leftclick", "left-click", "leftClick"]) {
      if (!triggers.includes(alias)) triggers.push(alias);
    }
  }

  const active = !isManual;
  const leftClickScript = trigger === "switch" && clickActivation === "left"
    ? generateLeftClickTileMacroScript({})
    : script;

  return {
    active,
    restriction: "all",
    controlled: "all",
    trigger: mattTrigger,
    triggers,
    method: mattTrigger,
    event: mattTrigger,
    click: trigger === "switch" ? clickActivation : "",
    allowpaused: true,
    minrequired: 0,
    chance: 100,
    actions: [
      {
        action: "script",
        name: `${tileName} TalkToMe Speech`,
        data: {
          command: leftClickScript,
          script: leftClickScript
        }
      },
      {
        action: "runmacro",
        name: `${tileName} TalkToMe Macro`,
        data: {
          entity: "",
          macro: "",
          command: leftClickScript
        }
      }
    ]
  };
}








function refreshReturnTeleportTriggers() {
  // Newly-created return tiles need to be added to the click overlay immediately.
  game.talkToMe?.bindClickableTilePlaceables?.();
  game.talkToMe?.refreshClickableTileOverlay?.();
  game.talkToMe?.resetEntryHistory?.();
}

async function createReturnTeleportTile(originalTileDoc) {
  const utility = originalTileDoc.getFlag(TTM_ID, "utility") ?? {};

  if (utility.template !== "teleport") return null;
  if (!utility.teleportCreateReturn) return null;

  const destinationX = Number(utility.teleportX);
  const destinationY = Number(utility.teleportY);

  if (!Number.isFinite(destinationX) || !Number.isFinite(destinationY)) {
    ui.notifications.warn("TalkToMe could not create return teleport: destination coordinates are missing.");
    return null;
  }

  const width = Number(originalTileDoc.width ?? 100);
  const height = Number(originalTileDoc.height ?? 100);

  const originalSwitchX = Math.round(Number(originalTileDoc.x ?? 0) + width / 2);
  const originalSwitchY = Math.round(Number(originalTileDoc.y ?? 0) + height / 2);

  const returnData = foundry.utils.deepClone(originalTileDoc.toObject());
  delete returnData._id;

  // Place the return tile centred on the first tile's Teleport End Location.
  returnData.x = Math.round(destinationX - width / 2);
  returnData.y = Math.round(destinationY - height / 2);
  returnData.width = width;
  returnData.height = height;
  returnData.hidden = originalTileDoc.hidden;

  // Keep the same images/settings, but reverse the teleport coordinates.
  foundry.utils.setProperty(returnData, `flags.${TTM_ID}.utility.trigger`, utility.trigger ?? "switch");
  foundry.utils.setProperty(returnData, `flags.${TTM_ID}.utility.clickActivation`, utility.clickActivation ?? "left");
  foundry.utils.setProperty(returnData, `flags.${TTM_ID}.speech.trigger`, utility.trigger ?? "switch");
  foundry.utils.setProperty(returnData, `flags.${TTM_ID}.speech.clickActivation`, utility.clickActivation ?? "left");
  foundry.utils.setProperty(returnData, `flags.${TTM_ID}.utility.teleportCreateReturn`, false);
  foundry.utils.setProperty(returnData, `flags.${TTM_ID}.utility.teleportSwitchX`, destinationX);
  foundry.utils.setProperty(returnData, `flags.${TTM_ID}.utility.teleportSwitchY`, destinationY);
  foundry.utils.setProperty(returnData, `flags.${TTM_ID}.utility.teleportX`, originalSwitchX);
  foundry.utils.setProperty(returnData, `flags.${TTM_ID}.utility.teleportY`, originalSwitchY);
  foundry.utils.setProperty(returnData, `flags.${TTM_ID}.utility.active`, false);

  const speech = foundry.utils.getProperty(returnData, `flags.${TTM_ID}.speech`) ?? {};
  speech.name = `${speech.name || originalTileDoc.name || "Teleport"} Return`;
  foundry.utils.setProperty(returnData, `flags.${TTM_ID}.speech`, speech);

  const [returnTile] = await canvas.scene.createEmbeddedDocuments("Tile", [returnData]);

  if (returnTile) {
    refreshReturnTeleportTriggers();
    ui.notifications.info("TalkToMe created return teleport tile.");
  }

  return returnTile ?? null;
}


async function autoFillTeleportSwitchLocation(tileDoc) {
  const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
  if (utility.template !== "teleport") return tileDoc;

  const switchX = Math.round(Number(tileDoc.x ?? 0) + Number(tileDoc.width ?? 0) / 2);
  const switchY = Math.round(Number(tileDoc.y ?? 0) + Number(tileDoc.height ?? 0) / 2);

  await tileDoc.update({
    [`flags.${TTM_ID}.utility.teleportSwitchX`]: switchX,
    [`flags.${TTM_ID}.utility.teleportSwitchY`]: switchY
  });

  return canvas.scene.tiles.get(tileDoc.id) ?? tileDoc;
}




function talkToMeMattClickTriggerFor(clickActivation = "left") {
  const value = String(clickActivation ?? "left").toLowerCase();

  if (["double-left", "dblclick", "doubleclick", "double-click"].includes(value)) return "dblclick";
  if (["right", "rightclick", "right-click"].includes(value)) return "rightclick";

  return "click";
}

function buildTalkToMeLightMattFlags(template, trigger, clickActivation, tileId = null) {
  if (template !== "light") return {};

  const macroTileId = tileId ?? "@tile.id";
  const command = `
const api = game.talkToMe ?? game.modules.get("talk-to-me")?.api;
if (!api?.toggleLightTileById) {
  ui.notifications.warn("TalkToMe light API is not ready.");
  return;
}
const activatingUserId = typeof userId !== "undefined" ? userId : game.user.id;
const activatingTokenId = typeof tokens !== "undefined" && tokens?.[0]
  ? (tokens[0].id ?? tokens[0].document?.id ?? null)
  : null;
await api.toggleLightTileById("${macroTileId}", activatingUserId, activatingTokenId);
`.trim();

  const triggerValue = talkToMeMattClickTriggerFor(clickActivation);

  return {
    "monks-active-tiles": {
      active: true,
      trigger: triggerValue,
      triggers: [triggerValue],
      restriction: "all",
      controlled: "all",
      actions: [
        {
          action: "runmacro",
          data: {
            entity: "",
            macro: command,
            args: ""
          },
          macro: command,
          command,
          entity: "",
          id: foundry.utils.randomID?.() ?? `${Date.now()}`
        }
      ]
    }
  };
}




// Create TalkToMe tile
export async function createSpeechTile({
  x = null,
  y = null,
  name = "",
  npcName = "",
  subjectTokenId = "",
  tableId = "",
  trigger = "enter",
  mode = "table",
  text = "",
  postChat = false,
  zoomToSpeaker = false,
  hidden = false,
  requirePlayerVision = false,
  hideBehindWalls = true,
  activationCooldownEnabled = false,
  activationCooldownSeconds = 1,
  multipleUse = true,
  width = 200,
  height = 200,
  clickActivation = "left",
  tileImage = "",
  presetName = "",
  template = "speech",
  activeImage = "",
  inactiveImage = "",
  doorWallId = "",
  doorAction = "toggle",
  targetTileId = "",
  lightDim = 20,
  lightBright = 10,
  lightColor = "#ffffff",
  lightAlpha = 0.5,
  lightAnimation = "",
  saveAbility = "dex",
  saveDC = 10,
  trapTarget = "triggering-token",
  linkedTriggerTileId = "",
  teleportSwitchX = "",
  teleportSwitchY = "",
  teleportX = "",
  teleportY = "",
  teleportOffsetX = 0,
  teleportOffsetY = 0,
  teleportAutoReset = true,
  teleportResetSeconds = 3,
  teleportCreateReturn = false,
  teleportUseCooldown = true,
  teleportCooldownSeconds = 3,
  teleportAvoidTiles = true,
  hotspotSize = 64,
  hotspotOffsetX = 0,
  hotspotOffsetY = 0,
  conversationEnabled = false,
  conversationId = "",
  conversationStart = false,
  conversationStartNode = "start",
  conversationNextTileId = "",
  conversationSequenceEnabled = false,
  conversationParticipants = [],
  conversationOrder = [],
  conversationLineDelay = 3
} = {}) {
  if (!ttmIsGM()) {
    ttmNotice("warn", "Only the GM can create speech tiles.");
    return null;
  }

  if (!canvas.scene) {
    ttmNotice("warn", "No active scene.");
    return null;
  }

  const table = tableId ? game.tables.get(tableId) : null;

  const requiresSpeechSource =
    template === "speech"
    && conversationSequenceEnabled !== true;

  if (requiresSpeechSource && mode === "table" && !table) {
    ttmNotice("warn", "Choose a RollTable for the Speech Bubble template.");
    return null;
  }

  if (requiresSpeechSource && mode === "custom" && !text.trim()) {
    ttmNotice("warn", "Enter custom speech for the Speech Bubble template.");
    return null;
  }

  const clickedX = Number.isFinite(Number(x)) ? Number(x) : null;
  const clickedY = Number.isFinite(Number(y)) ? Number(y) : null;
  const pos = clickedX !== null && clickedY !== null
    ? placementManager.centerOnPoint(clickedX, clickedY, width, height)
    : ttmCurrentPlacementPosition();
  const presetLabel = presetName || templateLabel(template, trigger);
  const tileName = name || `${presetLabel}${npcName ? ` - ${npcName}` : ""}`;
  const script = generateMattPresetScript({ trigger, postChat, zoomToSpeaker });
  const fallbackScript = generateTileTriggerScript({ postChat, zoomToSpeaker });
  const textureSrc = inactiveImage || tileImage || game.settings.get(TTM_ID, "speechTileImage") || "icons/svg/sound.svg";

  const originalDoorState = doorWallId
    ? Number(canvas.scene?.walls?.get(doorWallId)?.ds ?? 0)
    : null;

  const flags = {
    [TTM_ID]: {
      dataVersion: TTM_TILE_SCHEMA_VERSION,
      utility: placementManager.addPlacementFlags({
        template,
        trigger,
        active: false,
        inactiveImage: inactiveImage || textureSrc,
        activeImage,
        defaultImage: textureSrc,
        doorWallId,
        doorAction,
        targetTileId,
        lightDim,
        lightBright,
        lightColor,
        lightAlpha,
        lightAnimation,
        saveAbility,
        saveDC,
        trapTarget,
        linkedTriggerTileId,
        teleportSwitchX,
        teleportSwitchY,
        teleportX,
        teleportY,
        teleportOffsetX,
        teleportOffsetY,
        teleportAutoReset,
        teleportResetSeconds,
        teleportCreateReturn,
        teleportUseCooldown,
        teleportCooldownSeconds,
        teleportAvoidTiles,
        hotspotSize,
        hotspotOffsetX,
        hotspotOffsetY,
        clickActivation,
        requirePlayerVision,
        hideBehindWalls,
        activationCooldownEnabled,
        activationCooldownSeconds: Math.max(
          0.2,
          Number(activationCooldownSeconds || 1)
        ),
        multipleUse,
        usedOnce: false,
        originalState: {
          active: false,
          image: inactiveImage || textureSrc,
          inactiveImage: inactiveImage || textureSrc,
          activeImage,
          doorWallId,
          doorAction,
          originalDoorState,
          lightDim,
          lightBright,
          lightColor,
          lightAlpha,
          lightAnimation,
          teleportX,
          teleportY,
          teleportOffsetX,
          teleportOffsetY,
          teleportAvoidTiles,
          teleportUseCooldown,
          teleportCooldownSeconds,
          requirePlayerVision,
          hideBehindWalls,
          activationCooldownEnabled,
          activationCooldownSeconds: Math.max(
            0.2,
            Number(activationCooldownSeconds || 1)
          ),
          multipleUse
        }
      }),
      speech: {
        managed: true,
        preset: presetLabel,
        name: tileName,
        npcName,
        subjectTokenId,
        tableId,
        tableName: table?.name ?? "",
        trigger,
        mode,
        text,
        postChat,
        zoomToSpeaker,
        script,
        fallbackScript,
        clickActivation,
        tileImage: textureSrc,
        mattTrigger: mattTriggerModeForTalkToMe(trigger, clickActivation),
        createdAt: Date.now(),
        conversationEnabled,
        conversationId,
        conversationStart,
        conversationStartNode,
        conversationNextTileId,
        conversationSequenceEnabled,
        conversationParticipants,
        conversationOrder,
        conversationLineDelay
      }
    }
  };

  if (ttmModuleActive(TTM_MATT_ID) && trigger !== "switch") {
    flags[TTM_MATT_ID] = generateMattFlags({
      trigger,
      script,
      tileName,
      clickActivation
    });
  }

  if (ttmModuleActive(TTM_TAGGER_ID)) {
    flags.tagger = {
      tags: [
        "talk-to-me",
        "speech-tile",
        `ttm-trigger-${trigger}`,
        `ttm-preset-${ttmSlug(presetLabel)}`,
        ttmSlug(tileName),
        npcName ? `npc-${ttmSlug(npcName)}` : "npc-custom"
      ]
    };
  }

  const data = {
    name: tileName,
    x: pos.x,
    y: pos.y,
    width,
    height,
    hidden,
    alpha: hidden ? 0.25 : 0.75,
    texture: {
      src: textureSrc,
      scaleX: 1,
      scaleY: 1
    },
    flags
  };

  const created = await canvas.scene.createEmbeddedDocuments("Tile", [data]);
  let doc = created?.[0];

  if (doc) {
    doc = await autoFillTeleportSwitchLocation(doc);
    await createReturnTeleportTile(doc);

    // New Light tiles always begin switched off.
    // This also removes any AmbientLight created by the placement click.
    if (template === "light") {
      await lightManager.setActive(doc, false);
      doc = canvas.scene?.tiles?.get(doc.id) ?? doc;
    }

    ttmNotice("info", `Created ${presetLabel}: ${tileName}.`);
    canvas.tiles?.activate?.();
    canvas.tiles?.get(doc.id)?.control?.({ releaseOthers: true });
    doc = await placementManager.finish(doc);
  }

  return doc ?? null;
}

// Activate speech tile
export async function triggerSpeechTile(api, tileId, tokenLike = null, overrides = {}) {
  const doc = canvas.scene?.tiles?.get(tileId);
  if (!doc) return ttmNotice("warn", "Speech tile not found.");

  const utility = doc.getFlag(TTM_ID, "utility") ?? {};
  const isSpeechOnly = !utility.template || utility.template === "speech";

  if (
    isSpeechOnly
    && overrides.skipCooldownCheck !== true
    && !canActivateTileNow(doc, {
      commit: true,
      notify: game.user?.isGM
    })
  ) {
    return false;
  }

  if (overrides.skipUtilityAction !== true && !isSpeechOnly) {
    if (utility.template === "teleport") {
      if (!canActivateTileNow(doc, {
        commit: true,
        notify: game.user?.isGM
      })) {
        return false;
      }

      await runTeleportUtility(doc, tokenLike, { debug: true });
    } else {
      const utilityResult = await applyUtilityTemplateActions(
        api,
        doc,
        tokenLike
      );

      if (utilityResult === false) return false;
    }
  }

  const flags = doc.getFlag(TTM_ID, "speech");
  if (!flags) return ttmNotice("warn", "That tile is not a TalkToMe speech tile.");

  if (flags.conversationSequenceEnabled === true) {
    return playConversationSequence(
      api,
      doc,
      flags,
      resolveToken(tokenLike)
    );
  }

  const table = flags.tableId ? game.tables.get(flags.tableId) : null;
  const customText = flags.mode === "custom" ? String(flags.text ?? "").trim() : "";
  const hasSpeechSource = Boolean(table || customText);

  if (!hasSpeechSource) return;

  const subjectToken = flags.subjectTokenId ? ttmTokenById(flags.subjectTokenId) : null;
  const token = subjectToken ?? resolveToken(tokenLike);

  let conversationText = "";
  if (flags.conversationEnabled === true && table) {
    const line = await resolveConversationLine(doc, table, flags);
    if (line?.blocked) return false;
    conversationText = String(line?.text ?? "").trim();
  }

  await api.say({
    token,
    tableId: conversationText ? "" : (table?.id ?? ""),
    text: conversationText || customText,
    npcName: flags.npcName,
    postChat: overrides.postChat ?? flags.postChat,
    zoomToSpeaker: overrides.zoomToSpeaker ?? flags.zoomToSpeaker
  });
}
