// =============================================================================
// TalkToMe utility template actions
// =============================================================================
// This file adds Tile-Utilities-style behaviours while keeping TalkToMe's speech
// bubble and RollTable functionality.
//
// The functions are intentionally best-effort and system-safe:
// - Switches can change tile image and try to open/close/lock a door.
// - Lights create/toggle an AmbientLight tied to the tile.
// - Traps pause the game and request saving throws in chat.
// - Teleports clone token data to a target location then remove the original.
// - Reset tiles restore TalkToMe utility tiles to their default image/state.

import { TTM_ID } from "./constants.js";
import { ttmNotice } from "./helpers.js";
import { lightManager } from "./light-manager.js";
import {
  activateTileEffects,
  playTileEffectsLocal
} from "./effects.js";

export const TTM_TEMPLATES = {
  SPEECH: "speech",
  SWITCH: "switch",
  LIGHT: "light",
  GLOBAL_LIGHT: "globalLight",
  TRAP: "trap",
  TELEPORT: "teleport",
  MOVE_TOKENS: "moveTokens",
  SPAWN_TOKENS: "spawnTokens",
  RESET: "reset"
};





// Global scene lighting
const GLOBAL_LIGHT_STATE_FLAG = "originalGlobalLighting";
const globalLightingTransitions = new Map();

function transitionKey(scene) {
  return scene?.id ?? "scene";
}

function beginGlobalLightingTransition(scene) {
  const key = transitionKey(scene);
  const token = Symbol(`talk-to-me-global-light-${key}`);
  globalLightingTransitions.set(key, token);
  return token;
}

function ownsGlobalLightingTransition(scene, token) {
  return globalLightingTransitions.get(
    transitionKey(scene)
  ) === token;
}

export function cancelGlobalLightingTransition(scene = canvas.scene) {
  if (!scene) return false;

  globalLightingTransitions.delete(transitionKey(scene));
  return true;
}

function getSceneGlobalLighting(scene = canvas.scene) {
  const environment = scene?.environment ?? {};
  const globalLight = environment.globalLight ?? {};

  return {
    darknessLevel: Number(environment.darknessLevel ?? 0),
    enabled: Boolean(globalLight.enabled),
    bright: Boolean(globalLight.bright),
    color: globalLight.color ?? null
  };
}

async function ensureOriginalGlobalLighting(scene = canvas.scene) {
  if (!scene) return null;

  const existing = scene.getFlag(TTM_ID, GLOBAL_LIGHT_STATE_FLAG);
  if (existing) return existing;

  const original = getSceneGlobalLighting(scene);
  await scene.setFlag(TTM_ID, GLOBAL_LIGHT_STATE_FLAG, original);
  return original;
}

async function updateSceneGlobalLighting(
  scene,
  updates
) {
  if (!scene) return false;

  beginGlobalLightingTransition(scene);

  try {
    // Foundry performs and broadcasts its standard darkness animation.
    // One Scene update keeps the GM and every player client in sync.
    await scene.update(
      { ...updates },
      {
        animateDarkness: true,
        talkToMeGlobalLighting: true
      }
    );

    return true;
  } finally {
    cancelGlobalLightingTransition(scene);
  }
}

export async function synchroniseExternalGlobalLightingChange(
  scene,
  changes = {},
  options = {}
) {
  if (!scene || options.talkToMeGlobalLighting === true) {
    return false;
  }

  const environmentChanges = changes.environment ?? {};
  const changedLighting =
    Object.hasOwn(environmentChanges, "darknessLevel")
    || Object.hasOwn(environmentChanges, "globalLight")
    || Object.hasOwn(changes, "environment.darknessLevel")
    || Object.hasOwn(changes, "environment.globalLight.enabled")
    || Object.hasOwn(changes, "environment.globalLight.bright")
    || Object.hasOwn(changes, "environment.globalLight.color");

  if (!changedLighting) return false;

  // Foundry's built-in day/night and global-light controls are authoritative.
  // Stop an active TalkToMe fade and treat the GM's new state as the baseline.
  cancelGlobalLightingTransition(scene);

  await scene.setFlag(
    TTM_ID,
    GLOBAL_LIGHT_STATE_FLAG,
    getSceneGlobalLighting(scene)
  );

  return true;
}

export async function activateGlobalLightingTile(tileDoc) {
  const scene = tileDoc?.parent ?? canvas.scene;
  if (!scene) return false;

  const flags = getUtilityFlags(tileDoc);
  const action = flags.globalLightAction ?? "toggle";
  const original = await ensureOriginalGlobalLighting(scene);
  const current = getSceneGlobalLighting(scene);
  const updates = {};

  // Foundry's day/night controls animate the scene darkness level.
  // Do not toggle globalLight.enabled here because that boolean snaps.
  if (action === "restore") {
    updates["environment.darknessLevel"] =
      Number(original?.darknessLevel ?? 0);

    if (original?.color !== undefined) {
      updates["environment.globalLight.color"] =
        original.color;
    }
  } else if (action === "on") {
    updates["environment.darknessLevel"] = 0;
  } else if (action === "off") {
    updates["environment.darknessLevel"] = 1;
  } else if (action === "toggle") {
    updates["environment.darknessLevel"] =
      current.darknessLevel >= 0.5 ? 0 : 1;
  } else if (action === "set-darkness") {
    updates["environment.darknessLevel"] = Math.max(
      0,
      Math.min(1, Number(flags.globalDarkness ?? 0.75))
    );
  }

  if (flags.globalLightColorOverride === true) {
    updates["environment.globalLight.color"] =
      flags.globalLightColor || "#ffffff";
  }

  await updateSceneGlobalLighting(scene, updates);

  const resultingDarkness = Number(
    updates["environment.darknessLevel"]
    ?? current.darknessLevel
  );
  const nextActive = resultingDarkness >= 0.5;

  const tileUpdates = {
    [`flags.${TTM_ID}.utility.active`]: nextActive
  };

  const nextImage = nextActive
    ? flags.activeImage
    : flags.inactiveImage ?? flags.defaultImage;

  if (nextImage) {
    tileUpdates["texture.src"] = nextImage;
  }

  await tileDoc.update(tileUpdates);

  return true;
}

export async function restoreOriginalGlobalLighting(
  scene = canvas.scene
) {
  if (!scene) return false;

  const original = scene.getFlag(
    TTM_ID,
    GLOBAL_LIGHT_STATE_FLAG
  );

  if (!original) return false;

  cancelGlobalLightingTransition(scene);

  await scene.update(
    {
      "environment.darknessLevel":
        Number(original.darknessLevel ?? 0),
      "environment.globalLight.color":
        original.color ?? null
    },
    {
      animateDarkness: true,
      talkToMeGlobalLighting: true
    }
  );

  await scene.unsetFlag(TTM_ID, GLOBAL_LIGHT_STATE_FLAG);
  return true;
}

// Cooldowns and single-use state
const talkToMeActivationCooldowns = new Map();
const talkToMeSingleUseActivations = new Set();

function singleUseKey(tileDoc) {
  return `${canvas.scene?.id ?? "scene"}.${tileDoc?.id ?? "tile"}`;
}

