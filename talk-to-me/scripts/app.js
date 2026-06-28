// =============================================================================
// TalkToMe UI window
// =============================================================================
// Builds the draggable GM interface, including Speech, Trigger Tiles, and Macros.

import { TTM_ID, TTM_MATT_ID, TTM_TAGGER_ID, TTM_TITLE } from "./constants.js";

import {
  ttmAdd,
  ttmChosenToken,
  ttmEscapeHtml,
  ttmIsGM,
  ttmMake,
  ttmModuleActive,
  ttmNotice,
  ttmSceneTokens,
  ttmSelectTokenLayer,
  ttmTables,
  ttmTokenById,
  ttmWindowPosition
} from "./helpers.js";

export class TalkToMeApp {
  constructor(api) {
    this.api = api;
    this.element = null;
    this.activeTab = "speech";
    this.drag = { active: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 };

    this.boundMouseMove = event => this.doDrag(event);
    this.boundMouseUp = () => this.endDrag();
  }

  open() {
    if (!ttmIsGM()) {
      ttmNotice("warn", "TalkToMe is a GM tool.");
      return;
    }

    this.close();

    const root = ttmMake("section", null, "ttm-app window-app");
    root.id = "talk-to-me-window";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", TTM_TITLE);

    const pos = ttmWindowPosition();
    root.style.left = pos.left;
    root.style.top = pos.top;

    ttmAdd(root, this.createHeader());
    ttmAdd(root, this.createBody());

    document.body.appendChild(root);
    this.element = root;

    document.addEventListener("mousemove", this.boundMouseMove);
    document.addEventListener("mouseup", this.boundMouseUp);

    this.refreshManagedTileList();
    this.refreshStatuses();
    this.refreshTokenSelectors();

    ttmNotice("info", "TalkToMe opened.");
  }

  close() {
    document.removeEventListener("mousemove", this.boundMouseMove);
    document.removeEventListener("mouseup", this.boundMouseUp);

    const old = document.getElementById("talk-to-me-window");
    if (old) old.remove();

    this.element = null;
  }

  createHeader() {
    const header = ttmMake("header", null, "ttm-header window-header flexrow");
    const title = ttmMake("h4", TTM_TITLE, "ttm-title window-title");
    const subtitle = ttmMake("span", "GM speech tiles", "ttm-subtitle");
    const close = ttmMake("button", "×", "ttm-header-button");

    close.type = "button";
    close.title = "Close";
    close.addEventListener("click", () => this.close());

    header.addEventListener("mousedown", event => {
      if (event.target === close) return;
      this.startDrag(event);
    });

    ttmAdd(header, title);
    ttmAdd(header, subtitle);
    ttmAdd(header, close);

    return header;
  }

  createBody() {
    const body = ttmMake("div", null, "ttm-body window-content");

    const status = ttmMake("div", null, "ttm-status-row");
    status.innerHTML = `
      <span data-ttm-status="matt"></span>
      <span data-ttm-status="tagger"></span>
    `;
    ttmAdd(body, status);

    const nav = ttmMake("nav", null, "ttm-tabs sheet-tabs tabs");

    for (const [id, label] of [["speech", "Speech"], ["tiles", "Trigger Tiles"], ["macros", "Macros"]]) {
      const button = ttmMake("button", label, `ttm-tab ${id === this.activeTab ? "active" : ""}`);
      button.type = "button";
      button.dataset.tab = id;
      button.addEventListener("click", () => this.switchTab(id));
      ttmAdd(nav, button);
    }

    ttmAdd(body, nav);

    const panels = ttmMake("div", null, "ttm-panels");
    ttmAdd(panels, this.createSpeechPanel());
    ttmAdd(panels, this.createTilesPanel());
    ttmAdd(panels, this.createMacrosPanel());
    ttmAdd(body, panels);

    return body;
  }

  switchTab(id) {
    this.activeTab = id;

    for (const button of this.element.querySelectorAll(".ttm-tab")) {
      button.classList.toggle("active", button.dataset.tab === id);
    }

    for (const panel of this.element.querySelectorAll(".ttm-panel")) {
      panel.hidden = panel.dataset.panel !== id;
    }

    if (id === "tiles") this.refreshManagedTileList();
  }

  createField(labelText, input) {
    const group = ttmMake("div", null, "form-group");
    ttmAdd(group, ttmMake("label", labelText));
    ttmAdd(group, input);
    return group;
  }

