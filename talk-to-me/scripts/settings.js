import { TTM_ID } from "./constants.js";

function safeRegisterSetting(key, data) {
  try {
    if (game.settings.settings?.has?.(`${TTM_ID}.${key}`)) return;
    game.settings.register(TTM_ID, key, data);
  } catch (err) {
    console.warn(`TalkToMe setting registration skipped: ${key}`, err);
  }
}

function safeRegisterMenu(key, data) {
  try {
    if (game.settings.menus?.has?.(`${TTM_ID}.${key}`)) return;
    game.settings.registerMenu(TTM_ID, key, data);
  } catch (err) {
    console.warn(`TalkToMe menu registration skipped: ${key}`, err);
  }
}



export function registerSettings() {

  safeRegisterSetting("defaultTable", {
    name: "Default RollTable",
    hint: "The RollTable TalkToMe will use by default.",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  safeRegisterSetting("postChatByDefault", {
    name: "Post to Chat by Default",
    hint: "If enabled, TalkToMe also posts speech text to chat.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  safeRegisterSetting("useCustomBubbles", {
    name: "Use TalkToMe Custom Bubbles",
    hint: "If enabled, TalkToMe uses synchronized custom bubbles visible to connected clients.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  safeRegisterSetting("bubbleDuration", {
    name: "Bubble Duration",
    hint: "How long custom speech bubbles stay visible, in milliseconds.",
    scope: "world",
    config: true,
    type: Number,
    default: 5500
  });

  safeRegisterSetting("defaultTileSize", {
    name: "Default Speech Tile Size",
    hint: "Width and height used for new TalkToMe speech tiles.",
    scope: "world",
    config: true,
    type: Number,
    default: 200
  });

  safeRegisterSetting("speechTileImage", {
    name: "Speech Tile Image",
    hint: "Image path used for newly-created TalkToMe speech tiles.",
    scope: "world",
    config: true,
    type: String,
    default: "icons/svg/sound.svg"
  });

  safeRegisterSetting("zoomToSpeakerByDefault", {
    name: "Pan/Zoom to Speaker by Default",
    hint: "When enabled, TalkToMe pans and zooms to the speaking token before showing the speech bubble.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

safeRegisterSetting("triggerScanInterval", {
  name: "Trigger Scan Interval",
  hint: "How often TalkToMe checks speech trigger tiles, in milliseconds.",
  scope: "world",
  config: true,
  type: Number,
  default: 200
});

safeRegisterSetting("triggerCooldown", {
  name: "Trigger Cooldown",
  hint: "Minimum time in milliseconds before the same token can trigger the same speech tile again.",
  scope: "world",
  config: true,
  type: Number,
  default: 1000
});

  safeRegisterSetting("windowLeft", {
    name: "Window Left",
    scope: "client",
    config: false,
    type: String,
    default: "120px"
  });

  safeRegisterSetting("windowTop", {
    name: "Window Top",
    scope: "client",
    config: false,
    type: String,
    default: "120px"
  });
}
