// =============================================================================
// TalkToMe speech engine
// =============================================================================
// This file handles dialogue text, RollTable draws, token resolution, bubbles,
// socket broadcasts, optional chat posts, and optional camera movement.

import { TTM_ID, TTM_TITLE, TTM_SOCKET_ACTIONS } from "./constants.js";
import { ttmChosenToken, ttmNotice } from "./helpers.js";

// Convert Foundry/RollTable HTML into plain readable speech text.
export function ttmNormaliseSpeechText(value) {
  let source = String(value ?? "");

  // Decode common HTML entities before parsing. Some Foundry editors
  // return encoded paragraph tags rather than live HTML.
  const decoder = document.createElement("textarea");
  decoder.innerHTML = source;
  source = decoder.value;

  // Preserve paragraph and line-break separation as normal spaces.
  source = source
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n")
    .replace(/<\s*p(?:\s[^>]*)?>/gi, "");

  const div = document.createElement("div");
  div.innerHTML = source;

  let text = div.textContent || div.innerText || "";

  // Clean malformed or already-stripped paragraph markers such as
  // "/p", "<p", or "p>" that can leak from enriched table results.
  text = text
    .replace(/(?:^|\s)[<\[]?\/?p[>\]]?(?=\s|$)/gi, " ")
    .replace(/\s*\/p\s*/gi, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return text;
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

  return ttmNormaliseSpeechText(text);
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
let temporaryPanState = null;
let temporaryPanRestoreTimer = null;

function getCurrentCanvasView() {
  const pivot = canvas.stage?.pivot;
  const scale = canvas.stage?.scale?.x;

  if (
    !Number.isFinite(Number(pivot?.x))
    || !Number.isFinite(Number(pivot?.y))
    || !Number.isFinite(Number(scale))
  ) {
    return null;
  }

  return {
    x: Number(pivot.x),
    y: Number(pivot.y),
    scale: Number(scale)
  };
}

function clearTemporaryPanRestoreTimer() {
  if (!temporaryPanRestoreTimer) return;

  window.clearTimeout(temporaryPanRestoreTimer);
  temporaryPanRestoreTimer = null;
}

export async function restoreTemporarySpeakerPan() {
  clearTemporaryPanRestoreTimer();

  const originalView = temporaryPanState;
  temporaryPanState = null;

  if (!originalView || !canvas?.stage) return false;

  await canvas.animatePan({
    x: originalView.x,
    y: originalView.y,
    scale: originalView.scale,
    duration: 450
  });

  return true;
}

function scheduleTemporaryPanRestore(holdDuration = 5500) {
  clearTemporaryPanRestoreTimer();

  temporaryPanRestoreTimer = window.setTimeout(
    () => {
      restoreTemporarySpeakerPan().catch(error => {
        console.error(
          "TalkToMe failed to restore the previous canvas view.",
          error
        );
      });
    },
    Math.max(0, Number(holdDuration ?? 5500)) + 450
  );
}

export async function panToWorldTemporarily({
  x,
  y,
  duration = 450,
  holdDuration = 5500
} = {}) {
  if (
    !Number.isFinite(Number(x))
    || !Number.isFinite(Number(y))
    || !canvas?.stage
  ) {
    return false;
  }

  // Preserve the user's view from before the first speech line.
  // Later lines refresh the timer without overwriting that baseline.
  if (!temporaryPanState) {
    temporaryPanState = getCurrentCanvasView();
  }

  const currentScale = Number(
    canvas.stage?.scale?.x ?? 1
  );
  const targetScale = Math.max(currentScale, 1.35);

  await canvas.animatePan({
    x: Number(x),
    y: Number(y),
    scale: targetScale,
    duration: Math.max(0, Number(duration ?? 450))
  });

  scheduleTemporaryPanRestore(holdDuration);
  return true;
}

export async function panZoomToToken(
  tokenLike,
  holdDuration = 5500
) {
  const tok = resolveToken(tokenLike);
  if (!tok) return false;

  const x =
    tok.center?.x
    ?? tok.document.x
      + (tok.document.width * canvas.grid.size) / 2;
  const y =
    tok.center?.y
    ?? tok.document.y
      + (tok.document.height * canvas.grid.size) / 2;

  return panToWorldTemporarily({
    x,
    y,
    duration: 450,
    holdDuration
  });
}

// Legacy fallback using Foundry's normal speech bubble system.
// This is local-only, but useful if custom bubbles are disabled.
// Send a pan/zoom request to connected clients.
// Each receiving client runs canvas.animatePan() locally.
export async function broadcastPanToSpeaker(tokenLike, duration = 450) {
  const tok = resolveToken(tokenLike);
  if (!tok) return;

  game.socket.emit(`module.${TTM_ID}`, {
    action: TTM_SOCKET_ACTIONS.PAN,
    senderId: game.user.id,
    sceneId: canvas.scene?.id,
    tokenId: tok.document.id,
    world: getTokenWorldBubblePosition(tok),
    duration
  });
}

export async function sayFoundryBubble(tokenLike, text, bubbleOptions = {}) {
  const tok = resolveToken(tokenLike);
  if (!tok) return;

  await canvas.hud.bubbles.say(tok, text, bubbleOptions);
}

// Show the TalkToMe custom bubble on this client.
export async function sayCustomBubble(
  tokenLike,
  text,
  speakerName = "",
  duration = null,
  bubbleId = "",
  typingAnimation = false
) {
  const tok = resolveToken(tokenLike);
  if (!tok) return;

  game.talkToMe?.bubbles?.show({
    sceneId: canvas.scene?.id,
    tokenId: tok.document.id,
    text,
    speakerName: speakerName || tok.name,
    duration,
    bubbleId,
    world: getTokenWorldBubblePosition(tok),
    typingAnimation
  });
}

// Send speech bubble data to all connected clients.
export async function broadcastSpeech(
  tokenLike,
  text,
  speakerName = "",
  duration = null,
  bubbleId = "",
  zoomToSpeaker = false,
  panHoldDuration = null,
  typingAnimation = false
) {
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
    world: getTokenWorldBubblePosition(tok),
    zoomToSpeaker,
    panHoldDuration,
    typingAnimation
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