  createHint(text) {
    return ttmMake("p", text, "notes ttm-hint");
  }

  createTableSelect(id) {
    const select = ttmMake("select");
    select.id = id;

    const saved = game.settings.get(TTM_ID, "defaultTable");
    const blank = ttmMake("option", "— Choose a RollTable —");
    blank.value = "";
    ttmAdd(select, blank);

    for (const table of ttmTables()) {
      const opt = ttmMake("option", table.name);
      opt.value = table.id;
      if (table.id === saved) opt.selected = true;
      ttmAdd(select, opt);
    }

    return select;
  }

  createTokenSelect(id) {
    const select = ttmMake("select");
    select.id = id;

    const auto = ttmMake("option", "— Selected or targeted token —");
    auto.value = "";
    ttmAdd(select, auto);

    for (const tok of ttmSceneTokens()) {
      const opt = ttmMake("option", tok.name);
      opt.value = tok.document.id;
      ttmAdd(select, opt);
    }

    return select;
  }

  createCheckbox(id, text, checked = false) {
    const input = ttmMake("input");
    input.id = id;
    input.type = "checkbox";
    input.checked = checked;

    const label = ttmMake("label", null, "checkbox");
    ttmAdd(label, input);
    ttmAdd(label, ttmMake("span", ` ${text}`));

    return { input, label };
  }

  refreshTokenSelectors() {
    if (!this.element) return;

    for (const select of this.element.querySelectorAll("select[data-ttm-token-select='true']")) {
      const oldValue = select.value;
      select.innerHTML = "";

      const auto = ttmMake("option", "— Selected or targeted token —");
      auto.value = "";
      ttmAdd(select, auto);

      for (const tok of ttmSceneTokens()) {
        const opt = ttmMake("option", tok.name);
        opt.value = tok.document.id;
        if (oldValue && oldValue === tok.document.id) opt.selected = true;
        ttmAdd(select, opt);
      }
    }

    this.refreshTokenCards();
  }

  refreshTokenCards() {
    if (!this.element) return;

    for (const card of this.element.querySelectorAll("[data-ttm-token-card='true']")) {
      const selectId = card.dataset.selectId;
      const selectValue = selectId ? this.element.querySelector(`#${selectId}`)?.value : "";
      const tok = selectValue ? ttmTokenById(selectValue) : ttmChosenToken();
      card.innerText = tok ? `Using: ${tok.name}` : "No token selected, targeted, or picked from the scene.";
    }
  }

  createSpeechPanel() {
    const panel = ttmMake("section", null, "ttm-panel");
    panel.dataset.panel = "speech";
    panel.hidden = this.activeTab !== "speech";

    const tokenName = ttmMake("div", "", "ttm-token-card");
    tokenName.dataset.ttmTokenCard = "true";
    tokenName.dataset.selectId = "ttm-speech-token";

    const tokenSelect = this.createTokenSelect("ttm-speech-token");
    tokenSelect.dataset.ttmTokenSelect = "true";
    tokenSelect.addEventListener("change", () => this.refreshTokenCards());

    const tableSelect = this.createTableSelect("ttm-speech-table");

    const textArea = ttmMake("textarea");
    textArea.rows = 4;
    textArea.placeholder = "Optional custom speech. Leave blank to draw from the RollTable.";

    const npcName = ttmMake("input");
    npcName.type = "text";
    npcName.placeholder = "Optional NPC name for chat speaker";

    const postChat = this.createCheckbox("ttm-speech-post-chat", "Also post to chat", game.settings.get(TTM_ID, "postChatByDefault"));
    const zoomToSpeaker = this.createCheckbox("ttm-speech-zoom", "Pan/zoom to speaker", game.settings.get(TTM_ID, "zoomToSpeakerByDefault"));

    const buttons = ttmMake("div", null, "ttm-button-row");

    const refresh = ttmMake("button", "Refresh Token");
    refresh.type = "button";
    refresh.addEventListener("click", () => this.refreshTokenSelectors());

    const activateTokens = ttmMake("button", "Token Layer");
    activateTokens.type = "button";
    activateTokens.addEventListener("click", () => {
      ttmSelectTokenLayer();
      this.refreshTokenCards();
      ttmNotice("info", "Token layer activated. You can select tokens now.");
    });

    const say = ttmMake("button", "Speak Now", "ttm-primary");
    say.type = "button";
    say.addEventListener("click", async () => {
      const pickedToken = tokenSelect.value ? ttmTokenById(tokenSelect.value) : ttmChosenToken();

      await this.api.say({
        token: pickedToken,
        tableId: tableSelect.value,
        text: textArea.value.trim(),
        npcName: npcName.value.trim(),
        postChat: postChat.input.checked,
        zoomToSpeaker: zoomToSpeaker.input.checked
      });
    });

    const save = ttmMake("button", "Save Defaults");
    save.type = "button";
    save.addEventListener("click", async () => {
      await game.settings.set(TTM_ID, "defaultTable", tableSelect.value);
      await game.settings.set(TTM_ID, "postChatByDefault", postChat.input.checked);
      await game.settings.set(TTM_ID, "zoomToSpeakerByDefault", zoomToSpeaker.input.checked);
      ttmNotice("info", "TalkToMe defaults saved.");
    });

    ttmAdd(buttons, refresh);
    ttmAdd(buttons, activateTokens);
    ttmAdd(buttons, say);
    ttmAdd(buttons, save);

    ttmAdd(panel, this.createHint("Pick a token from the scene, or leave it on auto and select/target a token on the canvas."));
    ttmAdd(panel, tokenName);
    ttmAdd(panel, this.createField("Token", tokenSelect));
    ttmAdd(panel, this.createField("RollTable", tableSelect));
    ttmAdd(panel, this.createField("Custom speech", textArea));
    ttmAdd(panel, this.createField("Custom NPC name", npcName));
    ttmAdd(panel, postChat.label);
    ttmAdd(panel, zoomToSpeaker.label);
    ttmAdd(panel, buttons);

    return panel;
  }