export function clearTileSingleUseState(tileDoc = null) {
  if (!tileDoc) {
    talkToMeSingleUseActivations.clear();
    return;
  }

  talkToMeSingleUseActivations.delete(singleUseKey(tileDoc));
}

function isSingleUseTileSpent(tileDoc, flags) {
  if (flags.multipleUse !== false) return false;

  return (
    flags.usedOnce === true
    || talkToMeSingleUseActivations.has(singleUseKey(tileDoc))
  );
}

function commitSingleUseActivation(tileDoc, flags) {
  if (flags.multipleUse !== false) return;

  const key = singleUseKey(tileDoc);
  talkToMeSingleUseActivations.add(key);

  if (flags.usedOnce !== true) {
    tileDoc.update({
      [`flags.${TTM_ID}.utility.usedOnce`]: true
    }).catch(error => {
      console.error("TalkToMe failed to save single-use state.", error);
    });
  }
}

function activationCooldownKey(tileDoc) {
  return `${canvas.scene?.id ?? "scene"}.${tileDoc?.id ?? "tile"}`;
}

function activationCooldownDurationMs(tileDoc) {
  const flags = getUtilityFlags(tileDoc);
  const seconds = Math.max(
    0.2,
    Number(flags.activationCooldownSeconds ?? 1)
  );

  return Math.round(seconds * 1000);
}

export function clearTileActivationCooldowns(tileDoc = null) {
  if (!tileDoc) {
    talkToMeActivationCooldowns.clear();
    return;
  }

  talkToMeActivationCooldowns.delete(activationCooldownKey(tileDoc));
}

export function getTileActivationCooldownRemaining(tileDoc) {
  if (!tileDoc) return 0;

  const flags = getUtilityFlags(tileDoc);
  if (flags.activationCooldownEnabled !== true) return 0;

  const key = activationCooldownKey(tileDoc);
  const expiresAt = Number(talkToMeActivationCooldowns.get(key) ?? 0);
  const remainingMs = Math.max(0, expiresAt - Date.now());

  if (remainingMs <= 0 && expiresAt > 0) {
    talkToMeActivationCooldowns.delete(key);
  }

  return remainingMs;
}

export function startTileActivationCooldown(tileDoc) {
  if (!tileDoc) return 0;

  const flags = getUtilityFlags(tileDoc);
  if (flags.activationCooldownEnabled !== true) {
    clearTileActivationCooldowns(tileDoc);
    return 0;
  }

  const durationMs = activationCooldownDurationMs(tileDoc);
  const expiresAt = Date.now() + durationMs;

  talkToMeActivationCooldowns.set(
    activationCooldownKey(tileDoc),
    expiresAt
  );

  return expiresAt;
}

export function canActivateTileNow(tileDoc, {
  commit = true,
  notify = false
} = {}) {
  if (!tileDoc) return false;

  const flags = getUtilityFlags(tileDoc);

  if (isSingleUseTileSpent(tileDoc, flags)) {
    if (notify) {
      ui.notifications.warn(
        `${tileDoc.name ?? "This tile"} has already been used.`
      );
    }
    return false;
  }

  if (flags.activationCooldownEnabled !== true) {
    clearTileActivationCooldowns(tileDoc);

    if (commit) commitSingleUseActivation(tileDoc, flags);
    return true;
  }

  const remainingMs = getTileActivationCooldownRemaining(tileDoc);

  if (remainingMs > 0) {
    if (notify) {
      const remainingSeconds = Math.ceil(remainingMs / 100) / 10;

      ui.notifications.warn(
        `${tileDoc.name ?? "This tile"} is on cooldown for `
        + `${remainingSeconds}s.`
      );
    }

    return false;
  }

  if (commit) {
    startTileActivationCooldown(tileDoc);
    commitSingleUseActivation(tileDoc, flags);
  }

  return true;
}


async function clearMissingLightState(tileDoc, flags) {
  const updates = {
    [`flags.${TTM_ID}.utility.active`]: false,
    [`flags.${TTM_ID}.utility.lightOn`]: false,
    [`flags.${TTM_ID}.utility.ambientLightId`]: "",
    [`flags.${TTM_ID}.utility.usedOnce`]: false
  };

  clearTileSingleUseState(currentTile);

  if (flags.inactiveImage) {
    updates["texture.src"] = flags.inactiveImage;
  }

  await tileDoc.update(updates);
  return false;
}


export function getUtilityFlags(tileDoc) {
  return tileDoc?.getFlag(TTM_ID, "utility") ?? {};
}

export async function setUtilityFlags(tileDoc, data = {}) {
  if (!tileDoc) return;
  const existing = getUtilityFlags(tileDoc);
  await tileDoc.setFlag(TTM_ID, "utility", foundry.utils.mergeObject(existing, data, { inplace: false }));
}

export function getSceneTileById(id) {
  return id ? canvas.scene?.tiles?.get(id) ?? null : null;
}

export function getSceneWallById(id) {
  return id ? canvas.scene?.walls?.get(id) ?? null : null;
}

export function getTileCenter(tileDoc) {
  // Prefer the rendered tile placeable because it matches the visible canvas.
  const placeable = canvas.tiles?.get(tileDoc?.id);
  const bounds = placeable?.bounds;

  const x = Number(bounds?.x ?? tileDoc?.x ?? 0);
  const y = Number(bounds?.y ?? tileDoc?.y ?? 0);
  const width = Number(bounds?.width ?? tileDoc?.width ?? 0);
  const height = Number(bounds?.height ?? tileDoc?.height ?? 0);

  return {
    x: x + width / 2,
    y: y + height / 2
  };
}

export async function updateTileImage(tileDoc, src) {
  if (!tileDoc || !src) return;
  await tileDoc.update({ "texture.src": src });
}

export async function toggleSwitchTile(tileDoc) {
  const flags = getUtilityFlags(tileDoc);
  const active = flags.active !== true;

  await setUtilityFlags(tileDoc, { active });

  const image = active ? flags.activeImage : flags.inactiveImage;
  if (image) await updateTileImage(tileDoc, image);

  await applyDoorState(flags);

  return active;
}

export async function applyDoorState(flags = {}) {
  if (!flags.doorWallId || !flags.doorAction) return;

  const wall = getSceneWallById(flags.doorWallId);
  if (!wall) {
    ttmNotice("warn", "TalkToMe switch could not find the linked door wall.");
    return;
  }

  // Foundry wall door states are numeric. Commonly:
  // 0 = closed, 1 = open, 2 = locked.
  // This is best-effort and may vary by Foundry build/system.
  const stateMap = {
    open: 1,
    close: 0,
    lock: 2,
    toggle: wall.ds === 1 ? 0 : 1
  };

  const ds = stateMap[flags.doorAction];
  if (ds === undefined) return;

  await wall.update({ ds });
}

export async function triggerLinkedLightTiles(flags = {}, switchActive = true) {
  if (!flags.targetTileId) return;

  const target = getSceneTileById(flags.targetTileId);
  if (!target) return;

  const targetUtility = getUtilityFlags(target);
  if (targetUtility.template !== TTM_TEMPLATES.LIGHT) return;

  await toggleLightTile(target, switchActive);
}


