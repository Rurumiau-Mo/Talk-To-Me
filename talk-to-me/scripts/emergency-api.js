const TTM_ID_EMERGENCY = "talk-to-me";
const TTM_TITLE_EMERGENCY = "TalkToMe";

export class TalkToMeEmergencyApp {
  constructor() {
    this.element = null;
  }

  open() {
    this.close();

    const root = document.createElement("section");
    root.id = "talk-to-me-window";
    root.className = "ttm-app window-app";

    root.style.position = "fixed";
    root.style.left = "120px";
    root.style.top = "120px";
    root.style.zIndex = "10001";
    root.style.width = "420px";
    root.style.background = "#1f1f1f";
    root.style.color = "#f0f0e0";
    root.style.border = "1px solid #000";
    root.style.borderRadius = "6px";
    root.style.boxShadow = "0 0 18px #000";

    root.innerHTML = `
      <header style="padding:8px;background:#111;display:flex;gap:8px;align-items:center;">
        <h4 style="margin:0;flex:1;">${TTM_TITLE_EMERGENCY}</h4>
        <button type="button" data-action="close">×</button>
      </header>
      <div style="padding:10px;">
        <p><strong>TalkToMe emergency launcher opened.</strong></p>
        <p>The launcher and emergency API are working.</p>
        <p>The full API failed to initialise. Please copy the first red TalkToMe error from the browser console.</p>
      </div>
    `;

    root.querySelector('[data-action="close"]')?.addEventListener("click", () => this.close());

    document.body.appendChild(root);
    this.element = root;
  }

  close() {
    document.getElementById("talk-to-me-window")?.remove();
    this.element = null;
  }
}

export class TalkToMeEmergencyAPI {
  constructor() {
    this.app = new TalkToMeEmergencyApp();
  }

  open() {
    this.app.open();
  }

  close() {
    this.app.close();
  }
}

export function installEmergencyApi() {
  const api = new TalkToMeEmergencyAPI();

  game.talkToMe = api;
  window.talkToMeOpen = () => api.open();

  const mod = game.modules.get(TTM_ID_EMERGENCY);
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

  console.warn(`${TTM_TITLE_EMERGENCY} emergency API installed.`);
  return api;
}
