// =============================================================================
// TalkToMe speech engine
// =============================================================================
// This file handles dialogue text, RollTable draws, token resolution, bubbles,
// socket broadcasts, optional chat posts, and optional camera movement.

import { TTM_ID, TTM_TITLE, TTM_SOCKET_ACTIONS } from "./constants.js";
import { ttmChosenToken, ttmNotice } from "./helpers.js";

// Convert Foundry/RollTable HTML into plain readable speech text.
function ttmStripHtml(value) {
  const div = document.createElement("div");
  div.innerHTML = String(value ?? "");
  return (div.textContent || div.innerText || "").trim();
}

// Find a RollTable using id, name, or the saved default setting.
export function getTable({ tableId = null, tableName = null } = {}) {
  if (tableId) {
    const table = game.tables.get(tableId);
    if (table) return table;
  }

  if (tableName) {
    const lower = tableName.toLowerCase();
    const table = game.tables.find(t => t.name.toLowerCase() === lower);
    if (table) return table;
  }

  const saved = game.settings.get(TTM_ID, "defaultTable");
  return saved ? game.tables.get(saved) ?? null : null;
}

// Draw a single result from a RollTable and convert it into speech text.
export async function rollTable(table) {
  if (!table) return null;

  let draw;

  try {
    draw = await table.draw({ displayChat: false });
  } catch (err) {
    console.error(`${TTM_TITLE} RollTable draw failed:`, err);
    ttmNotice("error", "TalkToMe failed to draw from the RollTable.");
    return null;
  }

  const result = draw?.results?.[0];
  if (!result) return null;

  let text = "";

  if (typeof result.getChatText === "function") {
    text = await result.getChatText();
  } else {
    text = result.text
      ?? result.name
      ?? result.description
      ?? result.document?.name
      ?? "";
  }

  return ttmStripHtml(text);
}

// Find a token by visible token name.
export function findTokenByName(name) {
  const lower = String(name ?? "").toLowerCase();
  if (!lower) return null;

  return canvas.tokens?.placeables?.find(t => t.name.toLowerCase() === lower) ?? null;
}

// Resolve a token from many possible inputs.
// This is deliberately flexible because macros and MATT pass different shapes.
export function resolveToken(tokenLike = null) {
  if (tokenLike?.document) return tokenLike;
  if (tokenLike?.object) return tokenLike.object;
  if (typeof tokenLike === "string") return canvas.tokens?.get(tokenLike) ?? findTokenByName(tokenLike);
  if (tokenLike?.id) return canvas.tokens?.get(tokenLike.id) ?? tokenLike.object ?? null;

  return ttmChosenToken();
}

// Get a world-space position for a token.
// This is sent over sockets so players can draw the bubble even if they cannot
// resolve the token locally.
export function getTokenWorldBubblePosition(tokenLike) {
  const tok = resolveToken(tokenLike);
  if (!tok) return null;

  return {
    x: tok.center?.x ?? tok.document.x,
    y: tok.document.y,
    tokenX: tok.document.x,
    tokenY: tok.document.y,
    tokenWidth: tok.document.width,
    tokenHeight: tok.document.height
  };
}

// Optional camera movement before speech appears.
export async function panZoomToToken(tokenLike) {
  const tok = resolveToken(tokenLike);
  if (!tok) return;

  const x = tok.center?.x ?? tok.document.x + (tok.document.width * canvas.grid.size) / 2;
  const y = tok.center?.y ?? tok.document.y + (tok.document.height * canvas.grid.size) / 2;
  const currentScale = canvas.stage?.scale?.x ?? 1;
  const targetScale = Math.max(currentScale, 1.35);

  try {
    await canvas.animatePan({ x, y, scale: targetScale, duration: 450 });
  } catch (err) {
    await canvas.animatePan({ x, y, duration: 450 });
  }
}

// Legacy fallback using Foundry's normal speech bubble system.
// This is local-only, but useful if custom bubbles are disabled.
export async function sayFoundryBubble(tokenLike, text, bubbleOptions = {}) {
  const tok = resolveToken(tokenLike);
  if (!tok) return;

  await canvas.hud.bubbles.say(tok, text, bubbleOptions);
}

// Show the TalkToMe custom bubble on this client.
export async function sayCustomBubble(tokenLike, text, speakerName = "", duration = null, bubbleId = "") {
  const tok = resolveToken(tokenLike);
  if (!tok) return;

  game.talkToMe?.bubbles?.show({
    sceneId: canvas.scene?.id,
    tokenId: tok.document.id,
    text,
    speakerName: speakerName || tok.name,
    duration,
    bubbleId,
    world: getTokenWorldBubblePosition(tok)
  });
}

// Send speech bubble data to all connected clients.
export async function broadcastSpeech(tokenLike, text, speakerName = "", duration = null, bubbleId = "") {
  const tok = resolveToken(tokenLike);
  if (!tok) return;

  game.socket.emit(`module.${TTM_ID}`, {
    action: TTM_SOCKET_ACTIONS.SPEECH,
    senderId: game.user.id,
    sceneId: canvas.scene?.id,
    tokenId: tok.document.id,
    text,
    speakerName: speakerName || tok.name,
    duration,
    bubbleId: bubbleId || `${canvas.scene?.id}.${tok.document.id}.${Date.now()}`,
    world: getTokenWorldBubblePosition(tok)
  });
}

// Optional chat message output.
export async function postToChat(tokenLike, text, npcName = "") {
  const tok = resolveToken(tokenLike);

  const speaker = tok
    ? ChatMessage.getSpeaker({ token: tok })
    : ChatMessage.getSpeaker({ alias: npcName || TTM_TITLE });

  const msgData = { speaker, content: text };

  if (!tok && npcName) msgData.speaker.alias = npcName;

  await ChatMessage.create(msgData);
}