export async function syncLightToTilePosition(tileDoc) {
  return lightManager.sync(tileDoc);
}

export async function toggleLightTile(tileDoc, forceState = null) {
  return lightManager.toggle(tileDoc, forceState);
}

export async function activateTrapTile(tileDoc, tokenLike = null) {
  const flags = getUtilityFlags(tileDoc);

  if (game.paused !== true) {
    await game.togglePause(true, true);
  }

  const saveAbility = flags.saveAbility || "dex";
  const dc = Number(flags.saveDC ?? 10);
  const players = selectedPlayerNames(flags);

  const content = `
    <h2>Trap Activated</h2>
    <p><strong>${tileDoc.name}</strong> has triggered.</p>
    <p>Requested save: <strong>${saveAbility.toUpperCase()} DC ${dc}</strong></p>
    ${players ? `<p>Players: ${players}</p>` : ""}
  `;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ alias: "TalkToMe Trap" }),
    content
  });

  if (flags.activeImage) await updateTileImage(tileDoc, flags.activeImage);
  await setUtilityFlags(tileDoc, { active: true });

  return true;
}

export function selectedPlayerNames(flags = {}) {
  const raw = String(flags.targetPlayers ?? "").trim();
  if (!raw) return "";
  return raw;
}

export async function teleportToken(tileDoc, tokenLike = null) {
  const flags = getUtilityFlags(tileDoc);
  const destination = getTeleportDestination(flags);

  if (!destination) {
    ui.notifications.warn(
      "TalkToMe teleport destination X/Y is missing."
    );
    return false;
  }

  const token = findTeleportToken(tileDoc, tokenLike);

  if (!token?.document) {
    ui.notifications.warn(
      "TalkToMe teleport fired, but no triggering token "
      + "was found on the tile image."
    );
    return false;
  }

  const tokenDoc = token.document;

  if (isTeleportOnCooldown(tileDoc, tokenDoc, flags)) {
    return false;
  }

  const bounds = getTokenBounds(tokenDoc);
  const offsetX = Number(flags.teleportOffsetX ?? 0);
  const offsetY = Number(flags.teleportOffsetY ?? 0);

  let newX = Math.round(
    destination.x + offsetX - bounds.width / 2
  );
  let newY = Math.round(
    destination.y + offsetY - bounds.height / 2
  );

  if (flags.teleportAvoidTiles !== false) {
    const safeLanding = findSafeTeleportLanding(
      tileDoc,
      newX,
      newY,
      bounds.width,
      bounds.height
    );

    newX = safeLanding.x;
    newY = safeLanding.y;
  }

  const update = {
    x: newX,
    y: newY
  };

  const cooldownSeconds = Number(
    flags.teleportCooldownSeconds ?? 0
  );

  if (
    flags.teleportUseCooldown
    && Number.isFinite(cooldownSeconds)
    && cooldownSeconds > 0
  ) {
    update[`flags.${TTM_ID}.teleportCooldownUntil`] =
      Date.now() + cooldownSeconds * 1000;
  }

  setTeleportCooldown(tileDoc, tokenDoc, flags);

  // Preserve the token ID, ownership, targeting, vision, and actor link.
  // The active GM performs this document update for player-owned tokens.
  await tokenDoc.update(
    update,
    {
      animate: false,
      teleport: true,
      talkToMeTeleport: true
    }
  );

  await markTeleportTileActivated(tileDoc);

  if (game.user?.isGM) {
    ui.notifications.info(
      `TalkToMe teleported ${tokenDoc.name ?? "token"}.`
    );
  }

  return true;
}

export async function resetAllUtilityTiles() {
  return resetAllTalkToMeTiles();
}


export async function activateUtilityTemplate(tileDoc, tokenLike = null, overrides = {}) {
  const utility = getUtilityFlags(tileDoc);

  if (!utility?.template || utility.template === TTM_TEMPLATES.SPEECH) {
    return false;
  }

  if (!canActivateTileNow(tileDoc, { commit: true, notify: game.user?.isGM })) {
    return false;
  }

  if (utility.template === TTM_TEMPLATES.SWITCH) return toggleSwitchTile(tileDoc);
  if (utility.template === TTM_TEMPLATES.LIGHT) return toggleLightTile(tileDoc);
  if (utility.template === TTM_TEMPLATES.GLOBAL_LIGHT) {
    return activateGlobalLightingTile(tileDoc);
  }
  if (utility.template === TTM_TEMPLATES.TRAP) return activateTrapTile(tileDoc, tokenLike);
  if (utility.template === TTM_TEMPLATES.TELEPORT) return teleportToken(tileDoc, tokenLike);
  if (utility.template === TTM_TEMPLATES.MOVE_TOKENS) {
    return moveTokensToDestination(tileDoc, tokenLike);
  }
  if (utility.template === TTM_TEMPLATES.SPAWN_TOKENS) {
    return spawnTokensFromTile(tileDoc);
  }
  if (utility.template === TTM_TEMPLATES.RESET) return activateResetTile(tileDoc);

  return false;
}




async function runTalkToMeActionCommand(command, {
  tileDoc,
  tokenLike = null,
  sourceTileDoc = null
} = {}) {
  const script = String(command ?? "").trim();
  if (!script) return false;

  const token = tokenLike?.document
    ? tokenLike
    : tokenLike?.object?.document
      ? tokenLike.object
      : tokenLike ?? null;

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction(
    "tile",
    "tileDoc",
    "token",
    "tokens",
    "sourceTile",
    "game",
    "canvas",
    "ui",
    script
  );

  await execute(
    tileDoc,
    tileDoc,
    token,
    token ? [token] : [],
    sourceTileDoc,
    game,
    canvas,
    ui
  );

  return true;
}

async function runTalkToMeMacroReference(reference, context = {}) {
  const value = String(reference ?? "").trim();
  if (!value) return false;

  let macro = null;

  try {
    if (value.startsWith("Macro.")) {
      macro = await fromUuid(value);
    } else {
      macro = game.macros?.get(value)
        ?? game.macros?.find(item => item.name === value)
        ?? null;
    }
  } catch (error) {
    console.warn("TalkToMe could not resolve linked macro.", error);
  }

  if (!macro?.execute) return false;

  await macro.execute({
    tile: context.tileDoc,
    tileDoc: context.tileDoc,
    token: context.tokenLike,
    sourceTile: context.sourceTileDoc
  });

  return true;
}

