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

export const TTM_TEMPLATES = {
  SPEECH: "speech",
  SWITCH: "switch",
  LIGHT: "light",
  TRAP: "trap",
  TELEPORT: "teleport",
  RESET: "reset"
};

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
  return {
    x: Number(tileDoc.x ?? 0) + Number(tileDoc.width ?? 0) / 2,
    y: Number(tileDoc.y ?? 0) + Number(tileDoc.height ?? 0) / 2
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
  await triggerLinkedLightTiles(flags, active);

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

export async function toggleLightTile(tileDoc, forceState = null) {
  const flags = getUtilityFlags(tileDoc);
  const active = forceState === null ? flags.active !== true : forceState === true;

  await setUtilityFlags(tileDoc, { active });

  const existingLightId = flags.ambientLightId;
  const existingLight = existingLightId ? canvas.scene?.lights?.get(existingLightId) : null;

  if (!active) {
    if (existingLight) await existingLight.delete();
    await setUtilityFlags(tileDoc, { ambientLightId: "" });
    if (flags.inactiveImage) await updateTileImage(tileDoc, flags.inactiveImage);
    return false;
  }

  const centre = getTileCenter(tileDoc);

  const lightData = {
    x: centre.x,
    y: centre.y,
    hidden: false,
    config: {
      dim: Number(flags.lightDim ?? 20),
      bright: Number(flags.lightBright ?? 10),
      color: flags.lightColor || "#ffffff",
      alpha: Number(flags.lightAlpha ?? 0.5),
      animation: {
        type: flags.lightAnimation || "",
        speed: 1,
        intensity: 1
      }
    },
    flags: {
      [TTM_ID]: {
        createdBy: "TalkToMe",
        parentTileId: tileDoc.id
      }
    }
  };

  if (existingLight) {
    await existingLight.update(lightData);
    await setUtilityFlags(tileDoc, { ambientLightId: existingLight.id });
  } else {
    const created = await canvas.scene.createEmbeddedDocuments("AmbientLight", [lightData]);
    await setUtilityFlags(tileDoc, { ambientLightId: created?.[0]?.id ?? "" });
  }

  if (flags.activeImage) await updateTileImage(tileDoc, flags.activeImage);

  return true;
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

  const token = tokenLike?.document
    ? tokenLike
    : tokenLike?.object
      ? tokenLike.object
      : tokenLike?.id
        ? canvas.tokens?.get(tokenLike.id)
        : Array.from(canvas.tokens?.controlled ?? [])[0];

  if (!token?.document) {
    ttmNotice("warn", "Teleport tile needs a triggering, selected, or controlled token.");
    return false;
  }

  const x = Number(flags.teleportX ?? tileDoc.x ?? token.document.x);
  const y = Number(flags.teleportY ?? tileDoc.y ?? token.document.y);

  const data = token.document.toObject();
  delete data._id;
  data.x = x;
  data.y = y;

  await canvas.scene.createEmbeddedDocuments("Token", [data]);
  await token.document.delete();

  if (flags.activeImage) await updateTileImage(tileDoc, flags.activeImage);
  await setUtilityFlags(tileDoc, { active: true });

  return true;
}

export async function resetAllUtilityTiles() {
  const tiles = canvas.scene?.tiles ?? [];

  for (const tileDoc of tiles) {
    const utility = getUtilityFlags(tileDoc);
    if (!utility?.template) continue;

    const updates = {
      active: false,
      ambientLightId: ""
    };

    if (utility.inactiveImage) {
      await updateTileImage(tileDoc, utility.inactiveImage);
    }

    if (utility.ambientLightId) {
      const light = canvas.scene?.lights?.get(utility.ambientLightId);
      if (light) await light.delete();
    }

    await setUtilityFlags(tileDoc, updates);
  }

  ttmNotice("info", "TalkToMe reset all utility tiles in this scene.");
  return true;
}

export async function activateUtilityTemplate(tileDoc, tokenLike = null, overrides = {}) {
  const utility = getUtilityFlags(tileDoc);

  if (!utility?.template || utility.template === TTM_TEMPLATES.SPEECH) {
    return false;
  }

  if (utility.template === TTM_TEMPLATES.SWITCH) return toggleSwitchTile(tileDoc);
  if (utility.template === TTM_TEMPLATES.LIGHT) return toggleLightTile(tileDoc);
  if (utility.template === TTM_TEMPLATES.TRAP) return activateTrapTile(tileDoc, tokenLike);
  if (utility.template === TTM_TEMPLATES.TELEPORT) return teleportToken(tileDoc, tokenLike);
  if (utility.template === TTM_TEMPLATES.RESET) return resetAllUtilityTiles();

  return false;
}
