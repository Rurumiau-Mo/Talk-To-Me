import { TTM_ID } from "./constants.js";

export function registerSettings() {
  game.settings.register(TTM_ID, "defaultTable", {
    name: "Default RollTable",
    hint: "The RollTable TalkToMe will use by default.",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(TTM_ID, "postChatByDefault", {
    name: "Post to Chat by Default",
    hint: "If enabled, TalkToMe also posts speech text to chat.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(TTM_ID, "useCustomBubbles", {
    name: "Use TalkToMe Custom Bubbles",
    hint: "If enabled, TalkToMe uses synchronized custom bubbles visible to connected clients.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(TTM_ID, "bubbleDuration", {
    name: "Bubble Duration",
    hint: "How long custom speech bubbles stay visible, in milliseconds.",
    scope: "world",
    config: true,
    type: Number,
    default: 5500
  });

  game.settings.register(TTM_ID, "defaultTileSize", {
    name: "Default Speech Tile Size",
    hint: "Width and height used for new TalkToMe speech tiles.",
    scope: "world",
    config: true,
    type: Number,
    default: 200
  });

  game.settings.register(TTM_ID, "speechTileImage", {
    name: "Speech Tile Image",
    hint: "Image path used for newly-created TalkToMe speech tiles.",
    scope: "world",
    config: true,
    type: String,
    default: "icons/svg/sound.svg"
  });

  game.settings.register(TTM_ID, "zoomToSpeakerByDefault", {
    name: "Pan/Zoom to Speaker by Default",
    hint: "When enabled, TalkToMe pans and zooms to the speaking token before showing the speech bubble.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(TTM_ID, "windowLeft", {
    name: "Window Left",
    scope: "client",
    config: false,
    type: String,
    default: "120px"
  });

  game.settings.register(TTM_ID, "windowTop", {
    name: "Window Top",
    scope: "client",
    config: false,
    type: String,
    default: "120px"
  });
}