export async function executeConfiguredTileProgram(
  tileDoc,
  tokenLike = null,
  sourceTileDoc = null
) {
  if (!tileDoc) return false;

  const matt = tileDoc.getFlag("monks-active-tiles") ?? {};
  const actions = Array.isArray(matt.actions) ? matt.actions : [];
  let executed = false;

  for (const action of actions) {
    const type = String(action?.action ?? "").toLowerCase();
    const data = action?.data ?? {};

    if (type === "script") {
      const command = data.command ?? data.script ?? action.command ?? action.script;
      executed = await runTalkToMeActionCommand(command, {
        tileDoc,
        tokenLike,
        sourceTileDoc
      }) || executed;
      continue;
    }

    if (type === "runmacro" || type === "macro") {
      const reference =
        data.entity
        ?? data.macro
        ?? action.entity
        ?? action.macro;

      const ranMacro = await runTalkToMeMacroReference(reference, {
        tileDoc,
        tokenLike,
        sourceTileDoc
      });

      if (ranMacro) {
        executed = true;
        continue;
      }

      const command =
        data.command
        ?? data.script
        ?? action.command
        ?? action.script;

      executed = await runTalkToMeActionCommand(command, {
        tileDoc,
        tokenLike,
        sourceTileDoc
      }) || executed;
    }
  }

  return executed;
}

// Linked tile activation
export async function triggerLinkedTalkToMeTile(api, tileDoc, tokenLike = null) {
  const flags = getUtilityFlags(tileDoc);
  const linkedId = flags.linkedTriggerTileId || flags.targetTileId;

  if (!linkedId) return false;

  if (linkedId === tileDoc.id) {
    ui.notifications.warn("TalkToMe prevented a tile from triggering itself.");
    return false;
  }

  const linkedTile = canvas.scene?.tiles?.get(linkedId);
  if (!linkedTile) {
    ui.notifications.warn("TalkToMe linked tile could not be found.");
    return false;
  }

  const sourceName = tileDoc.name ?? tileDoc.id;
  const linkedName = linkedTile.name ?? linkedTile.id;
  const linkedUtility = getUtilityFlags(linkedTile);
  const linkedSpeech = linkedTile.getFlag(TTM_ID, "speech") ?? {};

  let utilityExecuted = false;
  let speechExecuted = false;

  // Utility tiles commit their cooldown inside the central dispatcher.
  // Speech/macro-only tiles commit it here before any program executes.
  if (linkedUtility?.template && linkedUtility.template !== TTM_TEMPLATES.SPEECH) {
    utilityExecuted = await applyUtilityTemplateActions(
      api,
      linkedTile,
      tokenLike
    ) !== false;

    if (!utilityExecuted) return false;
  } else if (!canActivateTileNow(linkedTile, {
    commit: true,
    notify: game.user?.isGM
  })) {
    return false;
  }

  // Speech-only linked tiles still use the normal speech route.
  if (
    linkedUtility?.template === TTM_TEMPLATES.SPEECH
    || linkedSpeech?.managed === true
  ) {
    const speechResult = await api?.triggerSpeechTile?.(
      linkedTile.id,
      tokenLike,
      {
        postChat: true,
        zoomToSpeaker: false,
        linkedActivation: true,
        sourceTileId: tileDoc.id,
        skipUtilityAction: utilityExecuted,
        skipCooldownCheck: !utilityExecuted
      }
    );

    speechExecuted = speechResult !== false;
  }

  const macroExecuted = await executeConfiguredTileProgram(
    linkedTile,
    tokenLike,
    tileDoc
  );

  return utilityExecuted || speechExecuted || macroExecuted;
}


