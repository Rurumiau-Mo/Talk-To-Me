// =============================================================================
// TalkToMe Foundry hooks and socket listener
// =============================================================================
// Adds toolbar buttons, refreshes UI state, checks entry tiles, and receives speech sockets.

import { TTM_ID, TTM_SOCKET_ACTIONS } from "./constants.js";

export function registerHooks() {
  Hooks.on("getSceneControlButtons", controls => {
    if (!game.user?.isGM) return;

    const button = {
      name: "talk-to-me",
      title: "TalkToMe",
      icon: "fa-solid fa-comment-dots",
      order: 999,
      button: true,
      visible: true,
      onChange: () => game.talkToMe?.open()
    };

    const tokenControl = Array.isArray(controls)
      ? controls.find(c => c.name === "token" || c.name === "tokens")
      : controls.tokens ?? controls.token;

    if (tokenControl) {
      tokenControl.tools ??= Array.isArray(tokenControl.tools) ? [] : {};
      if (Array.isArray(tokenControl.tools)) {
        if (!tokenControl.tools.some(t => t.name === "talk-to-me")) tokenControl.tools.push(button);
      } else {
        tokenControl.tools["talk-to-me"] = button;
      }
    }

    const tileControl = Array.isArray(controls)
      ? controls.find(c => c.name === "tiles" || c.name === "tile")
      : controls.tiles ?? controls.tile;

    if (tileControl) {
      tileControl.tools ??= Array.isArray(tileControl.tools) ? [] : {};
      const tileButton = { ...button, title: "TalkToMe Speech Tiles" };

      if (Array.isArray(tileControl.tools)) {
        if (!tileControl.tools.some(t => t.name === "talk-to-me")) tileControl.tools.push(tileButton);
      } else {
        tileControl.tools["talk-to-me"] = tileButton;
      }
    }
  });

  Hooks.on("canvasReady", () => {
    game.talkToMe?.resetEntryHistory?.();

    if (game.talkToMe?.app?.element) {
      game.talkToMe.app.refreshManagedTileList();
      game.talkToMe.app.refreshTokenSelectors();
    }

    game.talkToMe?.bubbles?.clear?.();
    game.talkToMe?.bubbles?.ensureLayer?.();
  });

  for (const hookName of ["controlToken", "targetToken", "createToken", "deleteToken"]) {
    Hooks.on(hookName, () => {
      if (game.talkToMe?.app?.element) game.talkToMe.app.refreshTokenSelectors();
    });
  }

  Hooks.on("updateToken", async (tokenDoc, changes) => {
    if (game.talkToMe?.app?.element) game.talkToMe.app.refreshTokenSelectors();

    const moved = Object.hasOwn(changes ?? {}, "x") || Object.hasOwn(changes ?? {}, "y");
    if (moved) await game.talkToMe?.checkEntryTriggersForToken(tokenDoc);

    game.talkToMe?.bubbles?.updatePositions?.();
  });
}

function ttmPanClientToWorld(data) {
  if (!data?.world) return;

  const currentScale = canvas.stage?.scale?.x ?? 1;
  const targetScale = Math.max(currentScale, 1.35);

  try {
    canvas.animatePan({
      x: data.world.x,
      y: data.world.y,
      scale: targetScale,
      duration: data.duration ?? 450
    });
  } catch (err) {
    canvas.animatePan({
      x: data.world.x,
      y: data.world.y,
      duration: data.duration ?? 450
    });
  }
}

export function registerSocket() {
  game.socket.on(`module.${TTM_ID}`, async data => {
    if (!data?.action) return;
    if (data.sceneId && data.sceneId !== canvas.scene?.id) return;

    if (data.action === TTM_SOCKET_ACTIONS.SPEECH) {
      console.debug("TalkToMe received speech socket", data);
      if (data.zoomToSpeaker) ttmPanClientToWorld(data);
      game.talkToMe?.bubbles?.show?.({
        sceneId: data.sceneId,
        tokenId: data.tokenId,
        text: data.text,
        speakerName: data.speakerName,
        duration: data.duration,
        bubbleId: data.bubbleId,
        world: data.world
      });
    }

    if (data.action === TTM_SOCKET_ACTIONS.PAN) {
      ttmPanClientToWorld(data);
    }

    if (data.action === TTM_SOCKET_ACTIONS.CLEAR) {
      game.talkToMe?.bubbles?.clear?.();
    }
  });
}
