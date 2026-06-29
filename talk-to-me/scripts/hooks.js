import { TTM_ID, TTM_SOCKET_ACTIONS } from "./constants.js";

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
  if (controls?.tiles?.tools) controls.tiles.tools["talk-to-me"] = { ...tool, title: "TalkToMe Speech Tiles" };

  if (Array.isArray(controls)) {
    for (const name of ["tokens", "token", "tiles", "tile"]) {
      const control = controls.find(c => c.name === name);
      if (!control) continue;
      control.tools ??= [];
      if (Array.isArray(control.tools) && !control.tools.some(t => t.name === "talk-to-me")) control.tools.push(tool);
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

export function registerHooks() {
  Hooks.on("getSceneControlButtons", controls => {
    try {
      addToolbarTool(controls);
    } catch (err) {
      console.error("TalkToMe toolbar registration failed.", err);
    }
  });

  Hooks.once("ready", () => window.setTimeout(createFloatingButton, 250));
  Hooks.on("renderSceneControls", () => window.setTimeout(createFloatingButton, 100));

  Hooks.on("canvasReady", () => {
    window.setTimeout(createFloatingButton, 100);
    game.talkToMe?.resetEntryHistory?.();
    game.talkToMe?.startTriggerScanner?.();
    game.talkToMe?.startSwitchClickListeners?.();

    if (game.talkToMe?.app?.element) {
      game.talkToMe.app.refreshManagedTileList?.();
      game.talkToMe.app.refreshTokenSelectors?.();
    }

    game.talkToMe?.bubbles?.clear?.();
    game.talkToMe?.bubbles?.ensureLayer?.();
  });

  for (const hookName of ["controlToken", "targetToken", "createToken", "deleteToken"]) {
    Hooks.on(hookName, () => game.talkToMe?.app?.element && game.talkToMe.app.refreshTokenSelectors?.());
  }

  for (const hookName of ["createTile", "updateTile", "deleteTile"]) {
    Hooks.on(hookName, () => {
      if (game.talkToMe?.app?.element) game.talkToMe.app.refreshManagedTileList?.();
      game.talkToMe?.resetEntryHistory?.();
    });
  }

  Hooks.on("updateToken", async (tokenDoc, changes) => {
    if (game.talkToMe?.app?.element) game.talkToMe.app.refreshTokenSelectors?.();
    const moved = Object.hasOwn(changes ?? {}, "x") || Object.hasOwn(changes ?? {}, "y");
    if (moved) await game.talkToMe?.scanMovementTriggers?.();
    game.talkToMe?.bubbles?.updatePositions?.();
  });
}

function panClientToWorld(data) {
  if (!data?.world) return;
  const currentScale = canvas.stage?.scale?.x ?? 1;
  const targetScale = Math.max(currentScale, 1.35);
  try {
    canvas.animatePan({ x: data.world.x, y: data.world.y, scale: targetScale, duration: data.duration ?? 450 });
  } catch (err) {
    canvas.animatePan({ x: data.world.x, y: data.world.y, duration: data.duration ?? 450 });
  }
}

export function registerSocket() {
  game.socket.on(`module.${TTM_ID}`, async data => {
    if (!data?.action) return;
    if (data.sceneId && data.sceneId !== canvas.scene?.id) return;

    if (data.action === TTM_SOCKET_ACTIONS.SPEECH) {
      if (data.zoomToSpeaker) panClientToWorld(data);
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

    if (data.action === TTM_SOCKET_ACTIONS.PAN) panClientToWorld(data);
    if (data.action === TTM_SOCKET_ACTIONS.CLEAR) game.talkToMe?.bubbles?.clear?.();
  });
}
