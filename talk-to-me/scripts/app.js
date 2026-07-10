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

    try {
      ttmAdd(root, this.createHeader());
      ttmAdd(root, this.createBody());
    } catch (err) {
      console.error("TalkToMe UI failed to open.", err);
      ui.notifications.error("TalkToMe UI failed to open. Check the console for details.");
      return;
    }

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

createImagePickerField(labelText, input) {
  const group = ttmMake("div", null, "form-group ttm-image-picker-group");
  const label = ttmMake("label", labelText);
  const row = ttmMake("div", null, "ttm-image-picker-row");

  const browse = ttmMake("button", "🔍", "ttm-icon-button");
  browse.type = "button";
  browse.title = "Browse Foundry files";

  browse.addEventListener("click", async () => {
    try {
      const picker = new FilePicker({
        type: "image",
        current: input.value || "",
        callback: path => {
          input.value = path;
        }
      });

      picker.render(true);
    } catch (err) {
      console.error("TalkToMe file picker failed:", err);
      ttmNotice("error", "Could not open the Foundry file picker.");
    }
  });

  ttmAdd(row, input);
  ttmAdd(row, browse);
  ttmAdd(group, label);
  ttmAdd(group, row);

  return group;
}

createTemplateField(labelText, input, templates) {
  const field = this.createField(labelText, input);
  field.dataset.ttmTemplateField = Array.isArray(templates) ? templates.join(",") : String(templates ?? "");
  return field;
}

wrapTemplateField(field, templates) {
  field.dataset.ttmTemplateField = Array.isArray(templates) ? templates.join(",") : String(templates ?? "");
  return field;
}

createTemplateField(labelText, input, templates) {
  return this.wrapTemplateField(this.createField(labelText, input), templates);
}

createWallPickerField(labelText, input) {
  const group = ttmMake("div", null, "form-group ttm-wall-picker-group");
  const label = ttmMake("label", labelText);
  const row = ttmMake("div", null, "ttm-wall-picker-row");

  const pickSelected = ttmMake("button", "🎯", "ttm-icon-button");
  pickSelected.type = "button";
  pickSelected.title = "Use selected wall or door";

  pickSelected.addEventListener("click", () => {
    const wall = canvas.walls?.controlled?.[0]
      ?? canvas.walls?.hover
      ?? canvas.walls?.placeables?.find(w => w.controlled);

    if (!wall?.document?.id) {
      canvas.walls?.activate?.();
      ui.notifications.warn("Select or hover a wall/door on the Walls layer, then press this button again.");
      return;
    }

    input.value = wall.document.id;
    ui.notifications.info(`TalkToMe selected wall: ${wall.document.id}`);
  });

  const goWalls = ttmMake("button", "🧱", "ttm-icon-button");
  goWalls.type = "button";
  goWalls.title = "Switch to Walls layer";

  goWalls.addEventListener("click", () => {
    canvas.walls?.activate?.();
    ui.notifications.info("Walls layer activated. Select a wall or door, then use the target button.");
  });

  ttmAdd(row, input);
  ttmAdd(row, pickSelected);
  ttmAdd(row, goWalls);
  ttmAdd(group, label);
  ttmAdd(group, row);

  return group;
}

