// =============================================================================
// Hooks
// =============================================================================
// Registers Foundry hooks, socket handling, visibility refreshes, and scene lifecycle events.

import { TTM_ID, TTM_SOCKET_ACTIONS } from "./constants.js";
import { lightManager } from "./light-manager.js";
import { migrateScene } from "./migration.js";
import {
  synchroniseExternalGlobalLightingChange
} from "./utilities.js";
import {
  panToWorldTemporarily
} from "./speech.js";
import { playTileEffectsLocal } from "./effects.js";


// Visibility refresh state
let talkToMeVisibilityRefreshPending = false;

function scheduleTalkToMeTileVisibilityRefresh() {
  if (talkToMeVisibilityRefreshPending) return;
  talkToMeVisibilityRefreshPending = true;

  const refresh = () => {
    game.talkToMe?.activationManager?.refreshTileVisibility?.();
  };

  requestAnimationFrame(() => {
    talkToMeVisibilityRefreshPending = false;
    refresh();
    window.setTimeout(refresh, 50);
    window.setTimeout(refresh, 150);
  });
}


function openTalkToMe() {
  const api = game.talkToMe ?? game.modules.get(TTM_ID)?.api;
  if (api?.open) return api.open();
  ui.notifications.warn("TalkToMe is not ready.");
}

function addToolbarTool(controls) {
  const tool = {
    name: "talk-to-me",
    title: "TalkToMe",
    label: "TalkToMe",
    icon: "fa-solid fa-comment-dots",
    order: 999,
    button: true,
    visible: game.user?.isGM === true,
    onChange: openTalkToMe
  };

  if (controls?.tokens?.tools) controls.tokens.tools["talk-to-me"] = tool;
  if (controls?.tiles?.tools) controls.tiles.tools["talk-to-me"] = { ...tool };

  if (Array.isArray(controls)) {
    for (const name of ["tokens", "token", "tiles", "tile"]) {
      const control = controls.find(item => item.name === name);
      if (!control) continue;
      control.tools ??= [];
      if (Array.isArray(control.tools) && !control.tools.some(item => item.name === tool.name)) {
        control.tools.push(tool);
      }
    }
  }
}

function createFloatingButton() {
  if (!game.user?.isGM) return;
  if (document.getElementById("talk-to-me-floating-launcher")) return;

  const button = document.createElement("button");
  button.id = "talk-to-me-floating-launcher";
  button.type = "button";
  button.title = "Open TalkToMe";
  button.innerHTML = "💬";
  button.addEventListener("click", openTalkToMe);
  document.body.appendChild(button);
}


async function removeLegacyClickActions() {
  if (!game.user?.isGM || !canvas?.scene) return;

  for (const tileDoc of canvas.scene.tiles?.contents ?? []) {
    const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};
    const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
    const trigger = speech.trigger ?? utility.trigger ?? "manual";
    if (speech.managed !== true || trigger !== "switch") continue;

    const matt = tileDoc.getFlag("monks-active-tiles");
    if (!matt) continue;

    await tileDoc.unsetFlag("monks-active-tiles", "actions");
    await tileDoc.unsetFlag("monks-active-tiles", "trigger");
    await tileDoc.unsetFlag("monks-active-tiles", "triggers");
    await tileDoc.unsetFlag("monks-active-tiles", "active");
  }
}

