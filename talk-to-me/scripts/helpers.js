// =============================================================================
// TalkToMe helper functions
// =============================================================================
// These functions are intentionally small and generic.
// They are shared by the UI, speech engine, tile manager, and hooks.

import { TTM_ID } from "./constants.js";

// Send a message to the Foundry notification UI.
// We also log to the console so errors are easier to diagnose.
export function ttmNotice(kind, message) {
  console.log(`TalkToMe ${kind}: ${message}`);

  try {
    const notices = ui?.notifications;
    const fn = notices?.[kind];

    if (typeof fn === "function") fn.call(notices, message);
  } catch (err) {
    console.log("TalkToMe notification failed:", err);
  }
}

// TalkToMe is designed as a GM-facing tool.
// This helper keeps GM checks consistent across the codebase.
export function ttmIsGM() {
  return game.user?.isGM === true;
}

// Check whether another Foundry module is currently active.
export function ttmModuleActive(id) {
  return game.modules.get(id)?.active === true;
}

// Create a DOM element with optional text and class names.
// This keeps the UI code readable while avoiding external templates for now.
export function ttmMake(tag, text = null, cls = "") {
  const el = document.createElement(tag);

  if (cls) el.className = cls;
  if (text !== null && text !== undefined) el.innerText = text;

  return el;
}

// Append a child and return it.
// This is mostly used to make UI construction less noisy.
export function ttmAdd(parent, child) {
  parent.appendChild(child);
  return child;
}

// Escape text before inserting it into innerHTML.
// Most UI fields use innerText, but tile cards use small HTML snippets.
export function ttmEscapeHtml(value) {
  const div = document.createElement("div");
  div.innerText = String(value ?? "");
  return div.innerHTML;
}

// Convert a name into a simple slug for Tagger tags.
export function ttmSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

// Return RollTables sorted alphabetically for UI dropdowns.
export function ttmTables() {
  return Array.from(game.tables ?? []).sort((a, b) => a.name.localeCompare(b.name));
}

// Return all token placeables currently drawn on the canvas.
export function ttmSceneTokens() {
  return canvas.tokens?.placeables ?? [];
}

// Return the first selected token.
export function ttmSelectedToken() {
  return canvas.tokens?.controlled?.[0] ?? null;
}

// Return the first targeted token.
export function ttmTargetedToken() {
  return Array.from(game.user?.targets ?? [])[0] ?? null;
}

// Main fallback token choice.
// TalkToMe prefers a selected token, then a targeted token.
export function ttmChosenToken() {
  return ttmSelectedToken() ?? ttmTargetedToken() ?? null;
}

// Find a token by TokenDocument id.
export function ttmTokenById(id) {
  if (!id) return null;
  return canvas.tokens?.get(id) ?? null;
}

// Switch the canvas to the Token layer.
// This helps GMs who are stuck on the Tiles layer and cannot select tokens.
export function ttmSelectTokenLayer() {
  canvas.tokens?.activate?.();
}

// Pick a starting position for newly-created speech tiles.
// We use the middle of the screen and snap it to the grid.
export function ttmCurrentPlacementPosition() {
  const gridSize = canvas.scene?.grid?.size ?? canvas.grid?.size ?? 100;

  try {
    const centre = canvas.stage.toLocal({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    });

    return {
      x: Math.round(centre.x / gridSize) * gridSize,
      y: Math.round(centre.y / gridSize) * gridSize
    };
  } catch (err) {
    return { x: 0, y: 0 };
  }
}

// Retrieve the last saved TalkToMe window position for this client.
export function ttmWindowPosition() {
  return {
    left: game.settings.get(TTM_ID, "windowLeft") || "120px",
    top: game.settings.get(TTM_ID, "windowTop") || "120px"
  };
}
