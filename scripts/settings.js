// =============================================================================
// Settings
// =============================================================================
// Registers module and world settings.

import { TTM_ID } from "./constants.js";

// Safe setting registration
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


safeRegisterSetting("worldDataVersion", {
  name: "TalkToMe World Data Version",
  hint: "Internal schema version used for automatic TalkToMe tile migration.",
  scope: "world",
  config: false,
  type: Number,
  default: 0
});

  safeRegisterSetting("defaultTable", {
    name: "Default RollTable",
    hint: "The RollTable TalkToMe will use by default.",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });


safeRegisterSetting("useTalkToMeTileEditor", {
  name: "Use TalkToMe Editor for Tile Editing",
  hint: "When enabled, TalkToMe managed-list Edit buttons and GM double-left-clicks on TalkToMe tiles open the TalkToMe tile editor instead of Foundry's standard Tile sheet.",
  scope: "world",
  config: true,
  type: Boolean,
  default: true
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

  safeRegisterSetting("bubbleStyleMode", {
    name: "Speech Bubble Style Mode",
    scope: "world",
    config: false,
    type: String,
    default: "generated"
  });

  safeRegisterSetting("bubbleBackgroundColor", {
    name: "Speech Bubble Background",
    scope: "world",
    config: false,
    type: String,
    default: "#141414"
  });

  safeRegisterSetting("bubbleBorderColor", {
    name: "Speech Bubble Border",
    scope: "world",
    config: false,
    type: String,
    default: "#ffdc8c"
  });

  safeRegisterSetting("bubbleTextColor", {
    name: "Speech Bubble Text",
    scope: "world",
    config: false,
    type: String,
    default: "#f8f1df"
  });

  safeRegisterSetting("bubbleNameColor", {
    name: "Speech Bubble Name",
    scope: "world",
    config: false,
    type: String,
    default: "#ffd98a"
  });

  safeRegisterSetting("bubbleOpacity", {
    name: "Speech Bubble Opacity",
    scope: "world",
    config: false,
    type: Number,
    default: 0.96
  });

  safeRegisterSetting("bubbleBorderWidth", {
    name: "Speech Bubble Border Width",
    scope: "world",
    config: false,
    type: Number,
    default: 2
  });

  safeRegisterSetting("bubbleCornerRadius", {
    name: "Speech Bubble Corner Radius",
    scope: "world",
    config: false,
    type: Number,
    default: 12
  });

  safeRegisterSetting("bubbleBodyFontSize", {
    name: "Speech Bubble Body Font Size",
    scope: "world",
    config: false,
    type: Number,
    default: 15
  });

  safeRegisterSetting("bubbleNameFontSize", {
    name: "Speech Bubble Name Font Size",
    scope: "world",
    config: false,
    type: Number,
    default: 13
  });

  safeRegisterSetting("bubbleMaxWidth", {
    name: "Speech Bubble Maximum Width",
    scope: "world",
    config: false,
    type: Number,
    default: 320
  });

  safeRegisterSetting("bubblePaddingX", {
    name: "Speech Bubble Horizontal Padding",
    scope: "world",
    config: false,
    type: Number,
    default: 12
  });

  safeRegisterSetting("bubblePaddingY", {
    name: "Speech Bubble Vertical Padding",
    scope: "world",
    config: false,
    type: Number,
    default: 9
  });

  safeRegisterSetting("bubbleTailEnabled", {
    name: "Speech Bubble Tail",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  safeRegisterSetting("bubbleCustomImage", {
    name: "Custom Speech Bubble Image",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  safeRegisterSetting("bubbleCustomImageWidth", {
    name: "Custom Speech Bubble Image Width",
    scope: "world",
    config: false,
    type: Number,
    default: 360
  });

  safeRegisterSetting("bubbleCustomImageHeight", {
    name: "Custom Speech Bubble Image Height",
    scope: "world",
    config: false,
    type: Number,
    default: 180
  });

  safeRegisterSetting("bubbleTextOffsetX", {
    name: "Speech Bubble Text Offset X",
    scope: "world",
    config: false,
    type: Number,
    default: 28
  });

  safeRegisterSetting("bubbleTextOffsetY", {
    name: "Speech Bubble Text Offset Y",
    scope: "world",
    config: false,
    type: Number,
    default: 24
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
