/* -----------------------------------------------------------------------------
     * TalkToMe public API
     * -----------------------------------------------------------------------------
     * This class is exposed as game.talkToMe and as the module API.
     */

    import { TTM_ID, TTM_MATT_ID, TTM_TAGGER_ID, TTM_TITLE } from "./constants.js";
    import { TalkToMeApp } from "./app.js";
    import { ttmIsGM, ttmModuleActive, ttmNotice } from "./helpers.js";
    import {
      broadcastBubble,
      getTable,
      panZoomToToken,
      postToChat,
      resolveToken,
      rollTable,
      sayBubble
    } from "./speech.js";
    import { generateOpenMacro, generateScript } from "./macros.js";
    import {
      createSpeechTile,
      getManagedSpeechTiles,
      tileContainsToken,
      triggerSpeechTile
    } from "./tiles.js";

    export class TalkToMe {
      constructor() {
        this.app = new TalkToMeApp(this);
        this.entryState = new Map();
        this.entryCooldown = new Map();
      }

      open() {
        this.app.open();
      }

      close() {
        this.app.close();
      }

      get mattActive() {
        return ttmModuleActive(TTM_MATT_ID);
      }

      get taggerActive() {
        return ttmModuleActive(TTM_TAGGER_ID);
      }

      getTable(args) {
        return getTable(args);
      }

      rollTable(table) {
        return rollTable(table);
      }

      resolveToken(tokenLike) {
        return resolveToken(tokenLike);
      }

      generateScript(args) {
        return generateScript(args);
      }

      generateOpenMacro() {
        return generateOpenMacro();
      }

      getManagedSpeechTiles() {
        return getManagedSpeechTiles();
      }

      createSpeechTile(args) {
        return createSpeechTile(args);
      }

      triggerSpeechTile(tileId, tokenLike = null, overrides = {}) {
        return triggerSpeechTile(this, tileId, tokenLike, overrides);
      }

      async say({
        token = null,
        tableId = null,
        tableName = null,
        text = "",
        npcName = "",
        postChat = null,
        broadcast = true,
        zoomToSpeaker = null,
        bubbleOptions = {}
      } = {}) {
        const resolvedToken = this.resolveToken(token);
        const table = this.getTable({ tableId, tableName });

        let finalText = String(text ?? "").trim();

        if (!finalText) {
          if (!table) {
            ttmNotice("warn", "TalkToMe: choose a RollTable or enter custom speech.");
            return null;
          }

          finalText = await this.rollTable(table);
        }

        if (!finalText) {
          ttmNotice("warn", "TalkToMe: no speech text was produced.");
          return null;
        }

        const shouldZoom = zoomToSpeaker ?? game.settings.get(TTM_ID, "zoomToSpeakerByDefault");
        if (resolvedToken && shouldZoom) await panZoomToToken(resolvedToken);

        if (resolvedToken) await sayBubble(resolvedToken, finalText, bubbleOptions);

        if (!resolvedToken && !npcName) {
          ttmNotice("warn", "TalkToMe: select/target a token or provide a custom NPC name.");
          return null;
        }

        if (broadcast && resolvedToken) await broadcastBubble(resolvedToken, finalText, bubbleOptions);

        const shouldPostChat = postChat ?? game.settings.get(TTM_ID, "postChatByDefault");
        if (shouldPostChat) await postToChat(resolvedToken, finalText, npcName);

        return finalText;
      }

      async checkEntryTriggersForToken(tokenDoc) {
        if (!ttmIsGM()) return;
        if (!canvas.scene || !tokenDoc) return;

        const tokenId = tokenDoc.id ?? tokenDoc._id;
        if (!tokenId) return;

        for (const tileDoc of this.getManagedSpeechTiles()) {
          const flags = tileDoc.getFlag(TTM_ID, "speech");
          if (!flags?.managed || flags.trigger !== "enter") continue;

          const stateKey = `${canvas.scene.id}.${tileDoc.id}.${tokenId}`;
          const inside = tileContainsToken(tileDoc, tokenDoc);
          const wasInside = this.entryState.get(stateKey) === true;

          this.entryState.set(stateKey, inside);

          if (!inside || wasInside) continue;

          const now = Date.now();
          const last = this.entryCooldown.get(stateKey) ?? 0;
          if (now - last < 750) continue;

          this.entryCooldown.set(stateKey, now);
          await this.triggerSpeechTile(tileDoc.id, tokenDoc.object ?? canvas.tokens.get(tokenId));
        }
      }

      resetEntryHistory() {
        this.entryState.clear();
        this.entryCooldown.clear();
      }
    }