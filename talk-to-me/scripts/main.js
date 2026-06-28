// =============================================================================
// TalkToMe entry point
// =============================================================================
// Registers settings/hooks at init, then exposes the API at ready.

import { TTM_ID, TTM_TITLE } from "./constants.js";
import { TalkToMe } from "./api.js";
import { registerHooks, registerSocket } from "./hooks.js";
import { registerSettings } from "./settings.js";

Hooks.once("init", () => {
  registerSettings();
  registerHooks();
});

Hooks.once("ready", () => {
  const api = new TalkToMe();

  game.talkToMe = api;

  const mod = game.modules.get(TTM_ID);
  if (mod) {
    try {
      mod.api = api;
    } catch (err) {
      Object.defineProperty(mod, "api", {
        value: api,
        configurable: true
      });
    }
  }

  api.initBubbles();
  registerSocket();

  console.log(`${TTM_TITLE} ready.`, api);
});