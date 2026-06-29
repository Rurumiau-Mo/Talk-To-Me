// =============================================================================
// TalkToMe macro generation
// =============================================================================
// Generates safe copyable scripts for hotbar macros and MATT Execute Script actions.

export function generateTileTriggerScript({ postChat = false, zoomToSpeaker = false } = {}) {
  return [
    'const api = game.talkToMe ?? game.modules.get("talk-to-me")?.api;',
    'if (!api?.triggerSpeechTile) return ui.notifications.warn("TalkToMe is not ready.");',
    '',
    'const arg0 = args?.[0] ?? {};',
    'const ttmTile = arg0.tile ?? tile ?? canvas.tiles?.controlled?.[0] ?? null;',
    'const ttmTileId = ttmTile?.document?.id ?? ttmTile?.id ?? arg0.tileId ?? null;',
    'const triggeringToken = arg0.token ?? arg0.tokens?.[0] ?? arg0.triggeringToken ?? token ?? null;',
    '',
    'if (!ttmTileId) return ui.notifications.warn("TalkToMe could not find the triggering tile.");',
    'await api.triggerSpeechTile(ttmTileId, triggeringToken, {',
    `  postChat: ${postChat ? "true" : "false"},`,
    `  zoomToSpeaker: ${zoomToSpeaker ? "true" : "false"}`,
    '});'
  ].join("\n");
}

export function generateScript({
  source = "chosen",
  tableId = "",
  tableName = "",
  npcName = "",
  tokenRef = "",
  text = "",
  postChat = false,
  zoomToSpeaker = false
} = {}) {
  const table = tableId ? game.tables.get(tableId) : null;
  const safeTableId = JSON.stringify(table?.id ?? tableId ?? "");
  const safeTableName = JSON.stringify(table?.name ?? tableName ?? "");
  const safeNpcName = JSON.stringify(npcName ?? "");
  const safeTokenRef = JSON.stringify(tokenRef ?? "");
  const safeText = JSON.stringify(text ?? "");

  let tokenLines = "";

  if (source === "matt") {
    tokenLines = [
      "const arg0 = args?.[0] ?? {};",
      "const ttmToken = arg0.token ?? arg0.tokens?.[0] ?? arg0.triggeringToken ?? token ?? null;"
    ].join("\n");
  } else if (source === "chosen") {
    tokenLines = [
      "const selected = canvas.tokens.controlled?.[0] ?? null;",
      "const targeted = Array.from(game.user.targets ?? [])[0] ?? null;",
      "const ttmToken = selected ?? targeted ?? null;"
    ].join("\n");
  } else if (source === "name") {
    tokenLines = `const ttmToken = canvas.tokens.placeables.find(t => t.name === ${safeTokenRef}) ?? null;`;
  } else if (source === "id") {
    tokenLines = `const ttmToken = canvas.tokens.get(${safeTokenRef}) ?? null;`;
  } else {
    tokenLines = "const ttmToken = null;";
  }

  return [
    'const api = game.talkToMe ?? game.modules.get("talk-to-me")?.api;',
    'if (!api?.say) return ui.notifications.warn("TalkToMe is not ready.");',
    '',
    tokenLines,
    '',
    'await api.say({',
    '  token: ttmToken,',
    `  tableId: ${safeTableId},`,
    `  tableName: ${safeTableName},`,
    `  text: ${safeText},`,
    `  npcName: ${safeNpcName},`,
    `  postChat: ${postChat ? "true" : "false"},`,
    `  zoomToSpeaker: ${zoomToSpeaker ? "true" : "false"}`,
    '});'
  ].join("\n");
}

export function generateOpenMacro() {
  return [
    'const api = game.talkToMe ?? game.modules.get("talk-to-me")?.api;',
    'if (!api?.open) {',
    '  ui.notifications.error("TalkToMe is not ready. Make sure the module is enabled, then refresh Foundry.");',
    '  console.error("TalkToMe API missing.", {',
    '    gameTalkToMe: game.talkToMe,',
    '    module: game.modules.get("talk-to-me"),',
    '    moduleApi: game.modules.get("talk-to-me")?.api',
    '  });',
    '  return;',
    '}',
    'api.open();'
  ].join("\n");
}


export function generateMattPresetScript({ trigger = "manual", postChat = false, zoomToSpeaker = false } = {}) {
  return [
    'const api = game.talkToMe ?? game.modules.get("talk-to-me")?.api;',
    'if (!api?.triggerSpeechTileByCategory) return ui.notifications.warn("TalkToMe is not ready.");',
    '',
    'const arg0 = args?.[0] ?? {};',
    'const ttmTile = arg0.tile ?? tile ?? canvas.tiles?.controlled?.[0] ?? null;',
    'const ttmTileId = ttmTile?.document?.id ?? ttmTile?.id ?? arg0.tileId ?? null;',
    'const triggeringToken = arg0.token ?? arg0.tokens?.[0] ?? arg0.triggeringToken ?? token ?? null;',
    '',
    'if (!ttmTileId) return ui.notifications.warn("TalkToMe could not find the triggering tile.");',
    `await api.triggerSpeechTileByCategory(ttmTileId, ${JSON.stringify(trigger)}, triggeringToken, {`,
    `  postChat: ${postChat ? "true" : "false"},`,
    `  zoomToSpeaker: ${zoomToSpeaker ? "true" : "false"}`,
    '});'
  ].join("\\n");
}
