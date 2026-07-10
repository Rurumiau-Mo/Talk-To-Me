const TTM_ID = "talk-to-me";
const TTM_TITLE = "TalkToMe";

function createFallbackButton() {
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
  button.addEventListener("click", () => {
    const api = game.talkToMe ?? game.modules.get(TTM_ID)?.api;
    if (api?.open) api.open();
    else ui.notifications.warn("TalkToMe is not ready.");
  });

  document.body.appendChild(button);
}

function assignApi(api) {
  game.talkToMe = api;
  game.talkToMeReady = true;

  const moduleApiTarget = game.modules.get(TTM_ID);
  if (moduleApiTarget) moduleApiTarget.api = api;
  game.talkToMeReady = true;

  const talkToMeModule = game.modules.get(TTM_ID);
  if (talkToMeModule) talkToMeModule.api = api;
  window.talkToMeOpen = () => api.open();

  const mod = game.modules.get(TTM_ID);
  if (mod) {
    try {
      mod.api = api;
    } catch (err) {
      Object.defineProperty(mod, "api", {
        value: api,
        configurable: true
      });
    }
  }
}

async function registerModuleHooksAndSettings() {
  try {
    const hooks = await import("./hooks.js");
    hooks.registerHooks?.();
  } catch (err) {
    console.error(`${TTM_TITLE} hook module failed to load.`, err);
  }

  try {
    const settings = await import("./settings.js");
    settings.registerSettings?.();
  } catch (err) {
    console.error(`${TTM_TITLE} settings module failed to load.`, err);
  }
}

async function installFullApi() {
  const apiModule = await import("./api.js");
  const api = new apiModule.TalkToMe();

  assignApi(api);

  try {
    api.initBubbles?.();
  } catch (err) {
    console.warn(`${TTM_TITLE} bubbles failed to initialise.`, err);
  }

  try {
    const hooks = await import("./hooks.js");
    hooks.registerSocket?.();
  } catch (err) {
    console.warn(`${TTM_TITLE} socket registration failed.`, err);
  }

  api.startTriggerScanner?.();
  api.startTileClickListeners?.();
  api.startCleanTeleportScanner?.();

  console.log(`${TTM_TITLE} full API ready.`, api);
}

Hooks.once("init", () => {
  registerModuleHooksAndSettings();
});

Hooks.once("ready", async () => {
  try {
    createFallbackButton();
    await installFullApi();
  } catch (err) {
    console.error(`${TTM_TITLE} failed to initialise.`, err);
    ui.notifications.error("TalkToMe failed to initialise. Check the console for details.");
  }
});

Hooks.on("canvasReady", () => {
  createFallbackButton();
});