export function resolveTrapTargetTokens(tileDoc, tokenLike = null) {
  const flags = getUtilityFlags(tileDoc);
  const targetMode = flags.trapTarget ?? "triggering-token";

  if (targetMode === "triggering-token") {
    const token = tokenLike?.document ? tokenLike : tokenLike?.object;
    return token ? [token] : [];
  }

  if (targetMode === "tokens-within-tile") {
    return canvas.tokens?.placeables?.filter(token => tileContainsToken(tileDoc, token.document ?? token)) ?? [];
  }

  if (targetMode === "use-player-tokens") {
    return canvas.tokens?.placeables?.filter(token => {
      const actor = token.actor;
      if (!actor) return false;

      // Active player tokens are tokens whose actors are owned by at least one active non-GM user.
      return game.users?.some(user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER"));
    }) ?? [];
  }

  return [];
}


export async function resetUtilityTileVisualState(tileDoc) {
  const flags = getUtilityFlags(tileDoc);
  const updates = {};

  if (flags.inactiveImage) updates.texture = { src: flags.inactiveImage };

  updates[`flags.${TTM_ID}.utility.active`] = false;

  await tileDoc.update(updates);
  return true;
}


export function scheduleTeleportAutoReset(tileDoc) {
  const flags = getUtilityFlags(tileDoc);
  if (flags.template !== TTM_TEMPLATES.TELEPORT) return;
  if (!flags.teleportAutoReset) return;

  const seconds = Math.max(0, Number(flags.teleportResetSeconds ?? 0));
  if (seconds <= 0) {
    resetUtilityTileVisualState(tileDoc);
    return;
  }

  window.setTimeout(() => {
    const current = canvas.scene?.tiles?.get(tileDoc.id);
    if (current) resetUtilityTileVisualState(current);
  }, seconds * 1000);
}

export async function markTeleportTileActivated(tileDoc) {
  const flags = getUtilityFlags(tileDoc);
  const updates = {
    [`flags.${TTM_ID}.utility.active`]: true
  };

  if (flags.activeImage) updates.texture = { src: flags.activeImage };

  await tileDoc.update(updates);
  scheduleTeleportAutoReset(tileDoc);
}


// Utility action dispatcher
const activeNodeGraphs = new Set();

function nodeGraphKey(tileDoc) {
  return `${tileDoc?.parent?.id ?? canvas.scene?.id ?? "scene"}.${tileDoc?.id ?? "tile"}`;
}

export async function runNodeGraph(
  api,
  sourceTileDoc,
  tokenLike = null,
  visited = new Set()
) {
  if (!api || !sourceTileDoc) return false;

  const graph =
    sourceTileDoc.getFlag(TTM_ID, "nodeGraph") ?? {};

  if (
    graph.enabled !== true
    || !Array.isArray(graph.targets)
    || graph.targets.length === 0
  ) {
    return false;
  }

  const sourceKey = nodeGraphKey(sourceTileDoc);

  if (
    activeNodeGraphs.has(sourceKey)
    || visited.has(sourceKey)
  ) {
    console.warn(
      "TalkToMe prevented a circular node graph.",
      sourceTileDoc.name
    );
    return false;
  }

  activeNodeGraphs.add(sourceKey);
  visited.add(sourceKey);

  const runTarget = async target => {
    const delayMs = Math.max(
      0,
      Number(target?.delay ?? 0) * 1000
    );

    if (delayMs > 0) {
      await new Promise(resolve =>
        window.setTimeout(resolve, delayMs)
      );
    }

    const targetDoc = canvas.scene?.tiles?.get(
      target?.tileId
    );

    if (!targetDoc) {
      console.warn(
        "TalkToMe node target was not found.",
        target?.tileId
      );
      return false;
    }

    const targetKey = nodeGraphKey(targetDoc);
    if (visited.has(targetKey)) {
      console.warn(
        "TalkToMe skipped a circular node target.",
        targetDoc.name
      );
      return false;
    }

    const result = await api.triggerSpeechTileByCategory(
      targetDoc.id,
      "manual",
      tokenLike,
      {
        nodeGraphActivation: true,
        nodeGraphVisited: new Set(visited)
      }
    );

    return result !== false;
  };

  try {
    if (graph.mode === "parallel") {
      await Promise.all(graph.targets.map(runTarget));
    } else {
      for (const target of graph.targets) {
        await runTarget(target);
      }
    }

    return true;
  } finally {
    activeNodeGraphs.delete(sourceKey);
  }
}

const activeMultiUseTiles = new Set();

function multiUseKey(tileDoc) {
  return `${tileDoc?.parent?.id ?? canvas.scene?.id ?? "scene"}.${tileDoc?.id ?? "tile"}`;
}

function resolveMultiUseToken(tokenLike, tokenId = "") {
  if (tokenId) {
    return canvas.tokens?.get(tokenId) ?? null;
  }

  return tokenLike?.document
    ? tokenLike
    : tokenLike?.object
      ?? canvas.tokens?.controlled?.[0]
      ?? game.user?.targets?.first?.()
      ?? null;
}

export async function runMultiUseActions(
  api,
  sourceTileDoc,
  tokenLike = null
) {
  if (!api || !sourceTileDoc) return false;

  const config =
    sourceTileDoc.getFlag(TTM_ID, "multiUse") ?? {};

  if (
    config.enabled !== true
    || !Array.isArray(config.actions)
    || config.actions.length === 0
  ) {
    return false;
  }

  const key = multiUseKey(sourceTileDoc);
  if (activeMultiUseTiles.has(key)) {
    console.warn(
      "TalkToMe prevented a circular multi-use tile.",
      sourceTileDoc.name
    );
    return false;
  }

  activeMultiUseTiles.add(key);

  const createVirtualTile = action => {
    const virtual = Object.create(sourceTileDoc);

    Object.defineProperty(virtual, "name", {
      value:
        `${sourceTileDoc.name ?? "TalkToMe"} `
        + `(${action.template ?? "action"})`,
      configurable: true
    });

    virtual.getFlag = (scope, key) => {
      if (scope === TTM_ID && key === "utility") {
        return {
          ...(sourceTileDoc.getFlag(TTM_ID, "utility") ?? {}),
          ...action,
          template: action.template
        };
      }

      return sourceTileDoc.getFlag(scope, key);
    };

    return virtual;
  };

  const runAction = async action => {
    const template = action?.template;
    if (!template) return false;

    const virtualTile = createVirtualTile(action);

    if (template === TTM_TEMPLATES.SPEECH) {
      const token = resolveMultiUseToken(
        tokenLike,
        action.tokenId
      );

      if (!token) {
        ui.notifications.warn(
          "TalkToMe multi-use speech needs a speaker token."
        );
        return false;
      }

      let text = String(action.text ?? "");

      if (action.mode === "table" && action.tableId) {
        const table = game.tables?.get(action.tableId);

        if (!table) {
          ui.notifications.warn(
            "TalkToMe multi-use RollTable was not found."
          );
          return false;
        }

        text = await api.rollTable(table);
      }

      if (!String(text ?? "").trim()) return false;

      return api.say({
        token,
        text,
        npcName: String(action.npcName ?? ""),
        postChat: false,
        broadcast: true,
        zoomToSpeaker: false
      });
    }

    if (template === TTM_TEMPLATES.SWITCH) {
      await applyDoorState(action);
      return true;
    }

    if (template === TTM_TEMPLATES.LIGHT) {
      return toggleLightTile(virtualTile);
    }

    if (template === TTM_TEMPLATES.GLOBAL_LIGHT) {
      return activateGlobalLightingTile(virtualTile);
    }

    if (template === TTM_TEMPLATES.TRAP) {
      return activateTrapTile(virtualTile, tokenLike);
    }

    if (template === TTM_TEMPLATES.TELEPORT) {
      return runTeleportUtility(
        virtualTile,
        tokenLike,
        { debug: false }
      );
    }

    if (template === TTM_TEMPLATES.MOVE_TOKENS) {
      return moveTokensToDestination(
        virtualTile,
        tokenLike
      );
    }

    if (template === TTM_TEMPLATES.SPAWN_TOKENS) {
      return spawnTokensFromTile(virtualTile);
    }

    if (template === TTM_TEMPLATES.RESET) {
      return activateResetTile(sourceTileDoc);
    }

    return false;
  };

  try {
    if (config.mode === "parallel") {
      await Promise.allSettled(
        config.actions.map(runAction)
      );
    } else {
      for (const action of config.actions) {
        await runAction(action);
      }
    }

    return true;
  } finally {
    activeMultiUseTiles.delete(key);
  }
}

async function finishUtilityActivation(
  api,
  tileDoc,
  tokenLike,
  result = true
) {
  if (result === false) return false;

  await activateTileEffects(tileDoc);
  await runMultiUseActions(api, tileDoc, tokenLike);
  await runNodeGraph(api, tileDoc, tokenLike);
  return result;
}

// Spawn actor prototype tokens
function getSpawnFormationOffset(index, count, spacing, formation) {
  if (count <= 1 || formation === "single") {
    return { x: 0, y: 0 };
  }

  if (formation === "circle") {
    const radius = Math.max(spacing, spacing * count / (2 * Math.PI));
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  }

  if (formation === "random") {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * spacing * Math.max(1, Math.sqrt(count));
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  }

  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const column = index % columns;
  const row = Math.floor(index / columns);

  return {
    x: (column - (columns - 1) / 2) * spacing,
    y: (row - (rows - 1) / 2) * spacing
  };
}

async function buildSpawnTokenData(actor, x, y) {
  if (typeof actor?.getTokenDocument === "function") {
    const tokenDoc = await actor.getTokenDocument({ x, y });
    return tokenDoc?.toObject?.() ?? tokenDoc;
  }

  const prototype = actor?.prototypeToken?.toObject?.()
    ?? foundry.utils.deepClone(actor?.prototypeToken ?? {});

  return {
    ...prototype,
    actorId: actor.id,
    actorLink: Boolean(prototype.actorLink),
    x,
    y
  };
}

export async function spawnTokensFromTile(tileDoc) {
  const scene = tileDoc?.parent ?? canvas.scene;
  if (!scene) return false;

  const flags = getUtilityFlags(tileDoc);
  const actor = game.actors?.get(flags.spawnActorId);

  if (!actor) {
    ui.notifications.warn("TalkToMe Spawn Tokens actor could not be found.");
    return false;
  }

  const quantity = Math.max(1, Math.min(50, Number(flags.spawnQuantity ?? 1)));
  const pointX = Number(flags.spawnX);
  const pointY = Number(flags.spawnY);

  if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) {
    ui.notifications.warn("TalkToMe Spawn Tokens location is missing.");
    return false;
  }

  const spacing = Math.max(0, Number(flags.spawnSpacing ?? canvas.grid?.size ?? 100));
  const formation = flags.spawnFormation ?? "grid";
  const tokenData = [];

  for (let index = 0; index < quantity; index += 1) {
    const offset = getSpawnFormationOffset(index, quantity, spacing, formation);
    const data = await buildSpawnTokenData(
      actor,
      Math.round(pointX + offset.x),
      Math.round(pointY + offset.y)
    );

    if (!data) continue;
    delete data._id;

    const gridSize = Number(canvas.grid?.size ?? scene.grid?.size ?? 100);
    const tokenWidth = Math.max(1, Number(data.width ?? 1)) * gridSize;
    const tokenHeight = Math.max(1, Number(data.height ?? 1)) * gridSize;
    data.x = Math.round(pointX + offset.x - tokenWidth / 2);
    data.y = Math.round(pointY + offset.y - tokenHeight / 2);
    data.hidden = flags.spawnHidden === true;
    data.flags = foundry.utils.mergeObject(
      data.flags ?? {},
      {
        [TTM_ID]: {
          spawnedByTileId: tileDoc.id
        }
      },
      { inplace: false }
    );
    tokenData.push(data);
  }

  if (!tokenData.length) return false;

  const created = await scene.createEmbeddedDocuments("Token", tokenData, {
    talkToMeSpawnTokens: true
  });
  const spawnedTokenIds = created.map(token => token.id);

  await tileDoc.update({
    [`flags.${TTM_ID}.utility.active`]: true,
    [`flags.${TTM_ID}.utility.spawnedTokenIds`]: spawnedTokenIds
  });

  return true;
}

