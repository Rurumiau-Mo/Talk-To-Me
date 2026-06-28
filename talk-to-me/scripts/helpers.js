/* -----------------------------------------------------------------------------
     * TalkToMe helper functions
     * -----------------------------------------------------------------------------
     *
     * These helpers are deliberately small and dependency-light.
     * They are shared by the UI, API, speech, tile, and hook files.
     */

    import { TTM_ID } from "./constants.js";

    /**
     * Display a Foundry notification and also log it to the browser console.
     *
     * @param {"info"|"warn"|"error"} kind
     * @param {string} message
     */
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

    /**
     * True only when the current user is a GM.
     */
    export function ttmIsGM() {
      return game.user?.isGM === true;
    }

    /**
     * Check whether a Foundry module is currently active.
     */
    export function ttmModuleActive(id) {
      return game.modules.get(id)?.active === true;
    }

    /**
     * Create a DOM element with optional text and class names.
     *
     * This keeps the UI code cleaner than repeatedly writing document.createElement.
     */
    export function ttmMake(tag, text = null, cls = "") {
      const el = document.createElement(tag);

      if (cls) el.className = cls;
      if (text !== null && text !== undefined) el.innerText = text;

      return el;
    }

    /**
     * Append a child element and return the child.
     */
    export function ttmAdd(parent, child) {
      parent.appendChild(child);
      return child;
    }

    /**
     * Escape a string before using it inside innerHTML.
     *
     * Most UI text uses innerText, but managed tile cards use small HTML fragments.
     */
    export function ttmEscapeHtml(value) {
      const div = document.createElement("div");
      div.innerText = String(value ?? "");
      return div.innerHTML;
    }

    /**
     * Convert text into a simple tag-friendly slug.
     */
    export function ttmSlug(value) {
      return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "");
    }

    /**
     * Return all RollTables, sorted alphabetically for select boxes.
     */
    export function ttmTables() {
      return Array.from(game.tables ?? []).sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Return token placeables on the current scene.
     */
    export function ttmSceneTokens() {
      return canvas.tokens?.placeables ?? [];
    }

    /**
     * Return the first controlled token on the scene.
     */
    export function ttmSelectedToken() {
      return canvas.tokens?.controlled?.[0] ?? null;
    }

    /**
     * Return the first targeted token for the current user.
     */
    export function ttmTargetedToken() {
      return Array.from(game.user?.targets ?? [])[0] ?? null;
    }

    /**
     * The module's default token resolution:
     * selected token first, targeted token second.
     */
    export function ttmChosenToken() {
      return ttmSelectedToken() ?? ttmTargetedToken() ?? null;
    }

    /**
     * Find a token placeable by token document id.
     */
    export function ttmTokenById(id) {
      if (!id) return null;
      return canvas.tokens?.get(id) ?? null;
    }

    /**
     * Activate the Token layer so the GM can select tokens normally.
     */
    export function ttmSelectTokenLayer() {
      canvas.tokens?.activate?.();
    }

    /**
     * Choose a reasonable position for a newly-created speech tile.
     *
     * The tile is created near the centre of the visible canvas and snapped to grid.
     */
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

    /**
     * Read the stored client-side window position.
     */
    export function ttmWindowPosition() {
      return {
        left: game.settings.get(TTM_ID, "windowLeft") || "120px",
        top: game.settings.get(TTM_ID, "windowTop") || "120px"
      };
    }