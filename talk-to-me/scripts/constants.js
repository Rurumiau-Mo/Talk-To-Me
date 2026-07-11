// =============================================================================
// TalkToMe constants
// =============================================================================
// This file contains the strings that are reused across the module.
// Keeping these here makes it much easier to rename the module, check optional
// dependencies, or change socket action names later.

export const TTM_ID = "talk-to-me";
export const TTM_TITLE = "TalkToMe";

export const TTM_TILE_SCHEMA_VERSION = 2;
export const TTM_WORLD_MIGRATION_VERSION = 2;

// Optional/recommended module ids.
// These are not hard requirements. TalkToMe should still work without them.
export const TTM_MATT_ID = "monks-active-tiles";
export const TTM_TAGGER_ID = "tagger";

// Socket action names.
// The socket receives a payload and checks its action before doing anything.
export const TTM_SOCKET_ACTIONS = {
  SPEECH: "speech",
  CLEAR: "clear",
  PAN: "pan",
  REQUEST_TILE_TRIGGER: "requestTileTrigger"
};
