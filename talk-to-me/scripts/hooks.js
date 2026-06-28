/* -----------------------------------------------------------------------------
     * TalkToMe Foundry hooks
     * -----------------------------------------------------------------------------
     * Adds toolbar buttons, refreshes the UI when scene/token state changes, and
     * handles fallback entry detection.
     */

    import { TTM_ID } from "./constants.js";

    export function registerHooks() {
      Hooks.on("getSceneControlButtons", controls => {
        if (!game.user?.isGM) return;

        const button = {
          name: "talk-to-me",
          title: "TalkToMe",
          icon: "fa-solid fa-comment-dots",
          order: 999,
          button: true,
          visible: true,
          onChange: () => game.talkToMe?.open()
        };

        const tokenControl = Array.isArray(controls)
          ? controls.find(c => c.name === "token" || c.name === "tokens")
          : controls.tokens ?? controls.token;

        if (tokenControl) {
          tokenControl.tools ??= Array.isArray(tokenControl.tools) ? [] : {};
          if (Array.isArray(tokenControl.tools)) {
            if (!tokenControl.tools.some(t => t.name === "talk-to-me")) tokenControl.tools.push(button);
          } else {
            tokenControl.tools["talk-to-me"] = button;
          }
        }

        const tileControl = Array.isArray(controls)
          ? controls.find(c => c.name === "tiles" || c.name === "tile")
          : controls.tiles ?? controls.tile;

        if (tileControl) {
          tileControl.tools ??= Array.isArray(tileControl.tools) ? [] : {};
          const tileButton = { ...button, title: "TalkToMe Speech Tiles" };

          if (Array.isArray(tileControl.tools)) {
            if (!tileControl.tools.some(t => t.name === "talk-to-me")) tileControl.tools.push(tileButton);
          } else {
            tileControl.tools["talk-to-me"] = tileButton;
          }
        }
      });

      Hooks.on("canvasReady", () => {
        game.talkToMe?.resetEntryHistory?.();

        if (game.talkToMe?.app?.element) {
          game.talkToMe.app.refreshManagedTileList();
          game.talkToMe.app.refreshTokenSelectors();
        }
      });

      for (const hookName of ["controlToken", "targetToken", "createToken", "deleteToken"]) {
        Hooks.on(hookName, () => {
          if (game.talkToMe?.app?.element) game.talkToMe.app.refreshTokenSelectors();
        });
      }

      Hooks.on("updateToken", async (tokenDoc, changes) => {
        if (game.talkToMe?.app?.element) game.talkToMe.app.refreshTokenSelectors();

        const moved = Object.hasOwn(changes ?? {}, "x") || Object.hasOwn(changes ?? {}, "y");
        if (moved) await game.talkToMe?.checkEntryTriggersForToken(tokenDoc);
      });
    }

    export function registerSocket() {
      game.socket.on(`module.${TTM_ID}`, async data => {
        if (data.senderId === game.user.id) return;
        if (data.sceneId && data.sceneId !== canvas.scene?.id) return;

        const tok = canvas.tokens.get(data.tokenId);
        if (!tok) return;

        await canvas.hud.bubbles.say(tok, data.text, data.bubbleOptions ?? {});
      });
    }