export async function applyUtilityTemplateActions(api, tileDoc, tokenLike = null) {
  const flags = getUtilityFlags(tileDoc);

  if (!flags?.template) return false;
  if (!canActivateTileNow(tileDoc, { commit: true, notify: game.user?.isGM })) {
    return false;
  }

  if (flags.template === TTM_TEMPLATES.SWITCH) {
    await toggleSwitchTile(tileDoc);
    await triggerLinkedTalkToMeTile(api, tileDoc, tokenLike);
    return finishUtilityActivation(api, tileDoc, tokenLike);
  }

  if (flags.template === TTM_TEMPLATES.LIGHT) {
    await toggleLightTile(tileDoc);
    return finishUtilityActivation(api, tileDoc, tokenLike);
  }

  if (flags.template === TTM_TEMPLATES.GLOBAL_LIGHT) {
    await activateGlobalLightingTile(tileDoc);
    return finishUtilityActivation(api, tileDoc, tokenLike);
  }

  if (flags.template === TTM_TEMPLATES.TRAP) {
    await triggerTrapTile(tileDoc, tokenLike);
    await triggerLinkedTalkToMeTile(api, tileDoc, tokenLike);
    return finishUtilityActivation(api, tileDoc, tokenLike);
  }

  if (flags.template === TTM_TEMPLATES.TELEPORT) {
    const result = await teleportToken(tileDoc, tokenLike);
    return finishUtilityActivation(
      api,
      tileDoc,
      tokenLike,
      result
    );
  }

  if (flags.template === TTM_TEMPLATES.MOVE_TOKENS) {
    const result = await moveTokensToDestination(
      tileDoc,
      tokenLike
    );
    return finishUtilityActivation(
      api,
      tileDoc,
      tokenLike,
      result
    );
  }

  if (flags.template === TTM_TEMPLATES.SPAWN_TOKENS) {
    const result = await spawnTokensFromTile(tileDoc);
    return finishUtilityActivation(
      api,
      tileDoc,
      tokenLike,
      result
    );
  }

  if (flags.template === TTM_TEMPLATES.RESET) {
    await activateResetTile(tileDoc);
    return finishUtilityActivation(api, tileDoc, tokenLike);
  }

  return false;
}






// Animated token movement
function resolveMoveTargetTokens(tileDoc, tokenLike, flags) {
  const mode = flags.moveTargetMode ?? "triggering-token";
  const supplied =
    tokenLike?.document
      ? tokenLike
      : tokenLike?.object ?? tokenLike;

  if (mode === "triggering-token") {
    return supplied?.document
      ? [supplied]
      : findTeleportToken(tileDoc, tokenLike)
        ? [findTeleportToken(tileDoc, tokenLike)]
        : [];
  }

  if (mode === "tokens-within-tile") {
    const tileBounds = getTileBounds(tileDoc);
    return (canvas.tokens?.placeables ?? []).filter(token => {
      return boundsOverlap(
        getTokenBounds(token),
        tileBounds
      );
    });
  }

  if (mode === "selected-tokens") {
    return Array.from(canvas.tokens?.controlled ?? []);
  }

  if (mode === "specific-npcs") {
    const tokenIds = Array.isArray(flags.moveTokenIds)
      ? flags.moveTokenIds
      : [];

    return tokenIds
      .map(tokenId => canvas.tokens?.get(tokenId))
      .filter(token => token?.document);
  }

  if (mode === "player-tokens") {
    return (canvas.tokens?.placeables ?? []).filter(token => {
      const actor = token.actor;
      return actor?.hasPlayerOwner === true;
    });
  }

  return [];
}

function moveFormationOffset(index, count, spacing) {
  if (count <= 1) return { x: 0, y: 0 };

  const columns = Math.ceil(Math.sqrt(count));
  const row = Math.floor(index / columns);
  const column = index % columns;
  const rows = Math.ceil(count / columns);

  return {
    x: (column - (columns - 1) / 2) * spacing,
    y: (row - (rows - 1) / 2) * spacing
  };
}

export async function moveTokensToDestination(
  tileDoc,
  tokenLike = null
) {
  const flags = getUtilityFlags(tileDoc);
  const savedRoute = Array.isArray(flags.moveRoute)
    ? flags.moveRoute
        .map(point => ({
          x: Number(point?.x),
          y: Number(point?.y)
        }))
        .filter(point =>
          Number.isFinite(point.x)
          && Number.isFinite(point.y)
        )
    : [];

  const fallbackX = Number(flags.moveDestinationX);
  const fallbackY = Number(flags.moveDestinationY);
  const baseRoute = savedRoute.length
    ? savedRoute
    : (
        Number.isFinite(fallbackX)
        && Number.isFinite(fallbackY)
          ? [{ x: fallbackX, y: fallbackY }]
          : []
      );

  if (!baseRoute.length) {
    ui.notifications.warn(
      "TalkToMe Move Tokens route is missing."
    );
    return false;
  }

  const targets = resolveMoveTargetTokens(
    tileDoc,
    tokenLike,
    flags
  );

  if (!targets.length) {
    ui.notifications.warn(
      "TalkToMe could not find any tokens to move."
    );
    return false;
  }

  const gridSize =
    canvas.grid?.size
    ?? canvas.scene?.grid?.size
    ?? 100;
  const spacing = Math.max(
    0,
    Number(flags.moveSpacing ?? gridSize)
  );
  const offsetX = Number(flags.moveOffsetX ?? 0);
  const offsetY = Number(flags.moveOffsetY ?? 0);

  const movements = targets.map(async (token, index) => {
    const tokenDoc = token.document ?? token;
    const bounds = getTokenBounds(tokenDoc);
    const formation = moveFormationOffset(
      index,
      targets.length,
      spacing
    );

    const waypoints = baseRoute.map((point, pointIndex) => ({
      x: Math.round(
        point.x
        + offsetX
        + formation.x
        - bounds.width / 2
      ),
      y: Math.round(
        point.y
        + offsetY
        + formation.y
        - bounds.height / 2
      ),
      explicit: true,
      checkpoint: pointIndex < baseRoute.length - 1
    }));

    // Foundry v14 TokenDocument.move accepts multiple waypoints,
    // performs constrained movement, and can show the native ruler.
    if (typeof tokenDoc.move === "function") {
      return tokenDoc.move(
        waypoints,
        {
          showRuler: true,
          autoRotate: flags.moveAutoRotate === true,
          talkToMeMoveTokens: true
        }
      );
    }

    // Compatibility fallback for builds without TokenDocument.move.
    for (const waypoint of waypoints) {
      await tokenDoc.update(
        {
          x: waypoint.x,
          y: waypoint.y
        },
        {
          animate: true,
          talkToMeMoveTokens: true
        }
      );
    }

    return true;
  });

  const results = await Promise.all(movements);
  const completed = results.some(result => result !== false);

  if (!completed) return false;

  const activeImage = flags.activeImage;
  const update = {
    [`flags.${TTM_ID}.utility.active`]: true
  };

  if (activeImage) update["texture.src"] = activeImage;
  await tileDoc.update(update);

  return true;
}