createColourPickerField(labelText, input) {
  const group = ttmMake("div", null, "form-group ttm-colour-picker-group");
  const label = ttmMake("label", labelText);
  const row = ttmMake("div", null, "ttm-colour-picker-row");

  const picker = ttmMake("input");
  picker.type = "color";
  picker.value = /^#[0-9a-fA-F]{6}$/.test(input.value) ? input.value : "#ffffff";
  picker.title = "Pick a light colour";

  input.placeholder = "#ffffff";

  picker.addEventListener("input", () => {
    input.value = picker.value;
  });

  input.addEventListener("input", () => {
    if (/^#[0-9a-fA-F]{6}$/.test(input.value)) {
      picker.value = input.value;
    }
  });

  ttmAdd(row, picker);
  ttmAdd(row, input);
  ttmAdd(group, label);
  ttmAdd(group, row);

  return group;
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

toggleSwitchClickActivation() {
  if (!this.element) return;

  const trigger = this.element.querySelector("#ttm-tile-trigger");
  const group = this.element.querySelector("[data-ttm-switch-click-group='true']");
  if (!trigger || !group) return;

  const template = this.element.querySelector("#ttm-tile-template")?.value ?? "speech";
            group.hidden = trigger.value !== "switch" && template !== "switch";
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
    ttmAdd(panel, this.createTemplateField("RollTable", tableSelect, ["speech", "switch", "light", "trap", "teleport", "reset"]));
    ttmAdd(panel, this.createField("Custom speech", textArea));
    ttmAdd(panel, this.createField("Custom NPC name", npcName));
    ttmAdd(panel, postChat.label);
    ttmAdd(panel, zoomToSpeaker.label);
    ttmAdd(panel, buttons);

    return panel;
  }


createTilePickerField(labelText, input) {
  const group = ttmMake("div", null, "form-group ttm-tile-picker-group");
  const label = ttmMake("label", labelText);
  const row = ttmMake("div", null, "ttm-tile-picker-row");

  const pickSelected = ttmMake("button", "🎯", "ttm-icon-button");
  pickSelected.type = "button";
  pickSelected.title = "Use selected or hovered tile";

  pickSelected.addEventListener("click", () => {
    const tile = canvas.tiles?.controlled?.[0]
      ?? canvas.tiles?.hover
      ?? canvas.tiles?.placeables?.find(t => t.controlled);

    if (!tile?.document?.id) {
      canvas.tiles?.activate?.();
      ui.notifications.warn("Select or hover a tile, then press this button again.");
      return;
    }

    input.value = tile.document.id;
    input.dataset.selectedTileName = tile.document.name ?? tile.document.id;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    ui.notifications.info(
      `TalkToMe linked tile selected: ${tile.document.name ?? "Unnamed Tile"} (${tile.document.id})`
    );
  });

  const goTiles = ttmMake("button", "🧩", "ttm-icon-button");
  goTiles.type = "button";
  goTiles.title = "Switch to Tiles layer";

  goTiles.addEventListener("click", () => {
    canvas.tiles?.activate?.();
    ui.notifications.info("Tiles layer activated. Select a tile, then use the target button.");
  });

  ttmAdd(row, input);
  ttmAdd(row, pickSelected);
  ttmAdd(row, goTiles);
  ttmAdd(group, label);
  ttmAdd(group, row);

  return group;
}

createCoordinatePickerField(labelText, xInput, yInput) {
  const group = ttmMake("div", null, "form-group ttm-coordinate-picker-group");
  const label = ttmMake("label", labelText);
  const row = ttmMake("div", null, "ttm-coordinate-picker-row");

  const pick = ttmMake("button", "🎯 Pick selected token", "ttm-icon-button");
  pick.type = "button";
  pick.title = "Use the selected token centre as these coordinates";

  pick.addEventListener("click", () => {
    const token = canvas.tokens?.controlled?.[0];

    if (!token) {
      canvas.tokens?.activate?.();
      ui.notifications.warn("Select a token, then press this button again.");
      return;
    }

    const centreX = Math.round(token.document.x + token.document.width * canvas.grid.size / 2);
    const centreY = Math.round(token.document.y + token.document.height * canvas.grid.size / 2);

    xInput.value = centreX;
    yInput.value = centreY;

    ui.notifications.info(`TalkToMe picked coordinates: ${centreX}, ${centreY}`);
  });

  const xWrap = ttmMake("label", "X");
  const yWrap = ttmMake("label", "Y");

  ttmAdd(xWrap, xInput);
  ttmAdd(yWrap, yInput);
  ttmAdd(row, xWrap);
  ttmAdd(row, yWrap);
  ttmAdd(row, pick);
  ttmAdd(group, label);
  ttmAdd(group, row);

  return group;
}

createCanvasPointPickerField(labelText, xInput, yInput) {
  const group = ttmMake("div", null, "form-group ttm-coordinate-picker-group");
  const label = ttmMake("label", labelText);
  const row = ttmMake("div", null, "ttm-coordinate-picker-row");

  const pick = ttmMake("button", "🎯 Pick canvas point", "ttm-icon-button");
  pick.type = "button";
  pick.title = "Click a point on the canvas to use as these coordinates";

  pick.addEventListener("click", () => {
    const view = canvas?.app?.view;

    if (!view || !canvas?.stage) {
      ui.notifications.warn("Canvas is not ready.");
      return;
    }

    ui.notifications.info("Click a point on the canvas for the teleport destination.");

    const onPointerDown = event => {
      view.removeEventListener("pointerdown", onPointerDown, true);

      const rect = view.getBoundingClientRect();
      const screenPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };

      const worldPoint = canvas.stage.worldTransform.applyInverse(screenPoint);

      xInput.value = Math.round(worldPoint.x);
      yInput.value = Math.round(worldPoint.y);

      ui.notifications.info(`TalkToMe picked coordinates: ${xInput.value}, ${yInput.value}`);
    };

    view.addEventListener("pointerdown", onPointerDown, true);
  });

  const xWrap = ttmMake("label", "X");
  const yWrap = ttmMake("label", "Y");

  ttmAdd(xWrap, xInput);
  ttmAdd(yWrap, yInput);
  ttmAdd(row, xWrap);
  ttmAdd(row, yWrap);
  ttmAdd(row, pick);
  ttmAdd(group, label);
  ttmAdd(group, row);

  return group;
}