export function registerHooks() {
  Hooks.on("getSceneControlButtons", controls => {
    try { addToolbarTool(controls); }
    catch (error) { console.error("TalkToMe toolbar registration failed.", error); }
  });

  Hooks.once("ready", () => window.setTimeout(createFloatingButton, 250));
  Hooks.on("renderSceneControls", () => window.setTimeout(createFloatingButton, 100));


Hooks.on("sightRefresh", scheduleTalkToMeTileVisibilityRefresh);
Hooks.on("lightingRefresh", scheduleTalkToMeTileVisibilityRefresh);
Hooks.on("canvasPan", scheduleTalkToMeTileVisibilityRefresh);
Hooks.on("refreshTile", tile => {
  const tileDoc = tile?.document ?? tile;
  game.talkToMe?.activationManager?.applyTileVisibility?.(tileDoc);
  scheduleTalkToMeTileVisibilityRefresh();
});

Hooks.on("drawTile", tile => {
  const tileDoc = tile?.document ?? tile;
  window.setTimeout(
    () => game.talkToMe?.activationManager?.applyTileVisibility?.(tileDoc),
    0
  );
});

  // Scene ready handling
Hooks.on("canvasReady", async () => {
    const activeGM = game.users?.activeGM;
    const isMigrationGM =
      game.user?.isGM
      && (!activeGM || activeGM.id === game.user.id);

    if (isMigrationGM && canvas.scene) {
      try {
        await migrateScene(canvas.scene, { dryRun: false });
      } catch (error) {
        console.error(
          "TalkToMe scene migration failed.",
          error
        );
      }
    }

    window.setTimeout(createFloatingButton, 100);
    game.talkToMe?.resetEntryHistory?.();
    game.talkToMe?.startTriggerScanner?.();
    game.talkToMe?.startTileClickListeners?.();
    game.talkToMe?.startCleanTeleportScanner?.();
    game.talkToMe?.bubbles?.clear?.();
    game.talkToMe?.bubbles?.ensureLayer?.();
    await removeLegacyClickActions();
    await lightManager.reconcileScene();
    scheduleTalkToMeTileVisibilityRefresh();
  });

  for (const hookName of ["controlToken", "targetToken", "createToken", "deleteToken"]) {
    Hooks.on(hookName, () => {
      if (game.talkToMe?.app?.element) game.talkToMe.app.refreshTokenSelectors?.();
      scheduleTalkToMeTileVisibilityRefresh();
    });
  }

  Hooks.on("updateToken", async (tokenDoc, changes) => {
    if (game.talkToMe?.app?.element) game.talkToMe.app.refreshTokenSelectors?.();
    const moved = Object.hasOwn(changes ?? {}, "x") || Object.hasOwn(changes ?? {}, "y");
    if (moved) {
      await game.talkToMe?.scanMovementTriggers?.();
      scheduleTalkToMeTileVisibilityRefresh();
    }
    game.talkToMe?.bubbles?.updatePositions?.();
  });

  Hooks.on("createTile", () => {
    game.talkToMe?.app?.refreshManagedTileList?.();
    game.talkToMe?.resetEntryHistory?.();
    window.setTimeout(
      () => game.talkToMe?.activationManager?.refreshTileVisibility?.(),
      0
    );
  });

  Hooks.on("updateTile", async (tileDoc, changes) => {
    game.talkToMe?.app?.refreshManagedTileList?.();
    game.talkToMe?.resetEntryHistory?.();
    window.setTimeout(
      () => game.talkToMe?.activationManager?.refreshTileVisibility?.(),
      0
    );

    const movedOrResized = ["x", "y", "width", "height"]
      .some(key => Object.hasOwn(changes ?? {}, key));
    if (!movedOrResized) return;

    const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
    if (utility.template === "light") await lightManager.sync(tileDoc);

    if (utility.template === "teleport") {
      await tileDoc.update({
        [`flags.${TTM_ID}.utility.teleportSwitchX`]: Math.round(Number(tileDoc.x ?? 0) + Number(tileDoc.width ?? 0) / 2),
        [`flags.${TTM_ID}.utility.teleportSwitchY`]: Math.round(Number(tileDoc.y ?? 0) + Number(tileDoc.height ?? 0) / 2)
      });
    }
  });

  Hooks.on("deleteTile", async tileDoc => {
    game.talkToMe?.app?.refreshManagedTileList?.();
    game.talkToMe?.resetEntryHistory?.();
    const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
    if (utility.template === "light") await lightManager.remove(tileDoc);
  });
}

async function panClientToWorld(data) {
  if (!data?.world) return false;

  const bubbleDuration = Math.max(
    0,
    Number(
      data.panHoldDuration
      ?? data.bubbleDuration
      ?? data.duration
      ?? game.settings.get(TTM_ID, "bubbleDuration")
      ?? 5500
    )
  );

  return panToWorldTemporarily({
    x: data.world.x,
    y: data.world.y,
    duration: 450,
    holdDuration: bubbleDuration
  });
}

export function registerSocket() {
  game.socket.on(`module.${TTM_ID}`, async data => {
    if (!data?.action) return;
    if (data.sceneId && data.sceneId !== canvas.scene?.id) return;

    if (data.action === TTM_SOCKET_ACTIONS.SPEECH) {
      if (data.zoomToSpeaker) {
        await panClientToWorld(data);
      }
      game.talkToMe?.bubbles?.show?.(data);
      return;
    }

    if (data.action === "tileEffects") {
      if (data.senderId === game.user?.id) return false;
      return playTileEffectsLocal(data);
    }

    if (data.action === TTM_SOCKET_ACTIONS.PAN) return panClientToWorld(data);
    if (data.action === TTM_SOCKET_ACTIONS.CLEAR) return game.talkToMe?.bubbles?.clear?.();
    if (data.action === TTM_SOCKET_ACTIONS.REQUEST_TILE_TRIGGER) return game.talkToMe?.handleRequestedTileTrigger?.(data);
    if (data.action === "cleanTeleport") return game.talkToMe?.handleCleanTeleportSocket?.(data);
    if (data.action === "hardTeleport") return game.talkToMe?.handleHardTeleportRequest?.(data);
  });
}


Hooks.on("updateScene", async (scene, changes, options) => {
  try {
    await synchroniseExternalGlobalLightingChange(
      scene,
      changes,
      options
    );
  } catch (error) {
    console.error(
      "TalkToMe failed to synchronise Foundry lighting controls.",
      error
    );
  }
});