export function getTeleportDestination(flags) {
  const x = Number(flags.teleportX);
  const y = Number(flags.teleportY);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return { x, y };
}

export function getTokenBounds(token) {
  const doc = token?.document ?? token;
  if (!doc) return null;

  const gridSize = canvas.grid?.size ?? canvas.scene?.grid?.size ?? 100;

  return {
    left: Number(doc.x ?? 0),
    top: Number(doc.y ?? 0),
    right: Number(doc.x ?? 0) + Number(doc.width ?? 1) * gridSize,
    bottom: Number(doc.y ?? 0) + Number(doc.height ?? 1) * gridSize,
    width: Number(doc.width ?? 1) * gridSize,
    height: Number(doc.height ?? 1) * gridSize
  };
}

export function getTileBounds(tileDoc) {
  return {
    left: Number(tileDoc?.x ?? 0),
    top: Number(tileDoc?.y ?? 0),
    right: Number(tileDoc?.x ?? 0) + Number(tileDoc?.width ?? 0),
    bottom: Number(tileDoc?.y ?? 0) + Number(tileDoc?.height ?? 0),
    width: Number(tileDoc?.width ?? 0),
    height: Number(tileDoc?.height ?? 0)
  };
}

export function boundsOverlap(a, b) {
  if (!a || !b) return false;

  return a.left < b.right
    && a.right > b.left
    && a.top < b.bottom
    && a.bottom > b.top;
}

export function findTeleportToken(tileDoc, tokenLike = null) {
  const supplied = tokenLike?.document ? tokenLike : tokenLike?.object ?? tokenLike;
  if (supplied?.document) return supplied;

  const selected = canvas.tokens?.controlled?.[0];
  if (selected?.document) return selected;

  const tileBounds = getTileBounds(tileDoc);

  const overlapping = canvas.tokens?.placeables?.find(token => {
    return boundsOverlap(getTokenBounds(token), tileBounds);
  });

  if (overlapping?.document) return overlapping;

  return null;
}


export async function runTeleportUtility(tileDoc, tokenLike = null, { debug = true } = {}) {
  return teleportToken(tileDoc, tokenLike);
}



function getTeleportCooldownKey(tileDoc, tokenDoc) {
  const actorId = tokenDoc?.actorId ?? tokenDoc?.actor?.id ?? "";
  const tokenId = tokenDoc?.id ?? "";
  const tokenName = tokenDoc?.name ?? "";

  // Global per-token cooldown.
  // Do not include tile id, otherwise two linked teleport tiles can bounce the same token.
  return actorId || tokenId || tokenName || "unknown-token";
}

function getTeleportCooldownStore() {
  game.talkToMeTeleportCooldowns ??= new Map();
  return game.talkToMeTeleportCooldowns;
}