pickTilePlacementPoint() {
  return new Promise(resolve => {
    const view = canvas?.app?.view;

    if (!view || !canvas?.stage) {
      ui.notifications.warn("Canvas is not ready.");
      resolve(null);
      return;
    }

    ui.notifications.info("Click the canvas to place the TalkToMe tile. Press Escape to cancel.");

    const oldCursor = view.style.cursor;
    view.style.cursor = "crosshair";

    const cleanup = () => {
      view.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      view.style.cursor = oldCursor;
    };

    const onKeyDown = event => {
      if (event.key !== "Escape") return;

      cleanup();
      ui.notifications.info("TalkToMe tile placement cancelled.");
      resolve(null);
    };

    const onPointerDown = event => {
      event.preventDefault?.();
      event.stopPropagation?.();

      cleanup();

      const rect = view.getBoundingClientRect();
      const screenPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };

      const worldPoint = canvas.stage.worldTransform.applyInverse(screenPoint);

      resolve({
        x: Math.round(worldPoint.x),
        y: Math.round(worldPoint.y)
      });
    };

    view.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
  });
}

  createTilesPanel() {
    const panel = ttmMake("section", null, "ttm-panel");
    panel.dataset.panel = "tiles";
    panel.hidden = this.activeTab !== "tiles";

    const template = ttmMake("select");
    template.id = "ttm-tile-template";
    for (const [value, label] of [
      ["speech", "Speech Bubble"],
      ["switch", "Switch Activation"],
      ["light", "Light Activation"],
      ["trap", "Trap Activation"],
      ["teleport", "Teleport Activation"],
      ["reset", "Create Reset Tile"]
    ]) {
      const opt = ttmMake("option", label);
      opt.value = value;
      ttmAdd(template, opt);
    }

    const tableSelect = this.createTableSelect("ttm-tile-table");
    const subjectToken = this.createTokenSelect("ttm-tile-subject-token");
    subjectToken.dataset.ttmTokenSelect = "true";

    const name = ttmMake("input");
    name.type = "text";
    name.placeholder = "Guard Chatter";

    const npc = ttmMake("input");
    npc.type = "text";
    npc.placeholder = "Optional override, e.g. Guard";

    const tileImage = ttmMake("input");
    tileImage.id = "ttm-tile-image";
    tileImage.type = "text";
    tileImage.placeholder = "icons/svg/sound.svg or modules/talk-to-me/images/switch.webp";

    const trigger = ttmMake("select");
    trigger.id = "ttm-tile-trigger";
    for (const [value, label] of [
      ["enter", "Token enters tile"],
      ["exit", "Token exits tile"],
      ["switch", "Switch activated"],
      ["trap", "Trap triggered"],
      ["effect", "Magic spell/effect"],
      ["manual", "Manual only"]
    ]) {
      const opt = ttmMake("option", label);
      opt.value = value;
      ttmAdd(trigger, opt);
    }

    const clickActivation = ttmMake("select");
    for (const [value, label] of [["left", "Left click"], ["double-left", "Double left click"], ["right", "Right click"], ["any", "Any click"]]) {
      const opt = ttmMake("option", label);
      opt.value = value;
      ttmAdd(clickActivation, opt);
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
    width.value = 100;
    width.min = 50;

    const height = ttmMake("input");
    height.type = "number";
    height.value = 100;
    height.min = 50;

    const hotspotSize = ttmMake("input");
    hotspotSize.id = "ttm-hotspot-size";
    hotspotSize.type = "number";
    hotspotSize.value = 64;
    hotspotSize.min = 8;

    const hotspotOffsetX = ttmMake("input");
    hotspotOffsetX.id = "ttm-hotspot-offset-x";
    hotspotOffsetX.type = "number";
    hotspotOffsetX.value = 0;

    const hotspotOffsetY = ttmMake("input");
    hotspotOffsetY.id = "ttm-hotspot-offset-y";
    hotspotOffsetY.type = "number";
    hotspotOffsetY.value = 0;

    const inactiveImage = ttmMake("input");
    inactiveImage.type = "text";
    inactiveImage.placeholder = "Default/off image path";

    const activeImage = ttmMake("input");
    activeImage.type = "text";
    activeImage.placeholder = "Active/on image path";

    const lightInactiveImage = ttmMake("input");
    lightInactiveImage.type = "text";
    lightInactiveImage.placeholder = "Light off image path";

    const lightActiveImage = ttmMake("input");
    lightActiveImage.type = "text";
    lightActiveImage.placeholder = "Light on image path";

    const trapInactiveImage = ttmMake("input");
    trapInactiveImage.type = "text";
    trapInactiveImage.placeholder = "Trap ready/default image path";

    const trapActiveImage = ttmMake("input");
    trapActiveImage.type = "text";
    trapActiveImage.placeholder = "Trap triggered image path";

    const teleportInactiveImage = ttmMake("input");
    teleportInactiveImage.type = "text";
    teleportInactiveImage.placeholder = "Teleport idle/default image path";

    const teleportActiveImage = ttmMake("input");
    teleportActiveImage.type = "text";
    teleportActiveImage.placeholder = "Teleport activated image path";

    const resetInactiveImage = ttmMake("input");
    resetInactiveImage.type = "text";
    resetInactiveImage.placeholder = "Reset idle/default image path";

    const resetActiveImage = ttmMake("input");
    resetActiveImage.type = "text";
    resetActiveImage.placeholder = "Reset activated image path";

    const doorWallId = ttmMake("input");
    doorWallId.type = "text";
    doorWallId.placeholder = "Linked door wall id";

    const doorAction = ttmMake("select");
    for (const [value, label] of [["toggle", "Toggle door"], ["open", "Open door"], ["close", "Close door"], ["lock", "Lock door"]]) {
      const opt = ttmMake("option", label);
      opt.value = value;
      ttmAdd(doorAction, opt);
    }

    const targetTileId = ttmMake("input");
    targetTileId.type = "text";
    targetTileId.placeholder = "Select a tile to activate";

    const lightDim = ttmMake("input");
    lightDim.type = "number";
    lightDim.value = 20;

    const lightBright = ttmMake("input");
    lightBright.type = "number";
    lightBright.value = 10;

    const lightColor = ttmMake("input");
    lightColor.type = "text";
    lightColor.value = "#ffffff";

    const lightAlpha = ttmMake("input");
    lightAlpha.type = "number";
    lightAlpha.step = "0.1";
    lightAlpha.value = 0.5;

    const saveAbility = ttmMake("select");
    for (const value of ["str", "dex", "con", "int", "wis", "cha"]) {
      const opt = ttmMake("option", value.toUpperCase());
      opt.value = value;
      ttmAdd(saveAbility, opt);
    }

    const saveDC = ttmMake("input");
    saveDC.type = "number";
    saveDC.value = 10;

    const trapTarget = ttmMake("select");
    trapTarget.id = "ttm-trap-target";
    for (const [value, label] of [
      ["triggering-token", "Triggering Token"],
      ["tokens-within-tile", "Tokens Within The Tile"],
      ["use-player-tokens", "Use Player Tokens"]
    ]) {
      const opt = ttmMake("option", label);
      opt.value = value;
      ttmAdd(trapTarget, opt);
    }


    const linkedTriggerTileId = ttmMake("input");
    linkedTriggerTileId.type = "text";
    linkedTriggerTileId.placeholder = "Optional TalkToMe tile id to trigger";

    const teleportSwitchX = ttmMake("input");
    teleportSwitchX.type = "number";
    teleportSwitchX.placeholder = "Auto-filled from placed tile";
    teleportSwitchX.readOnly = true;

    const teleportSwitchY = ttmMake("input");
    teleportSwitchY.type = "number";
    teleportSwitchY.placeholder = "Auto-filled from placed tile";
    teleportSwitchY.readOnly = true;

    const teleportX = ttmMake("input");
    teleportX.type = "number";
    teleportX.placeholder = "Teleport end X";

    const teleportY = ttmMake("input");
    teleportY.type = "number";
    teleportY.placeholder = "Teleport end Y";

    const teleportAutoReset = this.createCheckbox("ttm-teleport-auto-reset", "Auto reset after activation", true);

    const teleportCreateReturn = this.createCheckbox("ttm-teleport-create-return", "Create return teleport tile", false);

    const teleportUseCooldown = this.createCheckbox("ttm-teleport-use-cooldown", "Limit each token to one activation every X seconds", true);

    const teleportAvoidTiles = this.createCheckbox("ttm-teleport-avoid-tiles", "Prevent landing on teleport tiles", true);

    const teleportCooldownSeconds = ttmMake("input");
    teleportCooldownSeconds.id = "ttm-teleport-cooldown-seconds";
    teleportCooldownSeconds.type = "number";
    teleportCooldownSeconds.value = 3;
    teleportCooldownSeconds.min = 0;
    teleportCooldownSeconds.step = 0.5;

    const teleportResetSeconds = ttmMake("input");
    teleportResetSeconds.id = "ttm-teleport-reset-seconds";
    teleportResetSeconds.type = "number";
    teleportResetSeconds.value = 3;
    teleportResetSeconds.min = 0;
    teleportResetSeconds.step = 0.5;

    const teleportOffsetX = ttmMake("input");
    teleportOffsetX.id = "ttm-teleport-offset-x";
    teleportOffsetX.type = "number";
    teleportOffsetX.value = 0;
    teleportOffsetX.placeholder = "0";

    const teleportOffsetY = ttmMake("input");
    teleportOffsetY.id = "ttm-teleport-offset-y";
    teleportOffsetY.type = "number";
    teleportOffsetY.value = 0;
    teleportOffsetY.placeholder = "0";

    const showToPlayers = this.createCheckbox(
      "ttm-show-tile-to-players",
      "Show this tile to players",
      true
    );
    const requirePlayerVision = this.createCheckbox(
      "ttm-require-player-vision",
      "Players require vision to click this tile",
      false
    );
    const hideBehindWalls = this.createCheckbox(
      "ttm-hide-behind-walls",
      "Hide this tile from players when walls block vision",
      true
    );
    const postChat = this.createCheckbox("ttm-tile-post-chat", "Tile also posts to chat", game.settings.get(TTM_ID, "postChatByDefault"));
    const zoomToSpeaker = this.createCheckbox("ttm-tile-zoom", "Pan/zoom to speaking NPC", game.settings.get(TTM_ID, "zoomToSpeakerByDefault"));

    const makeGroup = (title, templates) => {
      const group = ttmMake("section", null, "ttm-template-group");
      group.dataset.templates = templates.join(",");
      ttmAdd(group, ttmMake("h3", title));
      return group;
    };

    const basicGroup = makeGroup("Basic Tile Setup", ["speech", "switch", "light", "trap", "teleport", "reset"]);
    ttmAdd(basicGroup, this.createField("Template", template));
    ttmAdd(basicGroup, this.createField("Tile name", name));
    ttmAdd(basicGroup, this.createField("Trigger", trigger));
    ttmAdd(basicGroup, this.createField("Width", width));
    ttmAdd(basicGroup, this.createField("Height", height));
    ttmAdd(basicGroup, showToPlayers.label);
    ttmAdd(basicGroup, requirePlayerVision.label);
    ttmAdd(basicGroup, hideBehindWalls.label);

    const universalTriggerGroup = makeGroup("Switch Activated Trigger Options", ["speech", "switch", "light", "trap", "teleport", "reset"]);
    universalTriggerGroup.dataset.triggerOnly = "switch";
    ttmAdd(universalTriggerGroup, this.createHint("These options appear whenever Trigger is set to Switch activated, regardless of template."));
    ttmAdd(universalTriggerGroup, this.createField("Click activation", clickActivation));

    const hotspotOptionsGroup = makeGroup("Clickable Hotspot Options", ["speech", "switch", "light", "trap", "teleport", "reset"]);
    hotspotOptionsGroup.dataset.triggerOnly = "switch";
    hotspotOptionsGroup.dataset.requiresVisibleTile = "true";
    ttmAdd(hotspotOptionsGroup, this.createHint("Hotspot options only matter when the tile is visible and activated by click."));
    ttmAdd(hotspotOptionsGroup, this.createField("Hotspot size", hotspotSize));
    ttmAdd(hotspotOptionsGroup, this.createField("Hotspot offset X", hotspotOffsetX));
    ttmAdd(hotspotOptionsGroup, this.createField("Hotspot offset Y", hotspotOffsetY));

    const speechGroup = makeGroup("Speech Bubble Options", ["speech"]);
    ttmAdd(speechGroup, this.createImagePickerField("Speech tile image", tileImage));
    ttmAdd(speechGroup, this.createField("Speaking NPC token", subjectToken));
    ttmAdd(speechGroup, this.createField("NPC chat name override", npc));
    ttmAdd(speechGroup, this.createField("Speech mode", mode));
    ttmAdd(speechGroup, this.createField("RollTable", tableSelect));
    ttmAdd(speechGroup, this.createField("Custom speech", text));
    ttmAdd(speechGroup, postChat.label);
    ttmAdd(speechGroup, zoomToSpeaker.label);

    const switchGroup = makeGroup("Switch Options", ["switch"]);
    ttmAdd(switchGroup, this.createImagePickerField("Inactive/default image", inactiveImage));
    ttmAdd(switchGroup, this.createImagePickerField("Active image", activeImage));
    ttmAdd(switchGroup, this.createWallPickerField("Door wall id", doorWallId));
    ttmAdd(switchGroup, this.createField("Door action", doorAction));
    ttmAdd(switchGroup, this.createTilePickerField("Linked tile ID", targetTileId));

    const lightGroup = makeGroup("Light Options", ["light"]);
    ttmAdd(lightGroup, this.createField("Light dim radius", lightDim));
    ttmAdd(lightGroup, this.createField("Light bright radius", lightBright));
    ttmAdd(lightGroup, this.createColourPickerField("Light colour", lightColor));
    ttmAdd(lightGroup, this.createField("Light alpha", lightAlpha));
    ttmAdd(lightGroup, this.createImagePickerField("Inactive/default image", lightInactiveImage));
    ttmAdd(lightGroup, this.createImagePickerField("Active image", lightActiveImage));

    const trapGroup = makeGroup("Trap Options", ["trap"]);
    ttmAdd(trapGroup, this.createField("Target", trapTarget));
    ttmAdd(trapGroup, this.createField("Trap save ability", saveAbility));
    ttmAdd(trapGroup, this.createField("Trap save DC", saveDC));
    ttmAdd(trapGroup, this.createTilePickerField("Trigger another tile", linkedTriggerTileId));
    ttmAdd(trapGroup, this.createImagePickerField("Inactive/default image", trapInactiveImage));
    ttmAdd(trapGroup, this.createImagePickerField("Active image", trapActiveImage));

    const teleportGroup = makeGroup("Teleport Options", ["teleport"]);
    ttmAdd(teleportGroup, this.createField("Switch location X", teleportSwitchX));
    ttmAdd(teleportGroup, this.createField("Switch location Y", teleportSwitchY));
    ttmAdd(teleportGroup, this.createCanvasPointPickerField("Teleport end location", teleportX, teleportY));
    ttmAdd(teleportGroup, this.createHint("Optional offset is added to the end location. Use it for enter/exit triggers to stop tokens landing inside another trigger loop."));
    ttmAdd(teleportGroup, this.createField("Token offset X", teleportOffsetX));
    ttmAdd(teleportGroup, this.createField("Token offset Y", teleportOffsetY));
    ttmAdd(teleportGroup, this.createHint("Teleport will use the triggering token. If no trigger token is supplied, it falls back to the selected token or a token inside the tile."));
    ttmAdd(teleportGroup, teleportAutoReset.label);
    ttmAdd(teleportGroup, this.createField("Reset timer seconds", teleportResetSeconds));
    ttmAdd(teleportGroup, teleportUseCooldown.label);
    ttmAdd(teleportGroup, this.createField("Token cooldown seconds", teleportCooldownSeconds));
    ttmAdd(teleportGroup, teleportAvoidTiles.label);
    ttmAdd(teleportGroup, this.createHint("Advanced: create a matching return tile at the teleport destination."));
    ttmAdd(teleportGroup, teleportCreateReturn.label);
    ttmAdd(teleportGroup, this.createImagePickerField("Inactive/default image", teleportInactiveImage));
    ttmAdd(teleportGroup, this.createImagePickerField("Active image", teleportActiveImage));

    const resetGroup = makeGroup("Reset Tile Options", ["reset"]);
    ttmAdd(resetGroup, this.createHint("This tile resets TalkToMe utility tiles in the current scene back to their inactive/default state."));
    ttmAdd(resetGroup, this.createImagePickerField("Inactive/default image", resetInactiveImage));
    ttmAdd(resetGroup, this.createImagePickerField("Active image", resetActiveImage));

    const buttons = ttmMake("div", null, "ttm-button-row");

    const create = ttmMake("button", "Place Template Tile", "ttm-primary");
    create.type = "button";
    create.addEventListener("click", async () => {
      if (template.value === "switch" && targetTileId.value.trim()) {
        const linkedTile = canvas.scene?.tiles?.get(targetTileId.value.trim());

        if (!linkedTile) {
          ui.notifications.warn(
            "The selected Linked Tile ID is not present on the current scene."
          );
          return;
        }

        ui.notifications.info(
          `TalkToMe switch linked to: ${linkedTile.name ?? "Unnamed Tile"} (${linkedTile.id})`
        );
      }

      const placement = await this.pickTilePlacementPoint();
      if (!placement) return;

      const doc = await this.api.createSpeechTile({
        x: placement.x,
        y: placement.y,
        name: name.value.trim(),
        npcName: npc.value.trim(),
        subjectTokenId: subjectToken.value,
        tableId: tableSelect.value,
        trigger: trigger.value,
        mode: mode.value,
        text: text.value.trim(),
        postChat: postChat.input.checked,
        zoomToSpeaker: zoomToSpeaker.input.checked,
        hidden: !showToPlayers.input.checked,
        requirePlayerVision: requirePlayerVision.input.checked,
        hideBehindWalls: hideBehindWalls.input.checked,
        width: Number(width.value || 100),
        height: Number(height.value || 100),
        clickActivation: clickActivation.value,
        tileImage: tileImage.value.trim(),
        template: template.value,
        activeImage: template.value === "light" ? lightActiveImage.value.trim() : template.value === "trap" ? trapActiveImage.value.trim() : template.value === "teleport" ? teleportActiveImage.value.trim() : template.value === "reset" ? resetActiveImage.value.trim() : activeImage.value.trim(),
        inactiveImage: template.value === "light" ? lightInactiveImage.value.trim() : template.value === "trap" ? trapInactiveImage.value.trim() : template.value === "teleport" ? teleportInactiveImage.value.trim() : template.value === "reset" ? resetInactiveImage.value.trim() : inactiveImage.value.trim(),
        doorWallId: doorWallId.value.trim(),
        doorAction: doorAction.value,
        targetTileId: targetTileId.value.trim(),
        lightDim: Number(lightDim.value || 20),
        lightBright: Number(lightBright.value || 10),
        lightColor: lightColor.value.trim(),
        lightAlpha: Number(lightAlpha.value || 0.5),
        saveAbility: saveAbility.value,
        saveDC: Number(saveDC.value || 10),
        trapTarget: trapTarget.value,
        linkedTriggerTileId: linkedTriggerTileId.value.trim(),
        teleportSwitchX: teleportSwitchX.value,
        teleportSwitchY: teleportSwitchY.value,
        teleportX: teleportX.value,
        teleportY: teleportY.value,
        teleportOffsetX: Number(teleportOffsetX.value || 0),
        teleportOffsetY: Number(teleportOffsetY.value || 0),
        teleportAutoReset: teleportAutoReset.input.checked,
        teleportResetSeconds: Number(teleportResetSeconds.value || 0),
        teleportCreateReturn: teleportCreateReturn.input.checked,
        teleportUseCooldown: teleportUseCooldown.input.checked,
        teleportCooldownSeconds: Number(teleportCooldownSeconds.value || 0),
        teleportAvoidTiles: teleportAvoidTiles.input.checked,
        hotspotSize: Number(hotspotSize.value || 64),
        hotspotOffsetX: Number(hotspotOffsetX.value || 0),
        hotspotOffsetY: Number(hotspotOffsetY.value || 0)
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

const updateTemplateVisibility = () => {
  const selected = template.value;
  const selectedTrigger = trigger.value;

  for (const group of panel.querySelectorAll(".ttm-template-group")) {
    const templates = String(group.dataset.templates || "").split(",");
    const triggerOnly = group.dataset.triggerOnly;

    const templateMatches = templates.includes(selected);
    const triggerMatches = !triggerOnly || triggerOnly === selectedTrigger;

    group.hidden = !(templateMatches && triggerMatches);
  }
};

    template.addEventListener("change", updateTemplateVisibility);
    trigger.addEventListener("change", updateTemplateVisibility);
    showToPlayers.input.addEventListener("change", updateTemplateVisibility);

    ttmAdd(panel, this.createHint("Choose a template to show only the relevant setup options."));
    ttmAdd(panel, basicGroup);
    ttmAdd(panel, universalTriggerGroup);
    ttmAdd(panel, hotspotOptionsGroup);
    ttmAdd(panel, speechGroup);
    ttmAdd(panel, switchGroup);
    ttmAdd(panel, lightGroup);
    ttmAdd(panel, trapGroup);
    ttmAdd(panel, teleportGroup);
    ttmAdd(panel, resetGroup);
    ttmAdd(panel, buttons);
    ttmAdd(panel, ttmMake("hr"));
    ttmAdd(panel, ttmMake("h3", "Managed Trigger Tiles"));
    ttmAdd(panel, list);

    setTimeout(updateTemplateVisibility, 0);

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
    ttmAdd(panel, this.createTemplateField("RollTable", tableSelect, ["speech", "switch", "light", "trap", "teleport", "reset"]));
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
