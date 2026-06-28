/* -----------------------------------------------------------------------------
     * TalkToMe speech engine
     * -----------------------------------------------------------------------------
     *
     * This file handles:
     *   - RollTable lookup/drawing
     *   - Token resolution
     *   - Speech bubbles
     *   - Optional chat posting
     *   - Optional camera pan/zoom
     *   - Socket broadcasting
     */

    import { TTM_ID, TTM_TITLE } from "./constants.js";
    import { ttmChosenToken, ttmNotice } from "./helpers.js";

    /**
     * Find a RollTable by id, by name, or by the saved default setting.
     */
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

    /**
     * Draw one result from a RollTable and return text suitable for a speech bubble.
     */
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

      // Newer Foundry versions expose rich chat text through getChatText.
      if (typeof result.getChatText === "function") return await result.getChatText();

      // Fallbacks for different RollTable result types.
      return result.text
        ?? result.name
        ?? result.description
        ?? result.document?.name
        ?? null;
    }

    /**
     * Find a token by exact displayed name, case-insensitive.
     */
    export function findTokenByName(name) {
      const lower = String(name ?? "").toLowerCase();
      if (!lower) return null;

      return canvas.tokens?.placeables?.find(t => t.name.toLowerCase() === lower) ?? null;
    }

    /**
     * Resolve many possible token inputs into a Token placeable.
     *
     * Accepts:
     *   - Token placeable
     *   - TokenDocument object wrapper
     *   - token id string
     *   - token name string
     *   - object with id
     *   - null, which falls back to selected/targeted token
     */
    export function resolveToken(tokenLike = null) {
      if (tokenLike?.document) return tokenLike;
      if (tokenLike?.object) return tokenLike.object;
      if (typeof tokenLike === "string") return canvas.tokens?.get(tokenLike) ?? findTokenByName(tokenLike);
      if (tokenLike?.id) return canvas.tokens?.get(tokenLike.id) ?? tokenLike.object ?? null;

      return ttmChosenToken();
    }

    /**
     * Move the camera to a token and zoom in slightly.
     */
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
        // Some Foundry builds may reject scale; panning alone is still useful.
        await canvas.animatePan({ x, y, duration: 450 });
      }
    }

    /**
     * Display a speech bubble above a token.
     */
    export async function sayBubble(tokenLike, text, bubbleOptions = {}) {
      const tok = resolveToken(tokenLike);
      if (!tok) return;

      await canvas.hud.bubbles.say(tok, text, bubbleOptions);
    }

    /**
     * Broadcast the speech bubble to other connected clients.
     *
     * The local user already sees their own bubble, so the receiver ignores the sender.
     */
    export async function broadcastBubble(tokenLike, text, bubbleOptions = {}) {
      const tok = resolveToken(tokenLike);
      if (!tok) return;

      game.socket.emit(`module.${TTM_ID}`, {
        senderId: game.user.id,
        sceneId: canvas.scene?.id,
        tokenId: tok.document.id,
        text,
        bubbleOptions
      });
    }

    /**
     * Post speech to Foundry chat.
     */
    export async function postToChat(tokenLike, text, npcName = "") {
      const tok = resolveToken(tokenLike);

      const speaker = tok
        ? ChatMessage.getSpeaker({ token: tok })
        : ChatMessage.getSpeaker({ alias: npcName || TTM_TITLE });

      const msgData = {
        speaker,
        content: text
      };

      if (!tok && npcName) msgData.speaker.alias = npcName;

      await ChatMessage.create(msgData);
    }