function isTeleportOnCooldown(tileDoc, tokenDoc, flags) {
  if (!flags.teleportUseCooldown) return false;

  const tokenFlagReadyAt = Number(tokenDoc.getFlag?.(TTM_ID, "teleportCooldownUntil") ?? 0);
  if (tokenFlagReadyAt > Date.now()) return true;

  const seconds = Number(flags.teleportCooldownSeconds ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return false;

  const store = getTeleportCooldownStore();
  const key = getTeleportCooldownKey(tileDoc, tokenDoc);
  const now = Date.now();
  const readyAt = Number(store.get(key) ?? 0);

  return readyAt > now;
}

function setTeleportCooldown(tileDoc, tokenDoc, flags) {
  if (!flags.teleportUseCooldown) return;

  const seconds = Number(flags.teleportCooldownSeconds ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return;

  const store = getTeleportCooldownStore();
  const key = getTeleportCooldownKey(tileDoc, tokenDoc);

  store.set(key, Date.now() + seconds * 1000);
}


function getTeleportLandingRect(x, y, width, height) {
  return {
    left: Number(x ?? 0),
    top: Number(y ?? 0),
    right: Number(x ?? 0) + Number(width ?? 0),
    bottom: Number(y ?? 0) + Number(height ?? 0),
    width: Number(width ?? 0),
    height: Number(height ?? 0)
  };
}

function isTeleportTile(tileDoc) {
  const utility = tileDoc?.getFlag?.(TTM_ID, "utility") ?? {};
  return utility.template === TTM_TEMPLATES.TELEPORT || utility.template === "teleport";
}

function landingOverlapsTeleportTile(rect, sourceTileId = null) {
  return canvas.scene?.tiles?.some(tileDoc => {
    if (!isTeleportTile(tileDoc)) return false;
    if (sourceTileId && tileDoc.id === sourceTileId) return false;

    return boundsOverlap(rect, getTileBounds(tileDoc));
  }) ?? false;
}

function findSafeTeleportLanding(tileDoc, x, y, width, height) {
  const start = getTeleportLandingRect(x, y, width, height);

  if (!landingOverlapsTeleportTile(start, tileDoc?.id)) {
    return { x, y };
  }

  const gridSize = canvas.grid?.size ?? canvas.scene?.grid?.size ?? 100;
  const step = Math.max(gridSize, Math.ceil(Math.max(width, height, 1)));
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
  ];

  for (let distance = 1; distance <= 8; distance += 1) {
    for (const [dx, dy] of directions) {
      const candidateX = Math.round(x + dx * step * distance);
      const candidateY = Math.round(y + dy * step * distance);
      const rect = getTeleportLandingRect(candidateX, candidateY, width, height);

      if (!landingOverlapsTeleportTile(rect, tileDoc?.id)) {
        return { x: candidateX, y: candidateY };
      }
    }
  }

  ui.notifications.warn("TalkToMe could not find a nearby safe landing spot away from teleport tiles.");
  return { x, y };
}


async function resetTalkToMeTileToOriginalState(tileDoc) {
  if (!tileDoc || !canvas?.scene) return false;

  const currentTile = canvas.scene.tiles?.get(tileDoc.id) ?? tileDoc;
  const flags = getUtilityFlags(currentTile);
  const original = flags.originalState ?? {};
  const template = flags.template;

  // Remove tokens created by Spawn Tokens tiles when reset cleanup is enabled.
  if (
    template === TTM_TEMPLATES.SPAWN_TOKENS
    && flags.spawnRemoveOnReset !== false
  ) {
    const storedIds = Array.isArray(flags.spawnedTokenIds)
      ? flags.spawnedTokenIds
      : [];
    const ownedIds = (canvas.scene.tokens?.contents ?? [])
      .filter(token => {
        return token.getFlag(TTM_ID, "spawnedByTileId") === currentTile.id;
      })
      .map(token => token.id);
    const ids = [...new Set([...storedIds, ...ownedIds])]
      .filter(id => canvas.scene.tokens?.get(id));

    if (ids.length) {
      await canvas.scene.deleteEmbeddedDocuments("Token", ids, {
        talkToMeSpawnReset: true
      });
    }
  }

  // Lights require manager cleanup so duplicate/legacy AmbientLights are removed.
  if (template === TTM_TEMPLATES.LIGHT) {
    await lightManager.setActive(currentTile, false);
  } else {
    const managedLightIds = (canvas.scene.lights?.contents ?? [])
      .filter(lightDoc => {
        const owner =
          lightDoc.getFlag(TTM_ID, "ownerTileId")
          ?? lightDoc.getFlag(TTM_ID, "parentTileId")
          ?? lightDoc.getFlag(TTM_ID, "linkedTileId");

        return owner === currentTile.id;
      })
      .map(lightDoc => lightDoc.id);

    if (managedLightIds.length) {
      await canvas.scene.deleteEmbeddedDocuments(
        "AmbientLight",
        managedLightIds
      );
    }
  }

  // Restore the linked door to the state captured when the switch was created.
  if (template === TTM_TEMPLATES.SWITCH && flags.doorWallId) {
    const wall = canvas.scene.walls?.get(flags.doorWallId);

    if (wall) {
      let originalDoorState = Number(original.originalDoorState);

      // Older tiles predate saved door state. Their safe reset state is closed.
      if (!Number.isFinite(originalDoorState)) {
        originalDoorState = 0;
      }

      await wall.update({ ds: originalDoorState });
    }
  }

  const inactiveImage =
    original.inactiveImage
    ?? original.image
    ?? flags.inactiveImage
    ?? flags.defaultImage;

  const updates = {
    [`flags.${TTM_ID}.utility.active`]: Boolean(original.active ?? false),
    [`flags.${TTM_ID}.utility.lightOn`]: false,
    [`flags.${TTM_ID}.utility.ambientLightId`]: "",
    [`flags.${TTM_ID}.utility.spawnedTokenIds`]: []
  };

  if (inactiveImage) {
    updates["texture.src"] = inactiveImage;
  }

  for (const key of [
    "doorWallId",
    "doorAction",
    "lightDim",
    "lightBright",
    "lightColor",
    "lightAlpha",
    "lightAnimation",
    "globalLightAction",
    "globalDarkness",
    "globalLightColorOverride",
    "globalLightColor",
    "globalLightUseFoundryFade",
    "moveDestinationX",
    "moveDestinationY",
    "moveRoute",
    "moveTargetMode",
    "moveTokenIds",
    "moveOffsetX",
    "moveOffsetY",
    "moveSpacing",
    "moveAutoRotate",
    "spawnActorId",
    "spawnQuantity",
    "spawnX",
    "spawnY",
    "spawnFormation",
    "spawnSpacing",
    "spawnHidden",
    "spawnRemoveOnReset",
    "teleportX",
    "teleportY",
    "teleportOffsetX",
    "teleportOffsetY",
    "teleportAvoidTiles",
    "teleportUseCooldown",
    "teleportCooldownSeconds",
    "requirePlayerVision",
    "hideBehindWalls",
    "activationCooldownEnabled",
    "activationCooldownSeconds",
    "multipleUse",
    "activationActorTypes",
    "effectsEnabled",
    "soundEnabled",
    "soundFile",
    "soundVolume",
    "animationEnabled",
    "animationType",
    "animationDuration"
  ]) {
    if (Object.hasOwn(original, key)) {
      updates[`flags.${TTM_ID}.utility.${key}`] = original[key];
    }
  }

  await currentTile.update(updates);
  return true;
}


// Reset all managed tiles
export async function resetAllTalkToMeTiles({
  sourceTileDoc = null,
  deferSourceReset = false
} = {}) {
  await restoreOriginalGlobalLighting(canvas.scene);

  const managedTiles = (canvas.scene?.tiles?.contents ?? []).filter(tileDoc => {
    const utility = tileDoc.getFlag(TTM_ID, "utility");
    return Boolean(utility?.template);
  });

  const sourceId = sourceTileDoc?.id ?? null;
  const immediateTiles = deferSourceReset && sourceId
    ? managedTiles.filter(tileDoc => tileDoc.id !== sourceId)
    : managedTiles;

  for (const tileDoc of immediateTiles) {
    await resetTalkToMeTileToOriginalState(tileDoc);
  }

  game.talkToMeTeleportCooldowns?.clear?.();
  clearTileActivationCooldowns();
  clearTileSingleUseState();
  game.talkToMe?.entryCooldown?.clear?.();
  game.talkToMe?.resetEntryHistory?.();
  game.talkToMe?.refreshClickableTileOverlay?.();

  return {
    count: managedTiles.length,
    deferredSource: deferSourceReset && sourceId
      ? managedTiles.find(tileDoc => tileDoc.id === sourceId) ?? null
      : null
  };
}

export async function activateResetTile(tileDoc) {
  if (!tileDoc) return false;

  const currentTile = canvas.scene?.tiles?.get(tileDoc.id) ?? tileDoc;
  const flags = getUtilityFlags(currentTile);

  const activeUpdates = {
    [`flags.${TTM_ID}.utility.active`]: true
  };

  if (flags.activeImage) {
    activeUpdates["texture.src"] = flags.activeImage;
  }

  await currentTile.update(activeUpdates);

  // Give Foundry a render frame so the reset tile visibly fires.
  await new Promise(resolve => requestAnimationFrame(resolve));

  const resetResult = await resetAllTalkToMeTiles({
    sourceTileDoc: currentTile,
    deferSourceReset: true
  });

  // Keep the active image visible briefly, then reset the source tile too.
  await new Promise(resolve => window.setTimeout(resolve, 400));

  const refreshedSource = canvas.scene?.tiles?.get(currentTile.id);
  if (refreshedSource) {
    await resetTalkToMeTileToOriginalState(refreshedSource);

    const refreshedFlags = getUtilityFlags(refreshedSource);
    if (refreshedFlags.activationCooldownEnabled === true) {
      canActivateTileNow(refreshedSource, {
        commit: true,
        notify: false
      });
    }
  }

  return resetResult.count > 0;
}



