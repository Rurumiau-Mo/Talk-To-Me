(function () {
  const MODULE_ID = "talk-to-me";

  function getApi() {
    return game.talkToMe || game.modules.get(MODULE_ID)?.api;
  }

  function openTalkToMe() {
    const api = getApi();

    if (api && typeof api.open === "function") {
      api.open();
      return;
    }

    // Give the ES module ready hook a final chance.
    setTimeout(() => {
      const retry = getApi();
      if (retry && typeof retry.open === "function") {
        retry.open();
        return;
      }

      ui.notifications?.warn?.("TalkToMe launcher loaded, but no API is ready. Check the console for the first TalkToMe import error.");
      console.warn("TalkToMe launcher could not find API.", {
        gameTalkToMe: game.talkToMe,
        moduleApi: game.modules.get(MODULE_ID)?.api,
        module: game.modules.get(MODULE_ID)
      });
    }, 1000);
  }

  function createFloatingLauncher() {
    if (!game.user?.isGM) return;
    if (document.getElementById("talk-to-me-floating-launcher")) return;

    const button = document.createElement("button");
    button.id = "talk-to-me-floating-launcher";
    button.type = "button";
    button.title = "Open TalkToMe";
    button.innerHTML = "💬";
    button.style.position = "fixed";
    button.style.left = "12px";
    button.style.bottom = "84px";
    button.style.zIndex = "10000";
    button.style.width = "42px";
    button.style.height = "42px";
    button.style.fontSize = "20px";
    button.addEventListener("click", openTalkToMe);
    document.body.appendChild(button);
  }

  function addTool(controls) {
    if (!game.user?.isGM) return;

    const tool = {
      name: "talk-to-me",
      title: "TalkToMe",
      label: "TalkToMe",
      icon: "fa-solid fa-comment-dots",
      order: 999,
      button: true,
      visible: true,
      onChange: openTalkToMe
    };

    if (controls?.tokens?.tools) controls.tokens.tools["talk-to-me"] = tool;
    if (controls?.tiles?.tools) controls.tiles.tools["talk-to-me"] = { ...tool, title: "TalkToMe Speech Tiles" };

    if (Array.isArray(controls)) {
      for (const controlName of ["token", "tokens", "tile", "tiles"]) {
        const control = controls.find(c => c.name === controlName);
        if (!control) continue;
        control.tools ??= [];
        if (Array.isArray(control.tools) && !control.tools.some(t => t.name === "talk-to-me")) control.tools.push(tool);
      }
    }
  }

  Hooks.on("getSceneControlButtons", addTool);
  Hooks.once("ready", () => {
    window.talkToMeOpen = openTalkToMe;
    setTimeout(createFloatingLauncher, 250);
  });
  Hooks.on("canvasReady", () => setTimeout(createFloatingLauncher, 100));
  Hooks.on("renderSceneControls", () => setTimeout(createFloatingLauncher, 100));
})();