  createTilesPanel() {
    const panel = ttmMake("section", null, "ttm-panel");
    panel.dataset.panel = "tiles";
    panel.hidden = this.activeTab !== "tiles";

    const tableSelect = this.createTableSelect("ttm-tile-table");
    const subjectToken = this.createTokenSelect("ttm-tile-subject-token");
    subjectToken.dataset.ttmTokenSelect = "true";

    const name = ttmMake("input");
    name.type = "text";
    name.placeholder = "Guard Chatter";

    const npc = ttmMake("input");
    npc.type = "text";
    npc.placeholder = "Optional override, e.g. Guard";

    const trigger = ttmMake("select");
    for (const [value, label] of [["enter", "Token enters tile"], ["manual", "Manual only"]]) {
      const opt = ttmMake("option", label);
      opt.value = value;
      ttmAdd(trigger, opt);
    }

    const mode = ttmMake("select");
    for (const [value, label] of [["table", "Roll from table"], ["custom", "Use custom text"]]) {
      const opt = ttmMake("option", label);
      opt.value = value;
      ttmAdd(mode, opt);
    }

    const text = ttmMake("textarea");
    text.rows = 3;
    text.placeholder = "Custom speech for this tile.";

    const width = ttmMake("input");
    width.type = "number";
    width.value = game.settings.get(TTM_ID, "defaultTileSize") || 200;
    width.min = 50;

    const height = ttmMake("input");
    height.type = "number";
    height.value = game.settings.get(TTM_ID, "defaultTileSize") || 200;
    height.min = 50;

    const hidden = this.createCheckbox("ttm-tile-hidden", "Hide tile from players", false);
    const postChat = this.createCheckbox("ttm-tile-post-chat", "Tile also posts to chat", game.settings.get(TTM_ID, "postChatByDefault"));
    const zoomToSpeaker = this.createCheckbox("ttm-tile-zoom", "Pan/zoom to speaking NPC", game.settings.get(TTM_ID, "zoomToSpeakerByDefault"));

    const buttons = ttmMake("div", null, "ttm-button-row");

    const create = ttmMake("button", "Place Speech Tile", "ttm-primary");
    create.type = "button";
    create.addEventListener("click", async () => {
      const doc = await this.api.createSpeechTile({
        name: name.value.trim(),
        npcName: npc.value.trim(),
        subjectTokenId: subjectToken.value,
        tableId: tableSelect.value,
        trigger: trigger.value,
        mode: mode.value,
        text: text.value.trim(),
        postChat: postChat.input.checked,
        zoomToSpeaker: zoomToSpeaker.input.checked,
        hidden: hidden.input.checked,
        width: Number(width.value || 200),
        height: Number(height.value || 200)
      });

      if (doc) this.refreshManagedTileList();
    });

    const refresh = ttmMake("button", "Refresh List");
    refresh.type = "button";
    refresh.addEventListener("click", () => this.refreshManagedTileList());

    ttmAdd(buttons, create);
    ttmAdd(buttons, refresh);

    const list = ttmMake("div", null, "ttm-managed-list");
    list.id = "ttm-managed-tiles";

    ttmAdd(panel, this.createHint("Place trigger tiles that make a chosen NPC speak from a RollTable or custom text."));
    ttmAdd(panel, this.createField("Speaking NPC token", subjectToken));
    ttmAdd(panel, this.createField("Tile name", name));
    ttmAdd(panel, this.createField("NPC chat name override", npc));
    ttmAdd(panel, this.createField("Trigger", trigger));
    ttmAdd(panel, this.createField("Speech mode", mode));
    ttmAdd(panel, this.createField("RollTable", tableSelect));
    ttmAdd(panel, this.createField("Custom speech", text));
    ttmAdd(panel, this.createField("Width", width));
    ttmAdd(panel, this.createField("Height", height));
    ttmAdd(panel, hidden.label);
    ttmAdd(panel, postChat.label);
    ttmAdd(panel, zoomToSpeaker.label);
    ttmAdd(panel, buttons);
    ttmAdd(panel, ttmMake("hr"));
    ttmAdd(panel, ttmMake("h3", "Managed Trigger Tiles"));
    ttmAdd(panel, list);

    return panel;
  }

