import { TTM_ID } from "./constants.js";

function getTalkToMeApi() {
  return game.talkToMe ?? game.modules.get(TTM_ID)?.api ?? null;
}

async function waitForTalkToMeApi(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const api = getTalkToMeApi();
    if (api?.open) return api;

    await new Promise(resolve => window.setTimeout(resolve, 100));
  }

  return null;
}

export async function openTalkToMeLauncher() {
  const api = await waitForTalkToMeApi();

  if (!api?.open) {
    console.warn("TalkToMe launcher could not find API.", {
      gameTalkToMe: game.talkToMe,
      moduleApi: game.modules.get(TTM_ID)?.api
    });

    ui.notifications.warn("TalkToMe is not ready yet. Check the console for startup errors.");
    return;
  }

  api.open();
}

export function registerLauncher() {
  Hooks.on("getSceneControlButtons", controls => {
    const tilesControl = controls.find(control => control.name === "tiles")
      ?? controls.find(control => control.name === "token")
      ?? controls[0];

    if (!tilesControl) return;

    if (!tilesControl.tools) tilesControl.tools = [];

    const exists = tilesControl.tools.some(tool => tool.name === "talk-to-me");
    if (exists) return;

    tilesControl.tools.push({
      name: "talk-to-me",
      title: "Talk To Me",
      icon: "fa-solid fa-comment-dots",
      button: true,
      onChange: openTalkToMeLauncher,
      onClick: openTalkToMeLauncher
    });
  });
}