  createMacrosPanel() {
    const panel = ttmMake("section", null, "ttm-panel");
    panel.dataset.panel = "macros";
    panel.hidden = this.activeTab !== "macros";

    const tableSelect = this.createTableSelect("ttm-macro-table");

    const source = ttmMake("select");
    for (const [value, label] of [["chosen", "Selected or targeted token"], ["matt", "MATT triggering token"], ["name", "Token by name"], ["id", "Token by ID"], ["speaker", "Custom NPC speaker only"]]) {
      const opt = ttmMake("option", label);
      opt.value = value;
      ttmAdd(source, opt);
    }

    const npc = ttmMake("input");
    npc.type = "text";
    npc.placeholder = "Guard";

    const tokenRef = ttmMake("input");
    tokenRef.type = "text";
    tokenRef.placeholder = "Token name or token id";

    const custom = ttmMake("textarea");
    custom.rows = 3;
    custom.placeholder = "Optional custom speech. Leave blank to use RollTable.";

    const postChat = this.createCheckbox("ttm-macro-post-chat", "Macro posts to chat", game.settings.get(TTM_ID, "postChatByDefault"));
    const zoomToSpeaker = this.createCheckbox("ttm-macro-zoom", "Pan/zoom to speaker", game.settings.get(TTM_ID, "zoomToSpeakerByDefault"));

    const output = ttmMake("textarea");
    output.rows = 14;
    output.spellcheck = false;

    const generate = () => {
      output.value = this.api.generateScript({
        source: source.value,
        tableId: tableSelect.value,
        npcName: npc.value.trim(),
        tokenRef: tokenRef.value.trim(),
        text: custom.value.trim(),
        postChat: postChat.input.checked,
        zoomToSpeaker: zoomToSpeaker.input.checked
      });
    };

    const buttons = ttmMake("div", null, "ttm-button-row");

    const generateBtn = ttmMake("button", "Generate");
    generateBtn.type = "button";
    generateBtn.addEventListener("click", generate);

    const openMacro = ttmMake("button", "Open Macro");
    openMacro.type = "button";
    openMacro.addEventListener("click", () => {
      output.value = this.api.generateOpenMacro();
    });

    const copy = ttmMake("button", "Copy", "ttm-primary");
    copy.type = "button";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(output.value);
        ttmNotice("info", "TalkToMe script copied.");
      } catch (err) {
        output.select();
        ttmNotice("warn", "Could not use clipboard. Select and copy the text manually.");
      }
    });

    ttmAdd(buttons, generateBtn);
    ttmAdd(buttons, openMacro);
    ttmAdd(buttons, copy);

    ttmAdd(panel, this.createHint("Generate snippets for Foundry hotbar macros or Monk's Active Tile Triggers Execute Script actions."));
    ttmAdd(panel, this.createField("RollTable", tableSelect));
    ttmAdd(panel, this.createField("Token source", source));
    ttmAdd(panel, this.createField("Custom NPC name", npc));
    ttmAdd(panel, this.createField("Token name or ID", tokenRef));
    ttmAdd(panel, this.createField("Custom speech", custom));
    ttmAdd(panel, postChat.label);
    ttmAdd(panel, zoomToSpeaker.label);
    ttmAdd(panel, buttons);
    ttmAdd(panel, this.createField("Generated script", output));

    generate();
    return panel;
  }

  refreshStatuses() {
    if (!this.element) return;

    const status = {
      matt: [TTM_MATT_ID, "Monk's Active Tile Triggers"],
      tagger: [TTM_TAGGER_ID, "Tagger"]
    };

    for (const [key, [id, label]] of Object.entries(status)) {
      const active = ttmModuleActive(id);
      const el = this.element.querySelector(`[data-ttm-status="${key}"]`);
      if (!el) continue;

      el.className = `ttm-pill ${active ? "ok" : "warn"}`;
      el.innerText = `${label}: ${active ? "active" : "missing"}`;
    }
  }

  refreshManagedTileList() {
    if (!this.element) return;

    const list = this.element.querySelector("#ttm-managed-tiles");
    if (!list) return;

    list.innerHTML = "";
    const docs = this.api.getManagedSpeechTiles();

    if (!docs.length) {
      list.innerHTML = `<p class="notes">No TalkToMe speech tiles on this scene yet.</p>`;
      return;
    }

    for (const doc of docs) {
      const card = ttmMake("article", null, "ttm-tile-card");
      const flags = doc.getFlag(TTM_ID, "speech") ?? {};
      const name = flags.name || doc.name || "Speech Tile";
      const subject = flags.subjectTokenId ? ttmTokenById(flags.subjectTokenId) : null;
      const npc = flags.npcName || subject?.name || "Triggered/selected token";

      card.innerHTML = `
        <div>
          <strong>${ttmEscapeHtml(name)}</strong>
          <p class="notes">NPC: ${ttmEscapeHtml(npc)} · Trigger: ${ttmEscapeHtml(flags.trigger ?? "manual")}</p>
        </div>
      `;

      const row = ttmMake("div", null, "ttm-card-buttons");

      const trigger = ttmMake("button", "Trigger");
      trigger.type = "button";
      trigger.addEventListener("click", () => this.api.triggerSpeechTile(doc.id));

      const select = ttmMake("button", "Select");
      select.type = "button";
      select.addEventListener("click", () => {
        canvas.tiles?.activate?.();
        const obj = canvas.tiles?.get(doc.id);
        obj?.control?.({ releaseOthers: true });
        canvas.animatePan?.({ x: doc.x + doc.width / 2, y: doc.y + doc.height / 2 });
      });

      const edit = ttmMake("button", "Edit");
      edit.type = "button";
      edit.addEventListener("click", () => canvas.tiles?.get(doc.id)?.sheet?.render(true));

      const del = ttmMake("button", "Delete");
      del.type = "button";
      del.addEventListener("click", async () => {
        const ok = await Dialog.confirm({
          title: "Delete Speech Tile?",
          content: `<p>Delete <strong>${ttmEscapeHtml(name)}</strong>?</p>`
        });

        if (ok) {
          await doc.delete();
          this.refreshManagedTileList();
        }
      });

      ttmAdd(row, trigger);
      ttmAdd(row, select);
      ttmAdd(row, edit);
      ttmAdd(row, del);
      ttmAdd(card, row);
      ttmAdd(list, card);
    }
  }

  startDrag(event) {
    if (!this.element) return;

    this.drag.active = true;
    this.drag.startX = event.clientX;
    this.drag.startY = event.clientY;

    const rect = this.element.getBoundingClientRect();
    this.drag.startLeft = rect.left;
    this.drag.startTop = rect.top;

    event.preventDefault();
  }

  doDrag(event) {
    if (!this.drag.active || !this.element) return;

    this.element.style.left = `${this.drag.startLeft + event.clientX - this.drag.startX}px`;
    this.element.style.top = `${this.drag.startTop + event.clientY - this.drag.startY}px`;
  }

  async endDrag() {
    if (!this.drag.active || !this.element) return;

    this.drag.active = false;
    await game.settings.set(TTM_ID, "windowLeft", this.element.style.left);
    await game.settings.set(TTM_ID, "windowTop", this.element.style.top);
  }
}