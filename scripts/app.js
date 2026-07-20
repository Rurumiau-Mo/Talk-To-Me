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
    this.editorElement = null;
    this.managerElement = null;
    this.conversationElement = null;
    this.bubbleEditorElement = null;
    this.bubbleEditorDrag = {
      active: false,
      startX: 0,
      startY: 0,
      startLeft: 0,
      startTop: 0
    };
    this.conversationDrag = {
      active: false,
      startX: 0,
      startY: 0,
      startLeft: 0,
      startTop: 0
    };
    this.managerDrag = {
      active: false,
      startX: 0,
      startY: 0,
      startLeft: 0,
      startTop: 0
    };
    this.editorDrag = {
      active: false,
      startX: 0,
      startY: 0,
      startLeft: 0,
      startTop: 0
    };
    this.activeTab = "speech";
    this.drag = { active: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 };

    this.boundMouseMove = event => this.doDrag(event);
    this.boundMouseUp = () => this.endDrag();
    this.boundEditorMouseMove = event => this.doEditorDrag(event);
    this.boundEditorMouseUp = () => this.endEditorDrag();
    this.boundManagerMouseMove = event => this.doManagerDrag(event);
    this.boundManagerMouseUp = () => this.endManagerDrag();
    this.boundConversationMouseMove =
      event => this.doConversationDrag(event);
    this.boundConversationMouseUp =
      () => this.endConversationDrag();
    this.boundBubbleEditorMouseMove =
      event => this.doBubbleEditorDrag(event);
    this.boundBubbleEditorMouseUp =
      () => this.endBubbleEditorDrag();
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
    root.style.width = "min(660px, calc(100vw - 20px))";

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

    const nav = ttmMake(
      "nav",
      null,
      "ttm-tabs ttm-tabs-permanent sheet-tabs tabs"
    );

    const tabRow = ttmMake(
      "div",
      null,
      "ttm-tab-row ttm-tab-row-main"
    );

    for (const [id, label] of [
      ["speech", "Speech"],
      ["tiles", "Trigger Tiles"],
      ["macros", "Macros"],
      ["nodes", "Node Editor"]
    ]) {
      const button = ttmMake(
        "button",
        label,
        `ttm-tab ${id === this.activeTab ? "active" : ""}`
      );
      button.type = "button";
      button.dataset.tab = id;
      button.addEventListener(
        "click",
        () => this.switchTab(id)
      );
      ttmAdd(tabRow, button);
    }

    ttmAdd(nav, tabRow);
    ttmAdd(body, nav);

    const panels = ttmMake("div", null, "ttm-panels");
    ttmAdd(panels, this.createSpeechPanel());
    ttmAdd(panels, this.createTilesPanel());
    ttmAdd(panels, this.createNodeEditorPanel());
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

  makeCollapsibleSection(section, title, open = false) {
    if (!section) return section;

    const wrapper = ttmMake(
      "section",
      null,
      "ttm-optional-section"
    );
    wrapper.dataset.sectionTitle = title;
    section.classList.add("ttm-optional-section-content");
    ttmAdd(wrapper, section);

    return wrapper;
  }

  bindOptionalSection(section, checkboxInput) {
    if (!section || !checkboxInput) return;

    const update = () => {
      const enabled = checkboxInput.checked === true;
      section.classList.toggle(
        "ttm-optional-section-disabled",
        !enabled
      );

      for (const child of Array.from(section.children)) {
        if (
          child.contains?.(checkboxInput)
          || child === checkboxInput
        ) {
          continue;
        }

        child.hidden = !enabled;
      }
    };

    checkboxInput.addEventListener("change", update);
    update();
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

createActorSelect(id) {
  const select = ttmMake("select");
  select.id = id;

  const blank = ttmMake("option", "— Choose an Actor —");
  blank.value = "";
  ttmAdd(select, blank);

  const actors = Array.from(game.actors ?? [])
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const actor of actors) {
    const option = ttmMake("option", actor.name);
    option.value = actor.id;
    ttmAdd(select, option);
  }

  return select;
}

createTokenMultiSelect(id) {
  const select = ttmMake("select");
  select.id = id;
  select.multiple = true;
  select.size = 6;

  for (const token of ttmSceneTokens()) {
    const option = ttmMake("option", token.name);
    option.value = token.document.id;
    ttmAdd(select, option);
  }

  return select;
}

createActivationAudienceSelect(id) {
  const select = ttmMake("select");
  select.id = id;

  for (const [value, label] of [
    ["everyone", "Everyone"],
    ["players", "Players only"],
    ["npcs", "NPCs only"],
    ["groups", "Groups only"],
    ["vehicles", "Vehicles only"]
  ]) {
    const option = ttmMake("option", label);
    option.value = value;
    ttmAdd(select, option);
  }

  select.value = "everyone";
  return select;
}

activationAudienceValueToTypes(value) {
  if (value === "everyone") {
    return ["players", "npcs", "groups", "vehicles"];
  }

  return ["players", "npcs", "groups", "vehicles"]
    .includes(value)
      ? [value]
      : ["players", "npcs", "groups", "vehicles"];
}

activationTypesToAudienceValue(types) {
  const values = Array.isArray(types) ? types : [];

  if (
    ["players", "npcs", "groups", "vehicles"]
      .every(value => values.includes(value))
  ) {
    return "everyone";
  }

  return values.length === 1
    ? values[0]
    : "everyone";
}

getSpellActivities(spell) {
  const activities = spell?.system?.activities;
  if (!activities) return [];

  if (typeof activities.values === "function") {
    return Array.from(activities.values());
  }

  if (Array.isArray(activities)) return activities;
  return Object.values(activities);
}

detectSpellTemplateData(spell) {
  if (!spell) return null;

  const activities = this.getSpellActivities(spell);

  const readNumber = (...values) => {
    for (const value of values) {
      const number = Number(
        value?.value ?? value
      );

      if (Number.isFinite(number)) return number;
    }

    return null;
  };

  const normaliseType = value => {
    const raw = String(
      value?.value ?? value ?? ""
    ).trim().toLowerCase();

    const aliases = {
      sphere: "circle",
      radius: "circle",
      cylinder: "circle",
      circle: "circle",
      emanation: "circle",
      cone: "cone",
      line: "ray",
      ray: "ray",
      beam: "ray",
      cube: "rect",
      square: "rect",
      rectangle: "rect",
      rect: "rect"
    };

    return aliases[raw] ?? (
      ["circle", "cone", "ray", "rect"].includes(raw)
        ? raw
        : "none"
    );
  };

  const candidates = [];

  for (const activity of activities) {
    candidates.push(
      activity?.target?.template,
      activity?.system?.target?.template,
      activity?.template,
      activity?.system?.template,
      activity?.target,
      activity?.system?.target
    );
  }

  candidates.push(
    spell?.system?.target?.template,
    spell?.system?.template,
    spell?.system?.target,
    spell?.system?.range
  );

  for (const candidate of candidates.filter(Boolean)) {
    const type = normaliseType(
      candidate.type
      ?? candidate.shape
      ?? candidate.templateType
      ?? candidate.template
      ?? candidate.affects?.type
    );

    if (type === "none") continue;

    let distance = readNumber(
      candidate.distance,
      candidate.size,
      candidate.radius,
      candidate.length,
      candidate.value,
      candidate.affects?.count
    );

    const width = readNumber(
      candidate.width,
      candidate.thickness
    );

    const angle = readNumber(candidate.angle);

    // D&D often stores a diameter for cube/square areas.
    if (type === "rect" && distance === null) {
      distance = readNumber(
        candidate.width,
        candidate.height,
        candidate.size
      );
    }

    return {
      type,
      distance: distance ?? 0,
      width: width ?? (
        type === "ray" || type === "rect"
          ? 5
          : 0
      ),
      angle: angle ?? (
        type === "cone"
          ? 53.13
          : 90
      ),
      source:
        candidate === spell?.system?.target
          ? "spell target"
          : "spell activity"
    };
  }

  return null;
}

applyDetectedSpellTemplate({
  spell,
  typeInput,
  distanceInput,
  angleInput,
  widthInput,
  statusElement = null
} = {}) {
  const detected = this.detectSpellTemplateData(spell);

  if (!detected) {
    if (statusElement) {
      statusElement.textContent =
        "No configured spell template was detected. Manual settings remain available.";
    }

    return false;
  }

  typeInput.value = detected.type;

  if (Number.isFinite(detected.distance)) {
    distanceInput.value = detected.distance;
  }

  if (Number.isFinite(detected.angle)) {
    angleInput.value = detected.angle;
  }

  if (Number.isFinite(detected.width)) {
    widthInput.value = detected.width;
  }

  if (statusElement) {
    const label = {
      circle: "Circle",
      cone: "Cone",
      ray: "Ray",
      rect: "Rectangle"
    }[detected.type] ?? detected.type;

    statusElement.textContent =
      `Detected ${label}`
      + (
        detected.distance
          ? ` · ${detected.distance} ${canvas.scene?.grid?.units ?? "ft"}`
          : ""
      );
  }

  return true;
}

async clearSpellTemplateBlueprints() {
  if (!canvas?.scene || !game.user?.isGM) {
    ui.notifications.warn(
      "Only the GM can clear spell template previews."
    );
    return 0;
  }

  const templates = canvas.scene.templates.filter(template =>
    template.getFlag(TTM_ID, "spellBlueprint") === true
    && template.getFlag(TTM_ID, "blueprintOwner") === game.user.id
  );

  if (!templates.length) {
    ui.notifications.info(
      "There are no TalkToMe spell template previews to clear."
    );
    return 0;
  }

  await canvas.scene.deleteEmbeddedDocuments(
    "MeasuredTemplate",
    templates.map(template => template.id)
  );

  ui.notifications.info(
    `Cleared ${templates.length} spell template preview`
    + (templates.length === 1 ? "." : "s.")
  );

  return templates.length;
}

async previewSpellTemplateBlueprint({
  type,
  origin,
  customX,
  customY,
  distance,
  angle,
  width,
  direction,
  casterTokenId
} = {}) {
  if (!canvas?.scene || !game.user?.isGM) {
    ui.notifications.warn(
      "Only the GM can preview spell templates."
    );
    return null;
  }

  if (!type || type === "none") {
    ui.notifications.warn(
      "Choose a spell template shape first."
    );
    return null;
  }

  const existing = canvas.scene.templates.filter(template =>
    template.getFlag(TTM_ID, "spellBlueprint") === true
    && template.getFlag(TTM_ID, "blueprintOwner") === game.user.id
  );

  if (existing.length) {
    await canvas.scene.deleteEmbeddedDocuments(
      "MeasuredTemplate",
      existing.map(template => template.id)
    );
  }

  let point = null;
  const caster = casterTokenId
    ? canvas.tokens?.get(casterTokenId)
    : null;

  if (origin === "caster" && caster) {
    point = caster.center;
  } else if (origin === "custom") {
    const x = Number(customX);
    const y = Number(customY);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      point = { x, y };
    }
  }

  if (!point) {
    point = canvas.mousePosition
      ?? {
        x: canvas.dimensions?.sceneX
          + canvas.dimensions?.sceneWidth / 2,
        y: canvas.dimensions?.sceneY
          + canvas.dimensions?.sceneHeight / 2
      };
  }

  const created = await canvas.scene.createEmbeddedDocuments(
    "MeasuredTemplate",
    [{
      t: type,
      x: Number(point.x),
      y: Number(point.y),
      distance: Math.max(0, Number(distance ?? 20)),
      direction: Number(direction ?? 0),
      angle: Math.max(0, Number(angle ?? 90)),
      width: Math.max(0, Number(width ?? 5)),
      user: game.user.id,
      fillColor: game.user.color ?? "#ff6400",
      flags: {
        [TTM_ID]: {
          spellBlueprint: true,
          blueprintOwner: game.user.id
        }
      }
    }]
  );

  ui.notifications.info(
    "Spell template blueprint placed. Drag or rotate it to inspect the area."
  );
  canvas.templates?.activate?.();
  created?.[0]?.object?.control?.({ releaseOthers: true });
  return created?.[0] ?? null;
}

createAudioPickerField(labelText, input) {
  const group = ttmMake(
    "div",
    null,
    "form-group ttm-image-picker-group"
  );
  const label = ttmMake("label", labelText);
  const row = ttmMake("div", null, "ttm-image-picker-row");
  const browse = ttmMake("button", "🔊", "ttm-icon-button");

  browse.type = "button";
  browse.title = "Browse Foundry audio files";

  browse.addEventListener("click", () => {
    try {
      const picker = new FilePicker({
        type: "audio",
        current: input.value || "",
        callback: path => {
          input.value = path;
        }
      });

      picker.render(true);
    } catch (error) {
      console.error("TalkToMe audio picker failed:", error);
      ttmNotice(
        "error",
        "Could not open the Foundry audio picker."
      );
    }
  });

  ttmAdd(row, input);
  ttmAdd(row, browse);
  ttmAdd(group, label);
  ttmAdd(group, row);
  return group;
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

  // Speech controls
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
    const zoomToSpeaker = this.createCheckbox(
      "ttm-speech-zoom",
      "Pan/zoom to speaker",
      false
    );
    const typingAnimation = this.createCheckbox(
      "ttm-speech-typing-animation",
      "Typing animation",
      false
    );

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
        zoomToSpeaker: zoomToSpeaker.input.checked,
        typingAnimation: typingAnimation.input.checked
      });
    });

    const editBubbles = ttmMake(
      "button",
      "Speech Bubble Editor"
    );
    editBubbles.type = "button";
    editBubbles.addEventListener(
      "click",
      () => this.openBubbleEditor()
    );

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
    ttmAdd(buttons, editBubbles);
    ttmAdd(buttons, save);
    ttmAdd(panel, this.createHint("Pick a token from the scene, or leave it on auto and select/target a token on the canvas."));
    ttmAdd(panel, tokenName);
    ttmAdd(panel, this.createField("Token", tokenSelect));
    ttmAdd(panel, this.createTemplateField("RollTable", tableSelect, ["speech", "switch", "light", "globalLight", "trap", "teleport", "moveTokens", "spawnTokens", "reset"]));
    ttmAdd(panel, this.createField("Custom speech", textArea));
    ttmAdd(panel, this.createField("Custom NPC name", npcName));
    ttmAdd(panel, postChat.label);
    ttmAdd(panel, zoomToSpeaker.label);
    ttmAdd(panel, typingAnimation.label);
    ttmAdd(panel, buttons);

    return panel;
  }



openBubbleEditor() {
  if (!ttmIsGM()) {
    ui.notifications.warn(
      "Speech Bubble editing is a GM tool."
    );
    return false;
  }

  this.closeBubbleEditor();

  const root = ttmMake(
    "section",
    null,
    "ttm-app ttm-bubble-editor-window window-app"
  );
  root.id = "talk-to-me-bubble-editor-window";
  root.setAttribute("role", "dialog");
  root.setAttribute(
    "aria-label",
    "TalkToMe Speech Bubble Editor"
  );
  root.style.left = "calc(50vw - 280px)";
  root.style.top = "90px";
  root.style.zIndex = "10030";

  const header = ttmMake(
    "header",
    null,
    "ttm-header window-header flexrow"
  );
  const title = ttmMake(
    "h4",
    "TalkToMe",
    "ttm-title window-title"
  );
  const subtitle = ttmMake(
    "span",
    "Speech Bubble Editor",
    "ttm-subtitle"
  );
  const close = ttmMake(
    "button",
    "×",
    "ttm-header-button"
  );
  close.type = "button";
  close.title = "Close";
  close.addEventListener(
    "click",
    () => this.closeBubbleEditor()
  );

  header.addEventListener("mousedown", event => {
    if (event.target === close) return;
    this.startBubbleEditorDrag(event);
  });

  ttmAdd(header, title);
  ttmAdd(header, subtitle);
  ttmAdd(header, close);

  const body = ttmMake(
    "div",
    null,
    "ttm-body window-content"
  );

  const makeInput = (
    type,
    value,
    {
      min = null,
      max = null,
      step = null
    } = {}
  ) => {
    const input = ttmMake("input");
    input.type = type;
    input.value = value;

    if (min !== null) input.min = min;
    if (max !== null) input.max = max;
    if (step !== null) input.step = step;

    return input;
  };

  const setting = (key, fallback) => {
    try {
      return game.settings.get(TTM_ID, key) ?? fallback;
    } catch {
      return fallback;
    }
  };

  const mode = ttmMake("select");
  for (const [value, label] of [
    ["generated", "Generated bubble"],
    ["custom-image", "Uploaded bubble image"]
  ]) {
    const option = ttmMake("option", label);
    option.value = value;
    ttmAdd(mode, option);
  }
  mode.value = setting(
    "bubbleStyleMode",
    "generated"
  );

  const backgroundColor = makeInput(
    "color",
    setting("bubbleBackgroundColor", "#141414")
  );
  const borderColor = makeInput(
    "color",
    setting("bubbleBorderColor", "#ffdc8c")
  );
  const textColor = makeInput(
    "color",
    setting("bubbleTextColor", "#f8f1df")
  );
  const nameColor = makeInput(
    "color",
    setting("bubbleNameColor", "#ffd98a")
  );
  const opacity = makeInput(
    "number",
    setting("bubbleOpacity", 0.96),
    { min: 0, max: 1, step: 0.05 }
  );
  const borderWidth = makeInput(
    "number",
    setting("bubbleBorderWidth", 2),
    { min: 0, max: 12, step: 1 }
  );
  const cornerRadius = makeInput(
    "number",
    setting("bubbleCornerRadius", 12),
    { min: 0, max: 80, step: 1 }
  );
  const bodyFontSize = makeInput(
    "number",
    setting("bubbleBodyFontSize", 15),
    { min: 8, max: 72, step: 1 }
  );
  const nameFontSize = makeInput(
    "number",
    setting("bubbleNameFontSize", 13),
    { min: 8, max: 72, step: 1 }
  );
  const maxWidth = makeInput(
    "number",
    setting("bubbleMaxWidth", 320),
    { min: 120, max: 1000, step: 10 }
  );
  const paddingX = makeInput(
    "number",
    setting("bubblePaddingX", 12),
    { min: 0, max: 100, step: 1 }
  );
  const paddingY = makeInput(
    "number",
    setting("bubblePaddingY", 9),
    { min: 0, max: 100, step: 1 }
  );
  const tailEnabled = this.createCheckbox(
    "ttm-bubble-tail-enabled",
    "Show generated bubble tail",
    setting("bubbleTailEnabled", true)
  );

  const customImage = makeInput(
    "text",
    setting("bubbleCustomImage", "")
  );
  customImage.placeholder =
    "modules/your-module/images/bubble.png";

  const customImageWidth = makeInput(
    "number",
    setting("bubbleCustomImageWidth", 360),
    { min: 80, max: 1600, step: 10 }
  );
  const customImageHeight = makeInput(
    "number",
    setting("bubbleCustomImageHeight", 180),
    { min: 60, max: 1200, step: 10 }
  );
  const textOffsetX = makeInput(
    "number",
    setting("bubbleTextOffsetX", 28),
    { min: 0, max: 600, step: 1 }
  );
  const textOffsetY = makeInput(
    "number",
    setting("bubbleTextOffsetY", 24),
    { min: 0, max: 600, step: 1 }
  );

  const generatedGroup = ttmMake(
    "section",
    null,
    "ttm-bubble-editor-group"
  );
  const imageGroup = ttmMake(
    "section",
    null,
    "ttm-bubble-editor-group"
  );
  const textGroup = ttmMake(
    "section",
    null,
    "ttm-bubble-editor-group"
  );

  ttmAdd(
    generatedGroup,
    this.createField(
      "Background colour",
      backgroundColor
    )
  );
  ttmAdd(
    generatedGroup,
    this.createField("Border colour", borderColor)
  );
  ttmAdd(
    generatedGroup,
    this.createField("Bubble opacity", opacity)
  );
  ttmAdd(
    generatedGroup,
    this.createField("Border width", borderWidth)
  );
  ttmAdd(
    generatedGroup,
    this.createField("Corner radius", cornerRadius)
  );
  ttmAdd(generatedGroup, tailEnabled.label);
  ttmAdd(
    generatedGroup,
    this.createField("Maximum width", maxWidth)
  );
  ttmAdd(
    generatedGroup,
    this.createField("Horizontal padding", paddingX)
  );
  ttmAdd(
    generatedGroup,
    this.createField("Vertical padding", paddingY)
  );

  ttmAdd(
    imageGroup,
    this.createImagePickerField(
      "Custom bubble PNG",
      customImage
    )
  );
  ttmAdd(
    imageGroup,
    this.createHint(
      "The uploaded image supplies the full bubble artwork. "
      + "TalkToMe prints only the speaker name and text over it—"
      + "no generated box, border, or tail."
    )
  );
  ttmAdd(
    imageGroup,
    this.createField(
      "Image display width",
      customImageWidth
    )
  );
  ttmAdd(
    imageGroup,
    this.createField(
      "Image display height",
      customImageHeight
    )
  );
  ttmAdd(
    imageGroup,
    this.createField("Text offset X", textOffsetX)
  );
  ttmAdd(
    imageGroup,
    this.createField("Text offset Y", textOffsetY)
  );

  ttmAdd(
    textGroup,
    this.createField("Speech text colour", textColor)
  );
  ttmAdd(
    textGroup,
    this.createField("Speaker name colour", nameColor)
  );
  ttmAdd(
    textGroup,
    this.createField(
      "Speech text size",
      bodyFontSize
    )
  );
  ttmAdd(
    textGroup,
    this.createField(
      "Speaker name size",
      nameFontSize
    )
  );

  const updateModeVisibility = () => {
    generatedGroup.hidden =
      mode.value !== "generated";
    imageGroup.hidden =
      mode.value !== "custom-image";
  };
  mode.addEventListener(
    "change",
    updateModeVisibility
  );
  updateModeVisibility();

  const previewName = makeInput(
    "text",
    "Mochi"
  );
  const previewText = ttmMake("textarea");
  previewText.rows = 3;
  previewText.value =
    "A preview of your enchanted speech bubble.";

  const buttons = ttmMake(
    "div",
    null,
    "ttm-button-row"
  );
  const save = ttmMake(
    "button",
    "Save Bubble Style",
    "ttm-primary"
  );
  const preview = ttmMake(
    "button",
    "Preview Above Token"
  );
  const reset = ttmMake(
    "button",
    "Restore Defaults"
  );

  const saveSettings = async () => {
    const values = {
      bubbleStyleMode: mode.value,
      bubbleBackgroundColor: backgroundColor.value,
      bubbleBorderColor: borderColor.value,
      bubbleTextColor: textColor.value,
      bubbleNameColor: nameColor.value,
      bubbleOpacity: Number(opacity.value || 0.96),
      bubbleBorderWidth: Number(
        borderWidth.value || 0
      ),
      bubbleCornerRadius: Number(
        cornerRadius.value || 0
      ),
      bubbleBodyFontSize: Number(
        bodyFontSize.value || 15
      ),
      bubbleNameFontSize: Number(
        nameFontSize.value || 13
      ),
      bubbleMaxWidth: Number(maxWidth.value || 320),
      bubblePaddingX: Number(paddingX.value || 0),
      bubblePaddingY: Number(paddingY.value || 0),
      bubbleTailEnabled: tailEnabled.input.checked,
      bubbleCustomImage: customImage.value.trim(),
      bubbleCustomImageWidth: Number(
        customImageWidth.value || 360
      ),
      bubbleCustomImageHeight: Number(
        customImageHeight.value || 180
      ),
      bubbleTextOffsetX: Number(
        textOffsetX.value || 0
      ),
      bubbleTextOffsetY: Number(
        textOffsetY.value || 0
      )
    };

    for (const [key, value] of Object.entries(values)) {
      await game.settings.set(TTM_ID, key, value);
    }
  };

  save.type = "button";
  save.addEventListener("click", async () => {
    await saveSettings();
    ui.notifications.info(
      "TalkToMe speech bubble style saved."
    );
  });

  preview.type = "button";
  preview.addEventListener("click", async () => {
    await saveSettings();

    const token =
      canvas.tokens?.controlled?.[0]
      ?? game.user?.targets?.first?.()
      ?? canvas.tokens?.placeables?.[0];

    if (!token) {
      ui.notifications.warn(
        "Select or target a token to preview the bubble."
      );
      return;
    }

    this.api.bubbles.show({
      sceneId: canvas.scene.id,
      tokenId: token.id,
      text: previewText.value
        || "Speech bubble preview",
      speakerName: previewName.value
        || token.name,
      duration: 8000,
      bubbleId:
        `ttm-bubble-style-preview.${Date.now()}`
    });
  });

  reset.type = "button";
  reset.addEventListener("click", async () => {
    const defaults = {
      bubbleStyleMode: "generated",
      bubbleBackgroundColor: "#141414",
      bubbleBorderColor: "#ffdc8c",
      bubbleTextColor: "#f8f1df",
      bubbleNameColor: "#ffd98a",
      bubbleOpacity: 0.96,
      bubbleBorderWidth: 2,
      bubbleCornerRadius: 12,
      bubbleBodyFontSize: 15,
      bubbleNameFontSize: 13,
      bubbleMaxWidth: 320,
      bubblePaddingX: 12,
      bubblePaddingY: 9,
      bubbleTailEnabled: true,
      bubbleCustomImage: "",
      bubbleCustomImageWidth: 360,
      bubbleCustomImageHeight: 180,
      bubbleTextOffsetX: 28,
      bubbleTextOffsetY: 24
    };

    for (const [key, value] of Object.entries(defaults)) {
      await game.settings.set(TTM_ID, key, value);
    }

    this.closeBubbleEditor();
    this.openBubbleEditor();
    ui.notifications.info(
      "TalkToMe bubble style restored."
    );
  });

  ttmAdd(
    body,
    this.createField("Bubble style", mode)
  );
  ttmAdd(body, generatedGroup);
  ttmAdd(body, imageGroup);
  ttmAdd(body, textGroup);
  ttmAdd(
    body,
    this.createField("Preview speaker", previewName)
  );
  ttmAdd(
    body,
    this.createField("Preview text", previewText)
  );

  ttmAdd(buttons, save);
  ttmAdd(buttons, preview);
  ttmAdd(buttons, reset);
  ttmAdd(body, buttons);

  ttmAdd(root, header);
  ttmAdd(root, body);
  document.body.appendChild(root);
  this.bubbleEditorElement = root;

  document.addEventListener(
    "mousemove",
    this.boundBubbleEditorMouseMove
  );
  document.addEventListener(
    "mouseup",
    this.boundBubbleEditorMouseUp
  );

  return true;
}

closeBubbleEditor() {
  document.removeEventListener(
    "mousemove",
    this.boundBubbleEditorMouseMove
  );
  document.removeEventListener(
    "mouseup",
    this.boundBubbleEditorMouseUp
  );

  document
    .getElementById("talk-to-me-bubble-editor-window")
    ?.remove();

  this.bubbleEditorElement = null;
  this.bubbleEditorDrag.active = false;
}

startBubbleEditorDrag(event) {
  if (!this.bubbleEditorElement) return;

  this.bubbleEditorDrag.active = true;
  this.bubbleEditorDrag.startX = event.clientX;
  this.bubbleEditorDrag.startY = event.clientY;

  const rect =
    this.bubbleEditorElement.getBoundingClientRect();
  this.bubbleEditorDrag.startLeft = rect.left;
  this.bubbleEditorDrag.startTop = rect.top;

  event.preventDefault();
}

doBubbleEditorDrag(event) {
  if (
    !this.bubbleEditorDrag.active
    || !this.bubbleEditorElement
  ) {
    return;
  }

  const left =
    this.bubbleEditorDrag.startLeft
    + event.clientX
    - this.bubbleEditorDrag.startX;
  const top =
    this.bubbleEditorDrag.startTop
    + event.clientY
    - this.bubbleEditorDrag.startY;

  this.bubbleEditorElement.style.left = `${left}px`;
  this.bubbleEditorElement.style.top = `${top}px`;
}

endBubbleEditorDrag() {
  this.bubbleEditorDrag.active = false;
}

openConversationBuilder() {
  if (!ttmIsGM()) {
    ui.notifications.warn("Conversation building is a GM tool.");
    return;
  }

  this.closeConversationBuilder();

  const root = ttmMake(
    "section",
    null,
    "ttm-app ttm-conversation-window window-app"
  );
  root.id = "talk-to-me-conversation-window";
  root.style.left = "calc(50vw - 290px)";
  root.style.top = "90px";

  const header = ttmMake(
    "header",
    null,
    "ttm-header window-header flexrow"
  );
  const title = ttmMake(
    "h4",
    "TalkToMe Conversation Builder",
    "ttm-title window-title"
  );
  const close = ttmMake("button", "×", "ttm-header-button");
  close.type = "button";
  close.addEventListener(
    "click",
    () => this.closeConversationBuilder()
  );

  header.addEventListener("mousedown", event => {
    if (event.target === close) return;
    this.startConversationDrag(event);
  });

  ttmAdd(header, title);
  ttmAdd(header, close);

  const body = ttmMake("div", null, "ttm-body window-content");

  const name = ttmMake("input");
  name.type = "text";
  name.placeholder = "Tavern Greeting";

  const image = ttmMake("input");
  image.type = "text";
  image.placeholder = "icons/svg/sound.svg";

  const trigger = ttmMake("select");
  for (const [value, label] of [
    ["enter", "Token enters tile"],
    ["exit", "Token exits tile"],
    ["switch", "Click / switch activation"],
    ["manual", "Manual only"]
  ]) {
    const option = ttmMake("option", label);
    option.value = value;
    ttmAdd(trigger, option);
  }

  const clickActivation = ttmMake("select");
  for (const [value, label] of [
    ["left", "Left click"],
    ["double-left", "Double left click"],
    ["right", "Right click"],
    ["any", "Any click"]
  ]) {
    const option = ttmMake("option", label);
    option.value = value;
    ttmAdd(clickActivation, option);
  }

  const width = ttmMake("input");
  width.type = "number";
  width.value = 120;
  width.min = 32;

  const height = ttmMake("input");
  height.type = "number";
  height.value = 120;
  height.min = 32;

  const order = ttmMake("input");
  order.type = "text";
  order.value = "1,1,2,2";
  order.placeholder = "1,1,2,2,3";

  const delay = ttmMake("input");
  delay.type = "number";
  delay.value = 3;
  delay.min = 0.25;
  delay.step = 0.25;

  const showToPlayers = this.createCheckbox(
    "ttm-conversation-show-players",
    "Show starter tile to players",
    true
  );

  const requireVision = this.createCheckbox(
    "ttm-conversation-require-vision",
    "Players require vision to activate",
    false
  );

  const multipleUseConversation = this.createCheckbox(
    "ttm-conversation-multiple-use",
    "Multiple use",
    true
  );

  const effectsEnabledEdit = this.createCheckbox(
    "ttm-edit-effects-enabled",
    "Sound & Animation",
    false
  );

  const soundEnabledEdit = this.createCheckbox(
    "ttm-edit-sound-enabled",
    "Play a sound when activated",
    false
  );
  const soundFileEdit = makeInput();
  const soundVolumeEdit = makeNumber("0.05", 0);
  soundVolumeEdit.max = 1;

  const animationEnabledEdit = this.createCheckbox(
    "ttm-edit-animation-enabled",
    "Animate the tile when activated",
    false
  );
  const animationTypeEdit = makeSelect([
    ["none", "None"],
    ["pulse", "Pulse"],
    ["shake", "Shake"],
    ["spin", "Spin"],
    ["fade", "Fade"]
  ]);
  const animationDurationEdit = makeNumber("0.05", 0.15);

  const cooldownEnabled = this.createCheckbox(
    "ttm-conversation-cooldown-enabled",
    "Enable activation cooldown",
    true
  );

  const cooldownSeconds = ttmMake("input");
  cooldownSeconds.type = "number";
  cooldownSeconds.value = 10;
  cooldownSeconds.min = 0.2;
  cooldownSeconds.step = 0.1;

  const participantRows = [];

  for (let index = 1; index <= 5; index += 1) {
    const group = ttmMake(
      "section",
      null,
      "ttm-conversation-participant"
    );
    ttmAdd(group, ttmMake("h3", `NPC ${index}`));

    const token = this.createTokenSelect(
      `ttm-conversation-token-${index}`
    );
    token.dataset.ttmTokenSelect = "true";

    const table = this.createTableSelect(
      `ttm-conversation-table-${index}`
    );

    const npcName = ttmMake("input");
    npcName.type = "text";
    npcName.placeholder = "Optional name override";

    ttmAdd(group, this.createField("Speaking NPC", token));
    ttmAdd(group, this.createField("RollTable", table));
    ttmAdd(group, this.createField("Name override", npcName));
    ttmAdd(body, group);

    participantRows.push({ token, table, npcName });
  }

  const place = ttmMake(
    "button",
    "Place Conversation Tile",
    "ttm-primary"
  );
  place.type = "button";

  place.addEventListener("click", async () => {
    const participants = participantRows
      .map(row => ({
        tokenId: row.token.value,
        tableId: row.table.value,
        npcName: row.npcName.value.trim()
      }));

    const assignedParticipants = participants.filter(
      participant => participant.tableId
    );

    if (assignedParticipants.length < 2) {
      ui.notifications.warn(
        "Assign RollTables to at least two NPCs."
      );
      return;
    }

    const speakingOrder = String(order.value ?? "")
      .split(",")
      .map(value => Number(value.trim()))
      .filter(value =>
        Number.isInteger(value)
        && value >= 1
        && value <= 5
      );

    if (!speakingOrder.length) {
      ui.notifications.warn(
        "Enter a speaking order such as 1,1,2,2."
      );
      return;
    }

    const missingSlot = speakingOrder.find(
      slot => !participants[slot - 1]?.tableId
    );

    if (missingSlot) {
      ui.notifications.warn(
        `NPC ${missingSlot} is used in the order but has no RollTable.`
      );
      return;
    }

    const placement = await this.pickTilePlacementPoint();
    if (!placement) return;

    const doc = await this.api.createSpeechTile({
      x: placement.x,
      y: placement.y,
      name: name.value.trim() || "Conversation",
      trigger: trigger.value,
      clickActivation: clickActivation.value,
      mode: "custom",
      text: "",
      template: "speech",
      tileImage: image.value.trim(),
      inactiveImage: image.value.trim(),
      hidden: !showToPlayers.input.checked,
      requirePlayerVision: requireVision.input.checked,
      hideBehindWalls: true,
      multipleUse: multipleUseConversation.input.checked,
      activationCooldownEnabled:
        cooldownEnabled.input.checked,
      activationCooldownSeconds: Math.max(
        0.2,
        Number(cooldownSeconds.value || 10)
      ),
      width: Number(width.value || 120),
      height: Number(height.value || 120),
      conversationSequenceEnabled: true,
      conversationParticipants: participants,
      conversationOrder: speakingOrder,
      conversationLineDelay: Math.max(
        0.25,
        Number(delay.value || 3)
      )
    });

    if (doc) {
      ui.notifications.info(
        `Created conversation tile: ${doc.name}.`
      );
      this.closeConversationBuilder();
    }
  });

  ttmAdd(body, this.createHint(
    "Assign up to five NPCs and RollTables. "
    + "The order uses NPC numbers, for example 1,1,2,2,3."
  ));
  ttmAdd(body, this.createField("Conversation name", name));
  ttmAdd(body, this.createImagePickerField("Starter tile image", image));
  ttmAdd(body, this.createField("Starter tile trigger", trigger));
  ttmAdd(body, this.createField("Click activation", clickActivation));
  ttmAdd(body, this.createField("Tile width", width));
  ttmAdd(body, this.createField("Tile height", height));
  ttmAdd(body, this.createField("Speaking order", order));
  ttmAdd(body, this.createField("Delay between lines (seconds)", delay));
  ttmAdd(body, showToPlayers.label);
  ttmAdd(body, requireVision.label);
  ttmAdd(body, multipleUseConversation.label);
  ttmAdd(body, cooldownEnabled.label);
  ttmAdd(body, this.createField(
    "Activation cooldown (seconds)",
    cooldownSeconds
  ));

  const participantsHeading = ttmMake(
    "h2",
    "Conversation Participants"
  );
  body.insertBefore(
    participantsHeading,
    body.querySelector(".ttm-conversation-participant")
  );

  ttmAdd(body, place);
  ttmAdd(root, header);
  ttmAdd(root, body);
  document.body.appendChild(root);

  this.conversationElement = root;
  document.addEventListener(
    "mousemove",
    this.boundConversationMouseMove
  );
  document.addEventListener(
    "mouseup",
    this.boundConversationMouseUp
  );
}

closeConversationBuilder() {
  document.removeEventListener(
    "mousemove",
    this.boundConversationMouseMove
  );
  document.removeEventListener(
    "mouseup",
    this.boundConversationMouseUp
  );

  document
    .getElementById("talk-to-me-conversation-window")
    ?.remove();

  this.conversationElement = null;
}

startConversationDrag(event) {
  if (!this.conversationElement) return;

  this.conversationDrag.active = true;
  this.conversationDrag.startX = event.clientX;
  this.conversationDrag.startY = event.clientY;

  const rect = this.conversationElement.getBoundingClientRect();
  this.conversationDrag.startLeft = rect.left;
  this.conversationDrag.startTop = rect.top;

  event.preventDefault();
}

doConversationDrag(event) {
  if (
    !this.conversationDrag.active
    || !this.conversationElement
  ) return;

  this.conversationElement.style.left =
    `${this.conversationDrag.startLeft
      + event.clientX
      - this.conversationDrag.startX}px`;

  this.conversationElement.style.top =
    `${this.conversationDrag.startTop
      + event.clientY
      - this.conversationDrag.startY}px`;
}

endConversationDrag() {
  this.conversationDrag.active = false;
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

createMovementRoutePickerField(labelText, routeInput) {
  const group = ttmMake(
    "div",
    null,
    "form-group ttm-route-picker-group"
  );
  const heading = ttmMake(
    "div",
    labelText,
    "ttm-route-picker-heading"
  );
  const status = ttmMake(
    "div",
    "No route plotted",
    "ttm-route-picker-status"
  );
  const plot = ttmMake(
    "button",
    "📏 Plot Movement Route",
    "ttm-route-action-button ttm-route-plot-button"
  );
  const clear = ttmMake(
    "button",
    "🗑 Clear Route",
    "ttm-route-action-button ttm-route-clear-button"
  );

  plot.type = "button";
  clear.type = "button";

  const readRoute = () => {
    try {
      const route = JSON.parse(routeInput.value || "[]");

      return Array.isArray(route)
        ? route
            .map(point => ({
              x: Number(point?.x),
              y: Number(point?.y)
            }))
            .filter(point =>
              Number.isFinite(point.x)
              && Number.isFinite(point.y)
            )
        : [];
    } catch {
      return [];
    }
  };

  const measureRoute = route => {
    if (route.length < 2) return 0;

    const gridSize =
      Number(canvas.grid?.size)
      || Number(canvas.scene?.grid?.size)
      || 100;
    const gridDistance =
      Number(canvas.scene?.grid?.distance)
      || 5;

    let pixels = 0;

    for (let index = 1; index < route.length; index += 1) {
      pixels += Math.hypot(
        route[index].x - route[index - 1].x,
        route[index].y - route[index - 1].y
      );
    }

    return gridSize > 0
      ? pixels / gridSize * gridDistance
      : pixels;
  };

  const refreshSummary = () => {
    const route = readRoute();
    const count = route.length;
    const distance = measureRoute(route);
    const units = canvas.scene?.grid?.units || "units";

    status.classList.toggle(
      "ttm-route-picker-status-ready",
      count > 0
    );

    status.textContent = count
      ? `✓ ${count} waypoint${count === 1 ? "" : "s"} plotted`
        + (
          count > 1
            ? ` • ${Math.round(distance * 10) / 10} ${units}`
            : ""
        )
      : "No route plotted";

    plot.textContent = count
      ? "✏ Edit Movement Route"
      : "📏 Plot Movement Route";

    clear.disabled = count === 0;
  };

  const createOverlay = () => {
    const ContainerClass = globalThis.PIXI?.Container;
    const GraphicsClass = globalThis.PIXI?.Graphics;

    if (!ContainerClass || !GraphicsClass || !canvas?.stage) {
      return null;
    }

    const container = new ContainerClass();
    container.name = "TalkToMeMovementRoutePreview";
    container.eventMode = "none";
    container.zIndex = 100000;

    const graphics = new GraphicsClass();
    container.addChild(graphics);

    const labels = new ContainerClass();
    container.addChild(labels);

    const parent =
      canvas.controls?._rulerPaths
      ?? canvas.controls
      ?? canvas.stage;

    parent.addChild(container);

    return {
      container,
      graphics,
      labels
    };
  };

  const destroyOverlay = overlay => {
    if (!overlay?.container) return;

    try {
      overlay.container.parent?.removeChild(
        overlay.container
      );
      overlay.container.destroy({
        children: true
      });
    } catch {
      // The canvas may have been torn down while plotting.
    }
  };

  const createWaypointLabel = (text, x, y) => {
    const TextClass = globalThis.PIXI?.Text;
    if (!TextClass) return null;

    const style = {
      fontFamily: "Signika, sans-serif",
      fontSize: 14,
      fontWeight: "bold",
      fill: 0xffffff,
      stroke: {
        color: 0x000000,
        width: 4
      },
      align: "center"
    };

    let label;

    try {
      label = new TextClass({
        text,
        style
      });
    } catch {
      label = new TextClass(text, {
        ...style,
        stroke: 0x000000,
        strokeThickness: 4
      });
    }

    if (label.anchor?.set) label.anchor.set(0.5);
    label.position.set(x, y);
    return label;
  };

  const drawRoutePreview = (
    overlay,
    points,
    cursorPoint = null
  ) => {
    if (!overlay) return;

    const graphics = overlay.graphics;
    graphics.clear();

    for (const child of [...overlay.labels.children]) {
      overlay.labels.removeChild(child);
      child.destroy?.();
    }

    const previewPoints = cursorPoint
      ? [...points, cursorPoint]
      : [...points];

    if (!previewPoints.length) return;

    const drawLegacyLine = () => {
      graphics.lineStyle(5, 0x49a6ff, 0.95);
      graphics.moveTo(
        previewPoints[0].x,
        previewPoints[0].y
      );

      for (let index = 1; index < previewPoints.length; index += 1) {
        graphics.lineTo(
          previewPoints[index].x,
          previewPoints[index].y
        );
      }
    };

    if (typeof graphics.lineStyle === "function") {
      drawLegacyLine();
    } else {
      graphics.moveTo(
        previewPoints[0].x,
        previewPoints[0].y
      );

      for (let index = 1; index < previewPoints.length; index += 1) {
        graphics.lineTo(
          previewPoints[index].x,
          previewPoints[index].y
        );
      }

      graphics.stroke?.({
        width: 5,
        color: 0x49a6ff,
        alpha: 0.95
      });
    }

    points.forEach((point, index) => {
      if (typeof graphics.beginFill === "function") {
        graphics.lineStyle(3, 0x000000, 1);
        graphics.beginFill(
          index === points.length - 1
            ? 0x5bd67b
            : 0x49a6ff,
          1
        );
        graphics.drawCircle(point.x, point.y, 10);
        graphics.endFill();
      } else {
        graphics.circle(point.x, point.y, 10);
        graphics.fill?.({
          color:
            index === points.length - 1
              ? 0x5bd67b
              : 0x49a6ff,
          alpha: 1
        });
        graphics.stroke?.({
          width: 3,
          color: 0x000000,
          alpha: 1
        });
      }

      const label = createWaypointLabel(
        String(index + 1),
        point.x,
        point.y - 22
      );

      if (label) overlay.labels.addChild(label);
    });

    if (points.length > 1) {
      const distance = measureRoute(points);
      const units = canvas.scene?.grid?.units || "units";
      const finalPoint = points.at(-1);
      const distanceLabel = createWaypointLabel(
        `${Math.round(distance * 10) / 10} ${units}`,
        finalPoint.x,
        finalPoint.y + 24
      );

      if (distanceLabel) {
        overlay.labels.addChild(distanceLabel);
      }
    }
  };

  clear.addEventListener("click", () => {
    routeInput.value = "[]";
    refreshSummary();
  });

  plot.addEventListener("click", () => {
    const view = canvas?.app?.view;

    if (!view || !canvas?.stage) {
      ui.notifications.warn("Canvas is not ready.");
      return;
    }

    const originalRoute = readRoute();
    const points = [...originalRoute];
    const overlay = createOverlay();
    const oldCursor = view.style.cursor;
    let cursorPoint = null;
    let finished = false;

    view.style.cursor = "crosshair";
    drawRoutePreview(overlay, points);

    ui.notifications.info(
      "Route editor active: left-click to add waypoints, "
      + "Backspace to undo, Enter or double-click to save, "
      + "and Escape to cancel."
    );

    const cleanup = () => {
      view.removeEventListener(
        "pointerdown",
        onPointerDown,
        true
      );
      view.removeEventListener(
        "pointermove",
        onPointerMove,
        true
      );
      view.removeEventListener(
        "dblclick",
        onDoubleClick,
        true
      );
      window.removeEventListener(
        "keydown",
        onKeyDown,
        true
      );
      view.style.cursor = oldCursor;
      destroyOverlay(overlay);
    };

    const finish = () => {
      if (finished) return;
      finished = true;

      if (!points.length) {
        ui.notifications.warn(
          "No movement waypoints were plotted."
        );
        cleanup();
        return;
      }

      routeInput.value = JSON.stringify(points);
      cleanup();
      refreshSummary();

      ui.notifications.info(
        `Saved ${points.length} movement waypoint`
        + `${points.length === 1 ? "" : "s"}.`
      );
    };

    const eventWorldPoint = event => {
      const rect = view.getBoundingClientRect();
      const screenPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      const worldPoint =
        canvas.stage.worldTransform.applyInverse(screenPoint);

      return {
        x: Math.round(worldPoint.x),
        y: Math.round(worldPoint.y)
      };
    };

    const onPointerMove = event => {
      cursorPoint = eventWorldPoint(event);
      drawRoutePreview(overlay, points, cursorPoint);
    };

    const onPointerDown = event => {
      if (event.button !== 0) return;

      event.preventDefault?.();
      event.stopPropagation?.();

      points.push(eventWorldPoint(event));
      drawRoutePreview(overlay, points, cursorPoint);
    };

    const onDoubleClick = event => {
      event.preventDefault?.();
      event.stopPropagation?.();

      if (!points.length) {
        points.push(eventWorldPoint(event));
      }

      finish();
    };

    const onKeyDown = event => {
      if (event.key === "Escape") {
        finished = true;
        cleanup();
        ui.notifications.info(
          "Movement route editing cancelled."
        );
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        points.pop();
        drawRoutePreview(overlay, points, cursorPoint);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        finish();
      }
    };

    view.addEventListener(
      "pointerdown",
      onPointerDown,
      true
    );
    view.addEventListener(
      "pointermove",
      onPointerMove,
      true
    );
    view.addEventListener(
      "dblclick",
      onDoubleClick,
      true
    );
    window.addEventListener("keydown", onKeyDown, true);
  });

  routeInput.type = "hidden";
  refreshSummary();

  ttmAdd(group, heading);
  ttmAdd(group, status);
  ttmAdd(group, plot);
  ttmAdd(group, clear);
  ttmAdd(group, routeInput);

  group.refreshRouteSummary = refreshSummary;
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

  // Create tile options
  createTilesPanel() {
    const panel = ttmMake("section", null, "ttm-panel");

    const tileMenuControls = ttmMake(
      "div",
      null,
      "ttm-tile-menu-controls"
    );

    const openEditor = ttmMake(
      "button",
      "Edit Tiles",
      "ttm-wide-menu-button"
    );
    openEditor.type = "button";
    openEditor.addEventListener(
      "click",
      () => this.openTileEditor()
    );

    const openManager = ttmMake(
      "button",
      "Open Tile Manager",
      "ttm-wide-menu-button"
    );
    openManager.type = "button";
    openManager.addEventListener(
      "click",
      () => this.openTileManager()
    );

    ttmAdd(tileMenuControls, openEditor);
    ttmAdd(tileMenuControls, openManager);
    ttmAdd(panel, tileMenuControls);
    panel.dataset.panel = "tiles";
    panel.hidden = this.activeTab !== "tiles";

    const template = ttmMake("select");
    template.id = "ttm-tile-template";
    for (const [value, label] of [
      ["speech", "Speech Bubble"],
      ["switch", "Switch Activation"],
      ["light", "Environment: Ambient Light"],
      ["globalLight", "Environment: Global Lighting"],
      ["trap", "Trap Activation"],
      ["teleport", "Teleport Activation"],
      ["moveTokens", "Move Tokens"],
      ["spawnTokens", "Spawn Tokens"],
      ["reset", "Create Reset Tile"]
    ]) {
      const opt = ttmMake("option", label);
      opt.value = value;
      ttmAdd(template, opt);
    }

    const trapType = ttmMake("select");
    trapType.id = "ttm-trap-type";
    for (const [value, label] of [
      ["mundane", "Mundane"],
      ["magical", "Magical"]
    ]) {
      const option = ttmMake("option", label);
      option.value = value;
      ttmAdd(trapType, option);
    }

    const mundaneTrapType = ttmMake("select");
    mundaneTrapType.id = "ttm-mundane-trap-type";
    for (const [value, label] of [
      ["projectile", "Projectile"],
      ["foothold", "Foothold"],
      ["elevation", "Elevation"],
      ["environment", "Environment"]
    ]) {
      const option = ttmMake("option", label);
      option.value = value;
      ttmAdd(mundaneTrapType, option);
    }

    const trapDelaySeconds = ttmMake("input");
    trapDelaySeconds.type = "number";
    trapDelaySeconds.min = "0";
    trapDelaySeconds.step = "0.1";
    trapDelaySeconds.value = "0";

    const trapTriggerChance = ttmMake("input");
    trapTriggerChance.type = "number";
    trapTriggerChance.min = "0";
    trapTriggerChance.max = "100";
    trapTriggerChance.step = "1";
    trapTriggerChance.value = "100";

    const trapTriggerOnce = this.createCheckbox(
      "ttm-trap-trigger-once",
      "Trigger only once",
      false
    );
    const trapDisableAfterTrigger = this.createCheckbox(
      "ttm-trap-disable-after-trigger",
      "Disable after activation",
      false
    );
    const trapPauseGame = this.createCheckbox(
      "ttm-trap-pause-game",
      "Pause game when triggered",
      false
    );

    const tableSelect = this.createTableSelect("ttm-tile-table");
    const subjectToken = this.createTokenSelect("ttm-tile-subject-token");
    subjectToken.dataset.ttmTokenSelect = "true";

    const magicCasterToken = this.createTokenSelect(
      "ttm-magic-caster-token"
    );
    const magicSpellItem = ttmMake("select");
    const magicActivity = ttmMake("select");
    magicActivity.hidden = true;
    const magicTargetMode = ttmMake("select");
    for (const [value, label] of [
      ["none", "No automatic targets"],
      ["triggering-token", "Triggering token"],
      ["tokens-within-tile", "Tokens inside tile"],
      ["current-targets", "Current user targets"],
      ["selected-tokens", "Currently selected tokens"],
      ["player-tokens", "All player-owned tokens"],
      ["npc-tokens", "All NPC tokens"],
      ["template", "Tokens inside spell template"]
    ]) {
      const option = ttmMake("option", label);
      option.value = value;
      ttmAdd(magicTargetMode, option);
    }

    const magicTemplateType = ttmMake("select");
    for (const [value, label] of [
      ["none", "No automatic template"],
      ["circle", "Circle"],
      ["cone", "Cone"],
      ["ray", "Ray"],
      ["rect", "Rectangle"]
    ]) {
      const option = ttmMake("option", label);
      option.value = value;
      ttmAdd(magicTemplateType, option);
    }

    const magicTemplateOrigin = ttmMake("select");
    for (const [value, label] of [
      ["tile", "Tile centre"],
      ["caster", "Caster token"],
      ["triggering-token", "Triggering token"],
      ["custom", "Custom canvas point"]
    ]) {
      const option = ttmMake("option", label);
      option.value = value;
      ttmAdd(magicTemplateOrigin, option);
    }

    const magicTemplateX = ttmMake("input");
    magicTemplateX.type = "number";
    const magicTemplateY = ttmMake("input");
    magicTemplateY.type = "number";
    const magicTemplateDistance = ttmMake("input");
    magicTemplateDistance.type = "number";
    magicTemplateDistance.min = 0;
    magicTemplateDistance.value = 20;
    const magicTemplateAngle = ttmMake("input");
    magicTemplateAngle.type = "number";
    magicTemplateAngle.value = 90;
    const magicTemplateWidth = ttmMake("input");
    magicTemplateWidth.type = "number";
    magicTemplateWidth.min = 0;
    magicTemplateWidth.value = 5;
    const magicTemplateDirection = ttmMake("input");
    magicTemplateDirection.type = "number";
    magicTemplateDirection.value = 0;

    const magicCastLevel = ttmMake("select");
    for (const [value, label] of [
      ["auto", "Use spell's normal level"],
      ["0", "Cantrip"],
      ["1", "1st level"],
      ["2", "2nd level"],
      ["3", "3rd level"],
      ["4", "4th level"],
      ["5", "5th level"],
      ["6", "6th level"],
      ["7", "7th level"],
      ["8", "8th level"],
      ["9", "9th level"]
    ]) {
      const option = ttmMake("option", label);
      option.value = value;
      ttmAdd(magicCastLevel, option);
    }

    const magicConsumeSlot = this.createCheckbox(
      "ttm-magic-consume-slot",
      "Consume spell slot or resource",
      true
    );
    const magicConfigureDialog = this.createCheckbox(
      "ttm-magic-configure-dialog",
      "Show D&D5e casting dialog",
      false
    );
    const magicAutoCast = this.createCheckbox(
      "ttm-magic-auto-cast",
      "Cast automatically without confirmation",
      true
    );

    const syncMagicCastMode = source => {
      if (source === "auto" && magicAutoCast.input.checked) {
        magicConfigureDialog.input.checked = false;
      }

      if (
        source === "dialog"
        && magicConfigureDialog.input.checked
      ) {
        magicAutoCast.input.checked = false;
      }
    };

    magicAutoCast.input.addEventListener(
      "change",
      () => syncMagicCastMode("auto")
    );
    magicConfigureDialog.input.addEventListener(
      "change",
      () => syncMagicCastMode("dialog")
    );
    const magicTemplateDetectedStatus = ttmMake(
      "p",
      "Choose a spell to detect its configured area.",
      "notes ttm-magic-template-status"
    );

    const getMagicActivities = spell => {
      const activities = spell?.system?.activities;
      if (!activities) return [];
      if (typeof activities.values === "function") {
        return Array.from(activities.values());
      }
      if (Array.isArray(activities)) return activities;
      return Object.values(activities);
    };

    const resetMagicSelect = (select, label) => {
      select.replaceChildren();
      const option = ttmMake("option", label);
      option.value = "";
      ttmAdd(select, option);
    };

    const refreshMagicActivities = () => {
      resetMagicSelect(
        magicActivity,
        "— Choose a spell Activity —"
      );

      const token = canvas.tokens?.get(
        magicCasterToken.value
      );
      const spell = token?.actor?.items?.get(
        magicSpellItem.value
      );

      for (const activity of getMagicActivities(spell)) {
        const option = ttmMake(
          "option",
          activity.name
            ?? activity.label
            ?? activity.type
            ?? "Spell Activity"
        );
        option.value = activity.id ?? activity._id ?? "";
        ttmAdd(magicActivity, option);
      }
    };

    const refreshMagicSpells = () => {
      resetMagicSelect(
        magicSpellItem,
        "— Choose an Actor spell —"
      );
      resetMagicSelect(
        magicActivity,
        "— Choose a spell Activity —"
      );

      const token = canvas.tokens?.get(
        magicCasterToken.value
      );

      const spells = Array.from(token?.actor?.items ?? [])
        .filter(item => item.type === "spell")
        .sort((left, right) =>
          left.name.localeCompare(right.name)
        );

      for (const spell of spells) {
        const option = ttmMake("option", spell.name);
        option.value = spell.id;
        ttmAdd(magicSpellItem, option);
      }
    };

    magicCasterToken.addEventListener(
      "change",
      refreshMagicSpells
    );
    magicSpellItem.addEventListener(
      "change",
      () => {
        refreshMagicActivities();

        const token = canvas.tokens?.get(
          magicCasterToken.value
        );
        const spell = token?.actor?.items?.get(
          magicSpellItem.value
        );

        this.applyDetectedSpellTemplate({
          spell,
          typeInput: magicTemplateType,
          distanceInput: magicTemplateDistance,
          angleInput: magicTemplateAngle,
          widthInput: magicTemplateWidth,
          statusElement: magicTemplateDetectedStatus
        });
      }
    );

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

    const behaviourToggles = {
      speech: this.createCheckbox(
        "ttm-enable-speech-behaviour",
        "Enable Speech behaviour",
        false
      ),
      switch: this.createCheckbox(
        "ttm-enable-switch-behaviour",
        "Enable Switch behaviour",
        false
      ),
      light: this.createCheckbox(
        "ttm-enable-light-behaviour",
        "Enable Ambient Light behaviour",
        false
      ),
      globalLight: this.createCheckbox(
        "ttm-enable-global-light-behaviour",
        "Enable Global Lighting behaviour",
        false
      ),
      trap: this.createCheckbox(
        "ttm-enable-trap-behaviour",
        "Enable Trap behaviour",
        false
      ),
      teleport: this.createCheckbox(
        "ttm-enable-teleport-behaviour",
        "Enable Teleport behaviour",
        false
      ),
      moveTokens: this.createCheckbox(
        "ttm-enable-move-behaviour",
        "Enable Move Tokens behaviour",
        false
      ),
      spawnTokens: this.createCheckbox(
        "ttm-enable-spawn-behaviour",
        "Enable Spawn Tokens behaviour",
        false
      ),
      magic: this.createCheckbox(
        "ttm-enable-magic-behaviour",
        "Enable Cast Spell behaviour",
        false
      ),
      reset: this.createCheckbox(
        "ttm-enable-reset-behaviour",
        "Enable Reset behaviour",
        false
      )
    };

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
    for (const [value, label] of [
      ["table", "Roll from table"],
      ["custom", "Use custom text"],
      ["conversation-sequence", "Conversation sequence"],
      ["conversation-advanced", "Advanced conversation"]
    ]) {
      const opt = ttmMake("option", label);
      opt.value = value;
      ttmAdd(mode, opt);
    }

    const text = ttmMake("textarea");
    text.rows = 3;
    text.placeholder = "Custom speech for this tile.";

    const conversationEnabled = this.createCheckbox(
      "ttm-conversation-enabled",
      "Use conversation chain",
      false
    );
    const conversationId = ttmMake("input");
    conversationId.type = "text";
    conversationId.placeholder = "e.g. tavern-greeting";
    const conversationStart = this.createCheckbox(
      "ttm-conversation-start",
      "This NPC starts the conversation",
      false
    );
    const conversationStartNode = ttmMake("input");
    conversationStartNode.type = "text";
    conversationStartNode.value = "start";
    const conversationNextTileId = ttmMake("input");
    conversationNextTileId.type = "text";
    conversationNextTileId.placeholder = "Tile for the next speaker";

    const conversationOrder = ttmMake("input");
    conversationOrder.type = "text";
    conversationOrder.value = "1,1,2,2";
    conversationOrder.placeholder = "1,1,2,2,3";

    const conversationLineDelay = ttmMake("input");
    conversationLineDelay.type = "number";
    conversationLineDelay.value = 3;
    conversationLineDelay.min = 0.25;
    conversationLineDelay.step = 0.25;

    const conversationParticipantInputs = [];

    for (let index = 1; index <= 5; index += 1) {
      const token = this.createTokenSelect(
        `ttm-tile-conversation-token-${index}`
      );
      token.dataset.ttmTokenSelect = "true";

      const table = this.createTableSelect(
        `ttm-tile-conversation-table-${index}`
      );

      const npcName = ttmMake("input");
      npcName.type = "text";
      npcName.placeholder = "Optional name override";

      conversationParticipantInputs.push({
        slot: index,
        token,
        table,
        npcName
      });
    }

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

    const globalLightInactiveImage = ttmMake("input");
    globalLightInactiveImage.type = "text";
    globalLightInactiveImage.placeholder =
      "Global lighting idle/default image path";

    const globalLightActiveImage = ttmMake("input");
    globalLightActiveImage.type = "text";
    globalLightActiveImage.placeholder =
      "Global lighting active image path";

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

    const globalLightAction = ttmMake("select");
    for (const [value, label] of [
      ["on", "Fade to Day"],
      ["off", "Fade to Night"],
      ["toggle", "Toggle Day / Night"],
      ["set-darkness", "Set Darkness Level"],
      ["restore", "Restore Original Lighting"]
    ]) {
      const option = ttmMake("option", label);
      option.value = value;
      ttmAdd(globalLightAction, option);
    }

    const globalDarkness = ttmMake("input");
    globalDarkness.type = "number";
    globalDarkness.min = 0;
    globalDarkness.max = 1;
    globalDarkness.step = 0.05;
    globalDarkness.value = 0.75;

    const globalLightColorOverride = this.createCheckbox(
      "ttm-global-light-colour-override",
      "Override global light colour",
      false
    );

    const globalLightColor = ttmMake("input");
    globalLightColor.type = "text";
    globalLightColor.value = "#ffffff";

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

    const moveTargetMode = ttmMake("select");
    for (const [value, label] of [
      ["triggering-token", "Triggering Token"],
      ["tokens-within-tile", "Tokens Within Tile"],
      ["selected-tokens", "Currently Selected Tokens"],
      ["specific-npcs", "Specific NPCs"],
      ["player-tokens", "All Player-Owned Tokens"]
    ]) {
      const option = ttmMake("option", label);
      option.value = value;
      ttmAdd(moveTargetMode, option);
    }

    const moveNpcTokens = this.createTokenMultiSelect(
      "ttm-move-specific-npcs"
    );

    const moveRoute = ttmMake("input");
    moveRoute.value = "[]";

    const moveDestinationX = ttmMake("input");
    moveDestinationX.type = "number";
    moveDestinationX.placeholder = "Destination X";

    const moveDestinationY = ttmMake("input");
    moveDestinationY.type = "number";
    moveDestinationY.placeholder = "Destination Y";

    const moveOffsetX = ttmMake("input");
    moveOffsetX.type = "number";
    moveOffsetX.value = 0;

    const moveOffsetY = ttmMake("input");
    moveOffsetY.type = "number";
    moveOffsetY.value = 0;

    const moveSpacing = ttmMake("input");
    moveSpacing.type = "number";
    moveSpacing.min = 0;
    moveSpacing.value = canvas.grid?.size ?? 100;

    const moveAutoRotate = this.createCheckbox(
      "ttm-move-auto-rotate",
      "Rotate NPCs to face movement direction",
      false
    );

    const spawnActor = this.createActorSelect("ttm-spawn-actor");
    const spawnInactiveImage = ttmMake("input");
    spawnInactiveImage.type = "text";
    spawnInactiveImage.placeholder =
      "Spawner ready/default image path";

    const spawnActiveImage = ttmMake("input");
    spawnActiveImage.type = "text";
    spawnActiveImage.placeholder =
      "Spawner activated image path";

    const spawnQuantity = ttmMake("input");
    spawnQuantity.type = "number";
    spawnQuantity.min = 1;
    spawnQuantity.max = 50;
    spawnQuantity.step = 1;
    spawnQuantity.value = 1;

    const spawnX = ttmMake("input");
    spawnX.type = "number";
    const spawnY = ttmMake("input");
    spawnY.type = "number";

    const spawnFormation = ttmMake("select");
    for (const [value, label] of [
      ["single", "Single point"],
      ["grid", "Grid"],
      ["circle", "Circle"],
      ["random", "Random area"]
    ]) {
      const option = ttmMake("option", label);
      option.value = value;
      ttmAdd(spawnFormation, option);
    }
    spawnFormation.value = "grid";

    const spawnSpacing = ttmMake("input");
    spawnSpacing.type = "number";
    spawnSpacing.min = 0;
    spawnSpacing.value = canvas.grid?.size ?? 100;

    const spawnHidden = this.createCheckbox(
      "ttm-spawn-hidden",
      "Spawn tokens hidden",
      false
    );
    const spawnRemoveOnReset = this.createCheckbox(
      "ttm-spawn-remove-on-reset",
      "Remove spawned tokens when reset",
      true
    );

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
    const activationCooldownEnabled = this.createCheckbox(
      "ttm-activation-cooldown-enabled",
      "Enable activation cooldown",
      false
    );
    const multipleUse = this.createCheckbox(
      "ttm-multiple-use",
      "Multiple use",
      true
    );

    const activationAudience =
      this.createActivationAudienceSelect(
        "ttm-activation-audience"
      );

    const effectsEnabled = this.createCheckbox(
      "ttm-effects-enabled",
      "Sound & Animation",
      false
    );

    const soundEnabled = this.createCheckbox(
      "ttm-sound-enabled",
      "Play a sound when activated",
      false
    );
    const soundFile = ttmMake("input");
    soundFile.type = "text";
    soundFile.placeholder = "Audio file path";

    const soundVolume = ttmMake("input");
    soundVolume.type = "number";
    soundVolume.min = 0;
    soundVolume.max = 1;
    soundVolume.step = 0.05;
    soundVolume.value = 0.8;

    const animationEnabled = this.createCheckbox(
      "ttm-animation-enabled",
      "Animate the tile when activated",
      false
    );
    const animationType = ttmMake("select");
    for (const [value, label] of [
      ["none", "None"],
      ["pulse", "Pulse"],
      ["shake", "Shake"],
      ["spin", "Spin"],
      ["fade", "Fade"]
    ]) {
      const option = ttmMake("option", label);
      option.value = value;
      ttmAdd(animationType, option);
    }

    const animationDuration = ttmMake("input");
    animationDuration.type = "number";
    animationDuration.min = 0.15;
    animationDuration.step = 0.05;
    animationDuration.value = 0.7;

    const activationCooldownSeconds = ttmMake("input");
    activationCooldownSeconds.id = "ttm-activation-cooldown-seconds";
    activationCooldownSeconds.type = "number";
    activationCooldownSeconds.value = 1;
    activationCooldownSeconds.min = 0.2;
    activationCooldownSeconds.step = 0.1;
    const postChat = this.createCheckbox("ttm-tile-post-chat", "Tile also posts to chat", game.settings.get(TTM_ID, "postChatByDefault"));
    const zoomToSpeaker = this.createCheckbox(
      "ttm-tile-zoom",
      "Pan/zoom to speaking NPC",
      false
    );
    const typingAnimation = this.createCheckbox(
      "ttm-tile-typing-animation",
      "Typing animation",
      false
    );

    const makeGroup = (title, templates) => {
      const group = ttmMake("section", null, "ttm-template-group");
      group.dataset.templates = templates.join(",");
      group.dataset.groupTitle = title;
      return group;
    };

    const basicGroup = makeGroup("Basic Tile Setup", ["speech", "switch", "light", "globalLight", "trap", "teleport", "moveTokens", "spawnTokens", "reset"]);
    ttmAdd(basicGroup, this.createField("Template", template));
    ttmAdd(basicGroup, this.createField("Tile name", name));
    ttmAdd(basicGroup, this.createField("Trigger", trigger));
    ttmAdd(basicGroup, this.createField("Width", width));
    ttmAdd(basicGroup, this.createField("Height", height));
    ttmAdd(basicGroup, showToPlayers.label);
    ttmAdd(basicGroup, requirePlayerVision.label);
    ttmAdd(basicGroup, hideBehindWalls.label);
    ttmAdd(basicGroup, multipleUse.label);
    ttmAdd(
      basicGroup,
      this.createField(
        "Who can activate this tile?",
        activationAudience
      )
    );
    ttmAdd(basicGroup, activationCooldownEnabled.label);
    ttmAdd(
      basicGroup,
      this.createField("Pause after activation (seconds)", activationCooldownSeconds)
    );
    const clickActivationBasicField = this.createField(
      "Click activation",
      clickActivation
    );
    clickActivationBasicField.dataset.triggerOnly = "switch";
    ttmAdd(basicGroup, clickActivationBasicField);

    const effectsGroup = makeGroup(
      "Sound & Animation",
      [
        "speech",
        "switch",
        "light",
        "globalLight",
        "trap",
        "teleport",
        "moveTokens",
        "spawnTokens",
        "reset"
      ]
    );
    ttmAdd(effectsGroup, effectsEnabled.label);
    ttmAdd(effectsGroup, soundEnabled.label);
    ttmAdd(
      effectsGroup,
      this.createAudioPickerField(
        "Activation sound",
        soundFile
      )
    );
    ttmAdd(
      effectsGroup,
      this.createField("Sound volume (0-1)", soundVolume)
    );
    ttmAdd(effectsGroup, animationEnabled.label);
    ttmAdd(
      effectsGroup,
      this.createField("Tile animation", animationType)
    );
    ttmAdd(
      effectsGroup,
      this.createField(
        "Animation duration (seconds)",
        animationDuration
      )
    );
    ttmAdd(
      effectsGroup,
      this.createHint(
        "Sounds and animations play for the GM and connected players."
      )
    );

    const speechGroup = makeGroup("Speech Bubble Options", ["speech"]);
    ttmAdd(speechGroup, behaviourToggles.speech.label);
    ttmAdd(speechGroup, this.createImagePickerField("Speech tile image", tileImage));
    ttmAdd(speechGroup, this.createField("Speech source", mode));

    const standardSpeechGroup = ttmMake(
      "section",
      null,
      "ttm-speech-source-group"
    );
    standardSpeechGroup.dataset.speechSources = "table,custom,conversation-advanced";
    ttmAdd(standardSpeechGroup, this.createField("Speaking NPC token", subjectToken));
    ttmAdd(standardSpeechGroup, this.createField("NPC chat name override", npc));

    const rollTableField = this.createField("RollTable", tableSelect);
    rollTableField.dataset.speechSourceOnly = "table,conversation-advanced";
    ttmAdd(standardSpeechGroup, rollTableField);

    const customTextField = this.createField("Custom speech", text);
    customTextField.dataset.speechSourceOnly = "custom";
    ttmAdd(standardSpeechGroup, customTextField);

    const sequenceSpeechGroup = ttmMake(
      "section",
      null,
      "ttm-speech-source-group"
    );
    sequenceSpeechGroup.dataset.speechSources = "conversation-sequence";
    ttmAdd(sequenceSpeechGroup, ttmMake("h3", "Conversation Sequence"));
    ttmAdd(
      sequenceSpeechGroup,
      this.createField("Speaking order", conversationOrder)
    );
    ttmAdd(
      sequenceSpeechGroup,
      this.createField(
        "Delay between lines (seconds)",
        conversationLineDelay
      )
    );

    for (const participant of conversationParticipantInputs) {
      const participantGroup = ttmMake(
        "section",
        null,
        "ttm-conversation-participant"
      );
      ttmAdd(
        participantGroup,
        ttmMake("h4", `NPC ${participant.slot}`)
      );
      ttmAdd(
        participantGroup,
        this.createField("Speaking NPC", participant.token)
      );
      ttmAdd(
        participantGroup,
        this.createField("RollTable", participant.table)
      );
      ttmAdd(
        participantGroup,
        this.createField("Name override", participant.npcName)
      );
      ttmAdd(sequenceSpeechGroup, participantGroup);
    }

    ttmAdd(
      sequenceSpeechGroup,
      this.createHint(
        "Use NPC numbers for the order, for example 1,1,2,2,3."
      )
    );

    const advancedSpeechGroup = ttmMake(
      "section",
      null,
      "ttm-speech-source-group"
    );
    advancedSpeechGroup.dataset.speechSources = "conversation-advanced";
    ttmAdd(advancedSpeechGroup, ttmMake("h3", "Advanced Conversation"));
    ttmAdd(advancedSpeechGroup, this.createField("Conversation ID", conversationId));
    ttmAdd(advancedSpeechGroup, conversationStart.label);
    ttmAdd(
      advancedSpeechGroup,
      this.createField("Starting node", conversationStartNode)
    );
    ttmAdd(
      advancedSpeechGroup,
      this.createTilePickerField(
        "Next speaker tile",
        conversationNextTileId
      )
    );
    ttmAdd(
      advancedSpeechGroup,
      this.createHint(
        "Result format: [[node:start|next:reply-1]] Spoken text."
      )
    );

    ttmAdd(speechGroup, standardSpeechGroup);
    ttmAdd(speechGroup, sequenceSpeechGroup);
    ttmAdd(speechGroup, advancedSpeechGroup);
    ttmAdd(speechGroup, postChat.label);
    ttmAdd(speechGroup, zoomToSpeaker.label);
    ttmAdd(speechGroup, typingAnimation.label);

    const switchGroup = makeGroup("Switch Options", ["switch"]);
    ttmAdd(switchGroup, behaviourToggles.switch.label);
    ttmAdd(switchGroup, this.createImagePickerField("Inactive/default image", inactiveImage));
    ttmAdd(switchGroup, this.createImagePickerField("Active image", activeImage));
    ttmAdd(switchGroup, this.createWallPickerField("Door wall id", doorWallId));
    ttmAdd(switchGroup, this.createField("Door action", doorAction));
    ttmAdd(switchGroup, this.createTilePickerField("Linked tile ID", targetTileId));

    const lightGroup = makeGroup("Light Options", ["light"]);
    ttmAdd(lightGroup, behaviourToggles.light.label);
    ttmAdd(lightGroup, this.createField("Light dim radius", lightDim));
    ttmAdd(lightGroup, this.createField("Light bright radius", lightBright));
    ttmAdd(lightGroup, this.createColourPickerField("Light colour", lightColor));
    ttmAdd(lightGroup, this.createField("Light alpha", lightAlpha));
    ttmAdd(lightGroup, this.createImagePickerField("Inactive/default image", lightInactiveImage));
    ttmAdd(lightGroup, this.createImagePickerField("Active image", lightActiveImage));

    const globalLightGroup = makeGroup(
      "Environment: Global Lighting",
      ["globalLight"]
    );
    ttmAdd(globalLightGroup, behaviourToggles.globalLight.label);
    ttmAdd(globalLightGroup, this.createField("Action", globalLightAction));
    ttmAdd(globalLightGroup, this.createField("Darkness level (0-1)", globalDarkness));
    ttmAdd(globalLightGroup, globalLightColorOverride.label);
    ttmAdd(globalLightGroup, this.createColourPickerField("Global light colour", globalLightColor));
    ttmAdd(
      globalLightGroup,
      this.createImagePickerField(
        "Inactive/default tile image",
        globalLightInactiveImage
      )
    );
    ttmAdd(
      globalLightGroup,
      this.createImagePickerField(
        "Active tile image",
        globalLightActiveImage
      )
    );
    ttmAdd(globalLightGroup, this.createHint(
      "Global Lighting changes the scene darkness exactly like Foundry's Day and Night buttons. The GM and all players receive the same gradual transition. Global Illumination remains controlled by the scene settings."
    ));

    const trapTypeField = this.createField(
      "Trap type",
      trapType
    );

    const generalTrapGroup = makeGroup(
      "General Trap Settings",
      ["trap"]
    );
    ttmAdd(
      generalTrapGroup,
      this.createField("Delay before activation (seconds)", trapDelaySeconds)
    );
    ttmAdd(
      generalTrapGroup,
      this.createField("Trigger chance (%)", trapTriggerChance)
    );
    ttmAdd(generalTrapGroup, trapTriggerOnce.label);
    ttmAdd(generalTrapGroup, trapDisableAfterTrigger.label);
    ttmAdd(generalTrapGroup, trapPauseGame.label);
    ttmAdd(
      generalTrapGroup,
      this.createHint(
        "These settings apply to every Mundane and Magical trap type."
      )
    );

    const trapGroup = makeGroup("Mundane Trap Options", ["trap"]);
    trapGroup.dataset.trapTypeOnly = "mundane";
    ttmAdd(
      trapGroup,
      this.createField("Mundane trap type", mundaneTrapType)
    );
    ttmAdd(trapGroup, this.createField("Target", trapTarget));
    ttmAdd(trapGroup, this.createField("Trap save ability", saveAbility));
    ttmAdd(trapGroup, this.createField("Trap save DC", saveDC));
    ttmAdd(trapGroup, this.createTilePickerField("Trigger another tile", linkedTriggerTileId));
    ttmAdd(trapGroup, this.createImagePickerField("Inactive/default image", trapInactiveImage));
    ttmAdd(trapGroup, this.createImagePickerField("Active image", trapActiveImage));

    const moveTokensGroup = makeGroup(
      "Move Tokens Options",
      ["moveTokens"]
    );
    ttmAdd(moveTokensGroup, behaviourToggles.moveTokens.label);
    ttmAdd(
      moveTokensGroup,
      this.createField("Tokens to move", moveTargetMode)
    );

    const moveNpcTokensField = this.createField(
      "NPCs to move",
      moveNpcTokens
    );
    moveNpcTokensField.hidden = true;
    ttmAdd(moveTokensGroup, moveNpcTokensField);

    const moveRouteField =
      this.createMovementRoutePickerField(
        "Movement route",
        moveRoute
      );
    ttmAdd(moveTokensGroup, moveRouteField);
    ttmAdd(
      moveTokensGroup,
      this.createCanvasPointPickerField(
        "Fallback destination",
        moveDestinationX,
        moveDestinationY
      )
    );
    ttmAdd(
      moveTokensGroup,
      this.createField("Destination offset X", moveOffsetX)
    );
    ttmAdd(
      moveTokensGroup,
      this.createField("Destination offset Y", moveOffsetY)
    );
    ttmAdd(
      moveTokensGroup,
      this.createField("Formation spacing", moveSpacing)
    );
    ttmAdd(moveTokensGroup, moveAutoRotate.label);
    ttmAdd(
      moveTokensGroup,
      this.createHint(
        "Tokens move with Foundry's normal animation. Multiple tokens are arranged around the destination."
      )
    );

    const updateMoveNpcVisibility = () => {
      const useSpecificNpcs =
        moveTargetMode.value === "specific-npcs";

      moveNpcTokensField.hidden = !useSpecificNpcs;
      moveNpcTokens.disabled = !useSpecificNpcs;
    };

    moveTargetMode.addEventListener(
      "change",
      updateMoveNpcVisibility
    );
    updateMoveNpcVisibility();

    const spawnTokensGroup = makeGroup(
      "Spawn Tokens Options",
      ["spawnTokens"]
    );
    ttmAdd(spawnTokensGroup, behaviourToggles.spawnTokens.label);
    ttmAdd(
      spawnTokensGroup,
      this.createImagePickerField(
        "Inactive/default tile image",
        spawnInactiveImage
      )
    );
    ttmAdd(
      spawnTokensGroup,
      this.createImagePickerField(
        "Active tile image",
        spawnActiveImage
      )
    );
    ttmAdd(spawnTokensGroup, this.createField("Actor to spawn", spawnActor));
    ttmAdd(spawnTokensGroup, this.createField("Quantity", spawnQuantity));
    ttmAdd(
      spawnTokensGroup,
      this.createCanvasPointPickerField("Spawn location", spawnX, spawnY)
    );
    ttmAdd(spawnTokensGroup, this.createField("Formation", spawnFormation));
    ttmAdd(spawnTokensGroup, this.createField("Spacing (pixels)", spawnSpacing));
    ttmAdd(spawnTokensGroup, spawnHidden.label);
    ttmAdd(spawnTokensGroup, spawnRemoveOnReset.label);
    ttmAdd(
      spawnTokensGroup,
      this.createHint(
        "Tokens use the selected Actor's prototype token. Node Editor, cooldown, and single-use controls work normally."
      )
    );

    const teleportGroup = makeGroup("Teleport Options", ["teleport"]);
    ttmAdd(teleportGroup, behaviourToggles.teleport.label);
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
  ttmAdd(teleportGroup, teleportCreateReturn.label);
    ttmAdd(teleportGroup, this.createHint("Advanced: create a matching return tile at the teleport destination."));
    ttmAdd(teleportGroup, teleportCreateReturn.label);
    ttmAdd(teleportGroup, this.createImagePickerField("Inactive/default image", teleportInactiveImage));
    ttmAdd(teleportGroup, this.createImagePickerField("Active image", teleportActiveImage));

    const magicGroup = makeGroup(
      "Magical Trap Options",
      ["trap"]
    );
    magicGroup.dataset.trapTypeOnly = "magical";
    ttmAdd(
      magicGroup,
      this.createField("Caster token", magicCasterToken)
    );
    ttmAdd(
      magicGroup,
      this.createField("Spell", magicSpellItem)
    );
    ttmAdd(
      magicGroup,
      this.createField("Cast at level", magicCastLevel)
    );
    ttmAdd(magicGroup, magicConsumeSlot.label);
    ttmAdd(magicGroup, magicAutoCast.label);
    ttmAdd(magicGroup, magicConfigureDialog.label);
    ttmAdd(magicGroup, magicTemplateDetectedStatus);
    ttmAdd(
      magicGroup,
      this.createField("Automatic targets", magicTargetMode)
    );
    ttmAdd(
      magicGroup,
      this.createField("Spell template", magicTemplateType)
    );
    ttmAdd(
      magicGroup,
      this.createField("Template origin", magicTemplateOrigin)
    );
    ttmAdd(
      magicGroup,
      this.createCanvasPointPickerField(
        "Custom template point",
        magicTemplateX,
        magicTemplateY
      )
    );
    ttmAdd(
      magicGroup,
      this.createField("Template distance", magicTemplateDistance)
    );
    ttmAdd(
      magicGroup,
      this.createField("Cone angle", magicTemplateAngle)
    );
    ttmAdd(
      magicGroup,
      this.createField("Ray/rectangle width", magicTemplateWidth)
    );
    ttmAdd(
      magicGroup,
      this.createField("Direction (degrees)", magicTemplateDirection)
    );
    const previewMagicTemplate = ttmMake(
      "button",
      "Preview Spell Template Blueprint",
      "ttm-primary"
    );
    previewMagicTemplate.type = "button";
    previewMagicTemplate.addEventListener("click", () =>
      this.previewSpellTemplateBlueprint({
        type: magicTemplateType.value,
        origin: magicTemplateOrigin.value,
        customX: magicTemplateX.value,
        customY: magicTemplateY.value,
        distance: magicTemplateDistance.value,
        angle: magicTemplateAngle.value,
        width: magicTemplateWidth.value,
        direction: magicTemplateDirection.value,
        casterTokenId: magicCasterToken.value
      })
    );
    const clearMagicTemplates = ttmMake(
      "button",
      "Clear Templates",
      "ttm-secondary"
    );
    clearMagicTemplates.type = "button";
    clearMagicTemplates.addEventListener(
      "click",
      () => this.clearSpellTemplateBlueprints()
    );

    const magicTemplateButtons = ttmMake(
      "div",
      null,
      "ttm-button-row"
    );
    ttmAdd(magicTemplateButtons, previewMagicTemplate);
    ttmAdd(magicTemplateButtons, clearMagicTemplates);
    ttmAdd(magicGroup, magicTemplateButtons);
    ttmAdd(
      magicGroup,
      this.createHint(
        "Uses the selected Actor's embedded D&D5e spell "
        + "and its normal casting prompts."
      )
    );

    const trapBehaviourGroup = makeGroup(
      "Trap Behaviour",
      ["trap"]
    );
    trapBehaviourGroup.dataset.trapBehaviourContainer = "true";
    ttmAdd(trapBehaviourGroup, behaviourToggles.trap.label);
    ttmAdd(trapBehaviourGroup, trapTypeField);
    ttmAdd(trapBehaviourGroup, generalTrapGroup);
    ttmAdd(trapBehaviourGroup, trapGroup);
    ttmAdd(trapBehaviourGroup, magicGroup);

    const resetGroup = makeGroup("Reset Tile Options", ["reset"]);
    ttmAdd(resetGroup, behaviourToggles.reset.label);
    ttmAdd(resetGroup, this.createHint("This tile resets TalkToMe utility tiles in the current scene back to their inactive/default state."));
    ttmAdd(resetGroup, this.createImagePickerField("Inactive/default image", resetInactiveImage));
    ttmAdd(resetGroup, this.createImagePickerField("Active image", resetActiveImage));

    const buttons = ttmMake("div", null, "ttm-button-row");

    const create = ttmMake("button", "Place Template Tile", "ttm-primary");
    create.type = "button";
    create.addEventListener("click", async () => {
      if (
        template.value === "speech"
        && mode.value === "conversation-sequence"
      ) {
        const orderValues = String(conversationOrder.value ?? "")
          .split(",")
          .map(value => Number(value.trim()))
          .filter(value => Number.isInteger(value));

        if (!orderValues.length) {
          ui.notifications.warn(
            "Enter a speaking order such as 1,1,2,2."
          );
          return;
        }

        const missingSlot = orderValues.find(slot => {
          return (
            slot < 1
            || slot > 5
            || !conversationParticipantInputs[
              slot - 1
            ]?.table.value
          );
        });

        if (missingSlot) {
          ui.notifications.warn(
            `NPC ${missingSlot} is used in the speaking order `
            + "but has no RollTable assigned."
          );
          return;
        }
      }

      if (template.value === "moveTokens") {
        const moveX = Number(moveDestinationX.value);
        const moveY = Number(moveDestinationY.value);

        let plottedRoute = [];

        try {
          plottedRoute = JSON.parse(moveRoute.value || "[]");
        } catch {
          plottedRoute = [];
        }

        const hasRoute =
          Array.isArray(plottedRoute)
          && plottedRoute.length > 0;
        const hasDestination =
          Number.isFinite(moveX)
          && Number.isFinite(moveY);

        if (!hasRoute && !hasDestination) {
          ui.notifications.warn(
            "Plot a movement route or choose a fallback destination."
          );
          return;
        }

        if (
          moveTargetMode.value === "specific-npcs"
          && moveNpcTokens.selectedOptions.length === 0
        ) {
          ui.notifications.warn(
            "Select at least one NPC for the Move Tokens tile."
          );
          return;
        }
      }

      if (
        template.value === "trap"
        && trapType.value === "magical"
        && (!magicCasterToken.value || !magicSpellItem.value)
      ) {
        ui.notifications.warn("Choose a caster token and spell for the magical trap.");
        return;
      }

      if (template.value === "spawnTokens") {
        if (!spawnActor.value) {
          ui.notifications.warn("Choose an Actor to spawn.");
          return;
        }

        if (
          !Number.isFinite(Number(spawnX.value))
          || !Number.isFinite(Number(spawnY.value))
        ) {
          ui.notifications.warn("Choose a valid spawn location.");
          return;
        }
      }

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
        mode: mode.value === "custom" ? "custom" : "table",
        text: mode.value === "custom" ? text.value.trim() : "",
        conversationEnabled:
          mode.value === "conversation-advanced",
        conversationId:
          mode.value === "conversation-advanced"
            ? conversationId.value.trim()
            : "",
        conversationStart:
          mode.value === "conversation-advanced"
            && conversationStart.input.checked,
        conversationStartNode:
          mode.value === "conversation-advanced"
            ? (conversationStartNode.value.trim() || "start")
            : "start",
        conversationNextTileId:
          mode.value === "conversation-advanced"
            ? conversationNextTileId.value.trim()
            : "",
        conversationSequenceEnabled:
          mode.value === "conversation-sequence",
        conversationParticipants:
          mode.value === "conversation-sequence"
            ? conversationParticipantInputs.map(participant => ({
                tokenId: participant.token.value,
                tableId: participant.table.value,
                npcName: participant.npcName.value.trim()
              }))
            : [],
        conversationOrder:
          mode.value === "conversation-sequence"
            ? String(conversationOrder.value ?? "")
                .split(",")
                .map(value => Number(value.trim()))
                .filter(value =>
                  Number.isInteger(value)
                  && value >= 1
                  && value <= 5
                )
            : [],
        conversationLineDelay:
          mode.value === "conversation-sequence"
            ? Math.max(
                0.25,
                Number(conversationLineDelay.value || 3)
              )
            : 3,
        postChat: postChat.input.checked,
        zoomToSpeaker: zoomToSpeaker.input.checked,
        typingAnimation: typingAnimation.input.checked,
        hidden: !showToPlayers.input.checked,
        requirePlayerVision: requirePlayerVision.input.checked,
        hideBehindWalls: hideBehindWalls.input.checked,
        multipleUse: multipleUse.input.checked,
        activationActorTypes:
          this.activationAudienceValueToTypes(
            activationAudience.value
          ),
        effectsEnabled: effectsEnabled.input.checked,
        soundEnabled:
          effectsEnabled.input.checked
          && soundEnabled.input.checked,
        soundFile: soundFile.value.trim(),
        soundVolume: Math.max(
          0,
          Math.min(1, Number(soundVolume.value || 0.8))
        ),
        animationEnabled:
          effectsEnabled.input.checked
          && animationEnabled.input.checked,
        animationType: animationType.value,
        animationDuration: Math.max(
          0.15,
          Number(animationDuration.value || 0.7)
        ),
        activationCooldownEnabled: activationCooldownEnabled.input.checked,
        activationCooldownSeconds: Math.max(
          0.2,
          Number(activationCooldownSeconds.value || 1)
        ),
        width: Number(width.value || 100),
        height: Number(height.value || 100),
        clickActivation: clickActivation.value,
        tileImage: tileImage.value.trim(),
        template: template.value,
        activeImage:
          template.value === "light"
            ? lightActiveImage.value.trim()
            : template.value === "globalLight"
              ? globalLightActiveImage.value.trim()
              : template.value === "trap"
                ? trapActiveImage.value.trim()
                : template.value === "teleport"
                  ? teleportActiveImage.value.trim()
                  : template.value === "spawnTokens"
                    ? spawnActiveImage.value.trim()
                    : template.value === "reset"
                      ? resetActiveImage.value.trim()
                      : activeImage.value.trim(),
        inactiveImage:
          template.value === "light"
            ? lightInactiveImage.value.trim()
            : template.value === "globalLight"
              ? globalLightInactiveImage.value.trim()
              : template.value === "trap"
                ? trapInactiveImage.value.trim()
                : template.value === "teleport"
                  ? teleportInactiveImage.value.trim()
                  : template.value === "spawnTokens"
                    ? spawnInactiveImage.value.trim()
                    : template.value === "reset"
                      ? resetInactiveImage.value.trim()
                      : inactiveImage.value.trim(),
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
        trapType: template.value === "trap" ? trapType.value : "mundane",
        mundaneTrapType:
          template.value === "trap" && trapType.value === "mundane"
            ? mundaneTrapType.value
            : "projectile",
        trapDelaySeconds: Math.max(0, Number(trapDelaySeconds.value || 0)),
        trapTriggerChance: Math.max(
          0,
          Math.min(100, Number(trapTriggerChance.value || 100))
        ),
        trapTriggerOnce: trapTriggerOnce.input.checked,
        trapDisableAfterTrigger: trapDisableAfterTrigger.input.checked,
        trapPauseGame: trapPauseGame.input.checked,
        linkedTriggerTileId: linkedTriggerTileId.value.trim(),
        moveDestinationX: moveDestinationX.value,
        moveDestinationY: moveDestinationY.value,
        moveRoute: (() => {
          try {
            const parsed = JSON.parse(moveRoute.value || "[]");
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })(),
        moveTargetMode: moveTargetMode.value,
        moveTokenIds: Array.from(
          moveNpcTokens.selectedOptions
        ).map(option => option.value),
        moveOffsetX: Number(moveOffsetX.value || 0),
        moveOffsetY: Number(moveOffsetY.value || 0),
        moveSpacing: Math.max(0, Number(moveSpacing.value || 0)),
        moveAutoRotate: moveAutoRotate.input.checked,
        spawnActorId: spawnActor.value,
        spawnQuantity: Math.max(1, Math.min(50, Number(spawnQuantity.value || 1))),
        spawnX: spawnX.value,
        spawnY: spawnY.value,
        spawnFormation: spawnFormation.value,
        spawnSpacing: Math.max(0, Number(spawnSpacing.value || 0)),
        spawnHidden: spawnHidden.input.checked,
        spawnRemoveOnReset: spawnRemoveOnReset.input.checked,
        magicCasterTokenId: magicCasterToken.value,
        magicSpellItemId: magicSpellItem.value,
        magicActivityId: magicActivity.value,
        magicCastLevel: magicCastLevel.value,
        magicConsumeSlot: magicConsumeSlot.input.checked,
        magicAutoCast: magicAutoCast.input.checked,
        magicConfigureDialog:
          magicAutoCast.input.checked
            ? false
            : magicConfigureDialog.input.checked,
        magicTargetMode: magicTargetMode.value,
        magicTemplateType: magicTemplateType.value,
        magicTemplateOrigin: magicTemplateOrigin.value,
        magicTemplateX: magicTemplateX.value,
        magicTemplateY: magicTemplateY.value,
        magicTemplateDistance: Number(magicTemplateDistance.value || 20),
        magicTemplateAngle: Number(magicTemplateAngle.value || 90),
        magicTemplateWidth: Number(magicTemplateWidth.value || 5),
        magicTemplateDirection: Number(magicTemplateDirection.value || 0),
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

      if (doc) {
        const actions = [];
        const addAction = (key, data) => {
          if (
            key !== template.value
            && behaviourToggles[key]?.input.checked
          ) {
            actions.push({ template: key, ...data });
          }
        };

        addAction("speech", {
          mode: mode.value === "custom" ? "custom" : "table",
          text: text.value.trim(),
          tableId: tableSelect.value,
          tokenId: subjectToken.value,
          npcName: npc.value.trim()
        });
        addAction("switch", {
          doorWallId: doorWallId.value.trim(),
          doorAction: doorAction.value
        });
        addAction("light", {
          lightDim: Number(lightDim.value || 20),
          lightBright: Number(lightBright.value || 10),
          lightColor: lightColor.value.trim() || "#ffffff",
          lightAlpha: Number(lightAlpha.value || 0.5)
        });
        addAction("globalLight", {
          globalLightAction: globalLightAction.value,
          globalDarkness: Math.max(
            0,
            Math.min(1, Number(globalDarkness.value || 0.75))
          )
        });
        addAction("trap", {
          saveAbility: saveAbility.value,
          saveDC: Number(saveDC.value || 10),
          trapTarget: trapTarget.value,
          trapType: trapType.value,
          mundaneTrapType: mundaneTrapType.value,
          trapDelaySeconds: Math.max(0, Number(trapDelaySeconds.value || 0)),
          trapTriggerChance: Math.max(
            0,
            Math.min(100, Number(trapTriggerChance.value || 100))
          ),
          trapTriggerOnce: trapTriggerOnce.input.checked,
          trapDisableAfterTrigger: trapDisableAfterTrigger.input.checked,
          trapPauseGame: trapPauseGame.input.checked
        });
        addAction("teleport", {
          teleportX: teleportX.value,
          teleportY: teleportY.value,
          teleportOffsetX: Number(teleportOffsetX.value || 0),
          teleportOffsetY: Number(teleportOffsetY.value || 0),
          teleportAvoidTiles: teleportAvoidTiles.input.checked,
          teleportUseCooldown: teleportUseCooldown.input.checked,
          teleportCooldownSeconds: Number(
            teleportCooldownSeconds.value || 0
          )
        });
        addAction("moveTokens", {
          moveDestinationX: moveDestinationX.value,
          moveDestinationY: moveDestinationY.value,
          moveRoute: (() => {
            try {
              const parsed = JSON.parse(moveRoute.value || "[]");
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          })(),
          moveTargetMode: moveTargetMode.value,
          moveTokenIds: Array.from(
            moveNpcTokens.selectedOptions
          ).map(option => option.value),
          moveOffsetX: Number(moveOffsetX.value || 0),
          moveOffsetY: Number(moveOffsetY.value || 0),
          moveSpacing: Math.max(0, Number(moveSpacing.value || 0)),
          moveAutoRotate: moveAutoRotate.input.checked
        });
        addAction("magic", {
          magicCasterTokenId: magicCasterToken.value,
          magicSpellItemId: magicSpellItem.value,
          magicActivityId: magicActivity.value,
          magicCastLevel: magicCastLevel.value,
          magicConsumeSlot: magicConsumeSlot.input.checked,
          magicAutoCast: magicAutoCast.input.checked,
          magicConfigureDialog:
            magicAutoCast.input.checked
              ? false
              : magicConfigureDialog.input.checked,
          magicTargetMode: magicTargetMode.value,
          magicTemplateType: magicTemplateType.value,
          magicTemplateOrigin: magicTemplateOrigin.value,
          magicTemplateX: magicTemplateX.value,
          magicTemplateY: magicTemplateY.value,
          magicTemplateDistance: Number(magicTemplateDistance.value || 20),
          magicTemplateAngle: Number(magicTemplateAngle.value || 90),
          magicTemplateWidth: Number(magicTemplateWidth.value || 5),
          magicTemplateDirection: Number(magicTemplateDirection.value || 0)
        });
        addAction("spawnTokens", {
          spawnActorId: spawnActor.value,
          spawnQuantity: Math.max(
            1,
            Math.min(50, Number(spawnQuantity.value || 1))
          ),
          spawnX: spawnX.value,
          spawnY: spawnY.value,
          spawnFormation: spawnFormation.value,
          spawnSpacing: Math.max(0, Number(spawnSpacing.value || 0)),
          spawnHidden: spawnHidden.input.checked,
          spawnRemoveOnReset: spawnRemoveOnReset.input.checked
        });
        addAction("reset", {});

        if (actions.length) {
          await doc.setFlag(TTM_ID, "multiUse", {
            enabled: true,
            mode: "sequence",
            actions
          });
        } else {
          await doc.unsetFlag(TTM_ID, "multiUse");
        }

        this.refreshManagedTileList();
      }
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
  const speechSource = mode.value;

  for (const field of panel.querySelectorAll("[data-trigger-only]")) {
    field.hidden =
      field.dataset.triggerOnly !== selectedTrigger;
  }

  for (const group of panel.querySelectorAll(".ttm-template-group")) {
    const templates = String(group.dataset.templates || "").split(",");
    const triggerOnly = group.dataset.triggerOnly;

    const templateMatches = true;
    const triggerMatches =
      !triggerOnly || triggerOnly === selectedTrigger;

    const trapTypeOnly = group.dataset.trapTypeOnly;
    const trapTypeMatches =
      !trapTypeOnly || trapTypeOnly === trapType.value;

    group.hidden = !triggerMatches || !trapTypeMatches;
  }

  const trapEnabled = behaviourToggles.trap.input.checked;
  trapTypeField.hidden = !trapEnabled;
  trapGroup.hidden = !trapEnabled || trapType.value !== "mundane";
  magicGroup.hidden = !trapEnabled || trapType.value !== "magical";

  for (const group of panel.querySelectorAll(
    ".ttm-speech-source-group"
  )) {
    const sources = String(
      group.dataset.speechSources || ""
    ).split(",");

    group.hidden =
      !behaviourToggles.speech.input.checked
      || !sources.includes(speechSource);
  }

  for (const field of panel.querySelectorAll(
    "[data-speech-source-only]"
  )) {
    const supportedSources = String(
      field.dataset.speechSourceOnly || ""
    ).split(",");

    field.hidden =
      !behaviourToggles.speech.input.checked
      || !supportedSources.includes(speechSource);
  }
};

    const updateTrapTypeVisibility = () => {
      const trapEnabled =
        template.value === "trap"
        && behaviourToggles.trap.input.checked;

      trapTypeField.hidden = !trapEnabled;
      trapGroup.hidden =
        !trapEnabled || trapType.value !== "mundane";
      magicGroup.hidden =
        !trapEnabled || trapType.value !== "magical";
    };

    trapType.addEventListener("change", () => {
      const magical = trapType.value === "magical";
      behaviourToggles.trap.input.checked = true;
      behaviourToggles.magic.input.checked = magical;
      updateTemplateVisibility();
      updateTrapTypeVisibility();
    });

    const synchronisePrimaryBehaviour = () => {
      for (const [key, toggle] of Object.entries(behaviourToggles)) {
        toggle.input.disabled = false;

        if (key === "speech") {
          toggle.input.checked = template.value === "speech";
          toggle.input.disabled = template.value === "speech";
        } else if (key === template.value) {
          toggle.input.checked = true;
          toggle.input.disabled = true;
        }

        toggle.input.dispatchEvent(new Event("change"));
      }

      if (template.value === "trap") {
        behaviourToggles.trap.input.checked = true;
        behaviourToggles.magic.input.checked =
          trapType.value === "magical";
        behaviourToggles.magic.input.dispatchEvent(
          new Event("change")
        );
      }

      updateTemplateVisibility();
      updateTrapTypeVisibility();
    };

    for (const toggle of Object.values(behaviourToggles)) {
      toggle.input.addEventListener(
        "change",
        updateTemplateVisibility
      );
    }

    template.addEventListener("change", synchronisePrimaryBehaviour);
    trigger.addEventListener("change", updateTemplateVisibility);
    mode.addEventListener("change", updateTemplateVisibility);
    const updateCooldownField = () => {
      activationCooldownSeconds.disabled =
        !activationCooldownEnabled.input.checked;
    };

    activationCooldownEnabled.input.addEventListener(
      "change",
      updateCooldownField
    );

    showToPlayers.input.addEventListener("change", updateTemplateVisibility);

    ttmAdd(panel, this.createHint("Choose a template to show only the relevant setup options."));
    ttmAdd(panel, basicGroup);
    ttmAdd(panel, this.makeCollapsibleSection(effectsGroup, "Sound & Animation", false));
    ttmAdd(panel, this.makeCollapsibleSection(speechGroup, "Speech", true));
    ttmAdd(panel, this.makeCollapsibleSection(switchGroup, "Switch", false));
    ttmAdd(panel, this.makeCollapsibleSection(lightGroup, "Ambient Light", false));
    ttmAdd(panel, this.makeCollapsibleSection(globalLightGroup, "Global Lighting", false));
    ttmAdd(
      panel,
      this.makeCollapsibleSection(
        trapBehaviourGroup,
        "Trap Behaviour",
        false
      )
    );
    ttmAdd(panel, this.makeCollapsibleSection(teleportGroup, "Teleport", false));
    ttmAdd(panel, this.makeCollapsibleSection(moveTokensGroup, "Movement", false));
    ttmAdd(panel, this.makeCollapsibleSection(spawnTokensGroup, "Spawning", false));
    ttmAdd(panel, this.makeCollapsibleSection(resetGroup, "Reset", false));
    ttmAdd(panel, buttons);
    ttmAdd(panel, ttmMake("hr"));


    this.bindOptionalSection(
      effectsGroup,
      effectsEnabled.input
    );
    this.bindOptionalSection(
      speechGroup,
      behaviourToggles.speech.input
    );
    this.bindOptionalSection(
      switchGroup,
      behaviourToggles.switch.input
    );
    this.bindOptionalSection(
      lightGroup,
      behaviourToggles.light.input
    );
    this.bindOptionalSection(
      globalLightGroup,
      behaviourToggles.globalLight.input
    );
    this.bindOptionalSection(
      trapGroup,
      behaviourToggles.trap.input
    );
    this.bindOptionalSection(
      teleportGroup,
      behaviourToggles.teleport.input
    );
    this.bindOptionalSection(
      moveTokensGroup,
      behaviourToggles.moveTokens.input
    );
    this.bindOptionalSection(
      spawnTokensGroup,
      behaviourToggles.spawnTokens.input
    );
    this.bindOptionalSection(
      magicGroup,
      behaviourToggles.trap.input
    );
    this.bindOptionalSection(
      resetGroup,
      behaviourToggles.reset.input
    );

    setTimeout(() => {
      synchronisePrimaryBehaviour();
      updateCooldownField();
    }, 0);

    return panel;
  }




// Manage current scene tiles
openTileManager() {
  if (!ttmIsGM()) {
    ui.notifications.warn("TalkToMe tile management is a GM tool.");
    return;
  }

  this.closeTileManager();

  const root = ttmMake(
    "section",
    null,
    "ttm-app ttm-tile-manager-window window-app"
  );
  root.id = "talk-to-me-tile-manager-window";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Manage TalkToMe Tiles");
  root.dataset.sceneId = canvas.scene?.id ?? "";
  root.style.left = "calc(50vw - 260px)";
  root.style.top = "100px";

  const header = ttmMake(
    "header",
    null,
    "ttm-header window-header flexrow"
  );
  const title = ttmMake(
    "h4",
    `Manage TalkToMe Tiles — ${canvas.scene?.name ?? "Current Scene"}`,
    "ttm-title window-title"
  );
  const close = ttmMake("button", "×", "ttm-header-button");
  close.type = "button";
  close.title = "Close";
  close.addEventListener("click", () => this.closeTileManager());

  header.addEventListener("mousedown", event => {
    if (event.target === close) return;
    this.startManagerDrag(event);
  });

  ttmAdd(header, title);
  ttmAdd(header, close);

  const body = ttmMake("div", null, "ttm-body window-content");
  const toolbar = ttmMake("div", null, "ttm-button-row");

  const refresh = ttmMake("button", "Refresh");
  refresh.type = "button";
  refresh.addEventListener(
    "click",
    () => this.refreshTileManagerList()
  );

  const createNew = ttmMake("button", "Create New Tile");
  createNew.type = "button";
  createNew.addEventListener("click", () => {
    this.closeTileManager();
    this.open();
    this.switchTab("tiles");
  });

  const previewMigration = ttmMake(
    "button",
    "Preview Migration"
  );
  previewMigration.type = "button";
  previewMigration.addEventListener("click", async () => {
    const report = await this.api.migrateWorldData({
      dryRun: true,
      notify: true,
      force: true
    });

    if (report) {
      console.log("TalkToMe migration preview", report);
    }
  });

  const runMigration = ttmMake("button", "Run Migration");
  runMigration.type = "button";
  runMigration.addEventListener("click", async () => {
    const confirmed = await Dialog.confirm({
      title: "Run TalkToMe Data Migration?",
      content:
        "<p>This upgrades older TalkToMe tile flags across every scene. "
        + "Unknown flag data is preserved.</p>"
    });

    if (!confirmed) return;

    const report = await this.api.migrateWorldData({
      dryRun: false,
      notify: true,
      force: true
    });

    if (report) {
      this.refreshTileManagerList();
    }
  });

  ttmAdd(toolbar, refresh);
  ttmAdd(toolbar, createNew);
  ttmAdd(toolbar, previewMigration);
  ttmAdd(toolbar, runMigration);

  const list = ttmMake("div", null, "ttm-managed-list");
  list.id = "ttm-popout-managed-tiles";

  ttmAdd(body, toolbar);
  ttmAdd(body, list);
  ttmAdd(root, header);
  ttmAdd(root, body);

  document.body.appendChild(root);
  this.managerElement = root;

  document.addEventListener("mousemove", this.boundManagerMouseMove);
  document.addEventListener("mouseup", this.boundManagerMouseUp);

  this.refreshTileManagerList();
}

closeTileManager() {
  document.removeEventListener(
    "mousemove",
    this.boundManagerMouseMove
  );
  document.removeEventListener(
    "mouseup",
    this.boundManagerMouseUp
  );

  document
    .getElementById("talk-to-me-tile-manager-window")
    ?.remove();

  this.managerElement = null;
}

startManagerDrag(event) {
  if (!this.managerElement) return;

  this.managerDrag.active = true;
  this.managerDrag.startX = event.clientX;
  this.managerDrag.startY = event.clientY;

  const rect = this.managerElement.getBoundingClientRect();
  this.managerDrag.startLeft = rect.left;
  this.managerDrag.startTop = rect.top;

  event.preventDefault();
}

doManagerDrag(event) {
  if (!this.managerDrag.active || !this.managerElement) return;

  this.managerElement.style.left =
    `${this.managerDrag.startLeft + event.clientX - this.managerDrag.startX}px`;
  this.managerElement.style.top =
    `${this.managerDrag.startTop + event.clientY - this.managerDrag.startY}px`;
}

endManagerDrag() {
  this.managerDrag.active = false;
}

refreshTileManagerList() {
  const list = this.managerElement?.querySelector(
    "#ttm-popout-managed-tiles"
  );
  if (!list) return;

  const managerSceneId = this.managerElement?.dataset.sceneId;
  const currentSceneId = canvas.scene?.id;

  if (!currentSceneId || managerSceneId !== currentSceneId) {
    this.closeTileManager();
    return;
  }

  const docs = this.getTalkToMeTiles(canvas.scene);
  list.innerHTML = "";

  if (!docs.length) {
    list.innerHTML =
      `<p class="notes">No TalkToMe tiles on this scene yet.</p>`;
    return;
  }

  for (const doc of docs) {
    const utility = doc.getFlag(TTM_ID, "utility") ?? {};
    const speech = doc.getFlag(TTM_ID, "speech") ?? {};
    const templateName = utility.template ?? "speech";
    const triggerName =
      speech.trigger ?? utility.trigger ?? "manual";
    const displayName =
      doc.name || speech.name || "TalkToMe Tile";
    const multiUse =
      doc.getFlag(TTM_ID, "multiUse") ?? {};
    const additionalTemplates = Array.isArray(
      multiUse.actions
    )
      ? multiUse.actions
        .map(action => action.template)
        .filter(Boolean)
      : [];
    const behaviourNames = Array.from(
      new Set([templateName, ...additionalTemplates])
    );

    const card = ttmMake("article", null, "ttm-tile-card");
    card.innerHTML = `
      <div>
        <strong>${ttmEscapeHtml(displayName)}</strong>
        <p class="notes">
          Behaviours: ${ttmEscapeHtml(
            behaviourNames.join(", ")
          )}
          · Trigger: ${ttmEscapeHtml(triggerName)}
        </p>
      </div>
    `;

    const row = ttmMake("div", null, "ttm-card-buttons");

    const edit = ttmMake("button", "Edit");
    edit.type = "button";
    edit.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();

      const opened = await this.openTileEditor(doc.id);

      if (opened) {
        this.closeTileManager();
      }
    });

    const select = ttmMake("button", "Select");
    select.type = "button";
    select.addEventListener("click", () => {
      canvas.tiles?.activate?.();
      canvas.tiles?.get(doc.id)?.control?.({
        releaseOthers: true
      });
      canvas.animatePan?.({
        x: Number(doc.x ?? 0) + Number(doc.width ?? 0) / 2,
        y: Number(doc.y ?? 0) + Number(doc.height ?? 0) / 2
      });
    });

    const triggerButton = ttmMake("button", "Trigger");
    triggerButton.type = "button";
    triggerButton.addEventListener(
      "click",
      () => this.api.triggerSpeechTile(doc.id)
    );

    const remove = ttmMake("button", "Delete");
    remove.type = "button";
    remove.addEventListener("click", async () => {
      Hooks.once("renderDialog", dialogApp => {
        const element =
          dialogApp.element?.[0]
          ?? dialogApp.element
          ?? document.querySelector(".dialog");

        if (element?.style) {
          element.style.zIndex = "10050";
        }

        const backdrop = document.querySelector(
          ".window-app.dialog + .dialog-backdrop, .dialog-backdrop"
        );

        if (backdrop?.style) {
          backdrop.style.zIndex = "10049";
        }

        dialogApp.bringToTop?.();
      });

      const ok = await Dialog.confirm({
        title: "Delete TalkToMe Tile?",
        content:
          `<p>Delete <strong>${ttmEscapeHtml(displayName)}</strong>?</p>`
      });

      if (!ok) return;

      await doc.delete();
      this.refreshTileManagerList();
      this.refreshManagedTileList();
    });

    ttmAdd(row, edit);
    ttmAdd(row, select);
    ttmAdd(row, triggerButton);
    ttmAdd(row, remove);
    ttmAdd(card, row);
    ttmAdd(list, card);
  }
}

// Edit tile options
async openTileEditor(tileId = "") {
  if (!ttmIsGM()) {
    ui.notifications.warn(
      "TalkToMe tile editing is a GM tool."
    );
    return false;
  }

  const tileDoc = tileId
    ? canvas.scene?.tiles?.get(tileId)
    : null;

  if (tileId && !tileDoc) {
    ui.notifications.warn(
      "TalkToMe could not find that tile in the current scene."
    );
    return false;
  }

  try {
    let root = document.getElementById(
      "talk-to-me-tile-editor-window"
    );

    // Reuse the existing editor rather than destroying it.
    if (root) {
      this.editorElement = root;
      root.hidden = false;
      root.style.display = "";
      root.style.zIndex = "10020";

      const selector = root.querySelector(
        "#ttm-edit-tile-select"
      );

      if (selector && tileId) {
        selector.value = tileId;
        selector.dispatchEvent(
          new Event("change", { bubbles: true })
        );
      }

      root.scrollIntoView?.({
        block: "nearest",
        inline: "nearest"
      });

      root.focus?.();
      return true;
    }

    root = ttmMake(
      "section",
      null,
      "ttm-app ttm-tile-editor-window window-app"
    );
    root.id = "talk-to-me-tile-editor-window";
    root.setAttribute("role", "dialog");
    root.setAttribute(
      "aria-label",
      "TalkToMe Tile Editor"
    );
    root.tabIndex = -1;
    root.style.left = "calc(50vw - 260px)";
    root.style.top = "110px";
    root.style.zIndex = "10020";

    const header = ttmMake(
      "header",
      null,
      "ttm-header window-header flexrow"
    );
    const title = ttmMake(
      "h4",
      "TalkToMe Tile Editor",
      "ttm-title window-title"
    );
    const close = ttmMake(
      "button",
      "×",
      "ttm-header-button"
    );
    close.type = "button";
    close.title = "Close";
    close.addEventListener(
      "click",
      () => this.closeTileEditor()
    );

    header.addEventListener("mousedown", event => {
      if (event.target === close) return;
      this.startEditorDrag(event);
    });

    ttmAdd(header, title);
    ttmAdd(header, close);

    const body = ttmMake(
      "div",
      null,
      "ttm-body window-content"
    );

    const editorBox = this.createTileEditorBox();

    if (!editorBox) {
      throw new Error(
        "The Tile Editor did not produce any content."
      );
    }

    ttmAdd(body, editorBox);
    ttmAdd(root, header);
    ttmAdd(root, body);

    document.body.appendChild(root);
    this.editorElement = root;

    document.addEventListener(
      "mousemove",
      this.boundEditorMouseMove
    );
    document.addEventListener(
      "mouseup",
      this.boundEditorMouseUp
    );

    const selector = root.querySelector(
      "#ttm-edit-tile-select"
    );

    if (!selector) {
      throw new Error(
        "The Tile Editor selector could not be created."
      );
    }

    if (tileId) {
      selector.value = tileId;
      selector.dispatchEvent(
        new Event("change", { bubbles: true })
      );

      if (selector.value !== tileId) {
        throw new Error(
          "The selected tile could not be loaded into the editor."
        );
      }
    }

    root.focus();
    return true;
  } catch (error) {
    console.error(
      "TalkToMe failed to open the Tile Editor.",
      error
    );

    document
      .getElementById("talk-to-me-tile-editor-window")
      ?.remove();

    this.editorElement = null;

    ui.notifications.error(
      `TalkToMe could not open the Tile Editor: `
      + `${error.message ?? error}`
    );

    return false;
  }
}

closeTileEditor() {
  document.removeEventListener(
    "mousemove",
    this.boundEditorMouseMove
  );
  document.removeEventListener(
    "mouseup",
    this.boundEditorMouseUp
  );

  document
    .getElementById("talk-to-me-tile-editor-window")
    ?.remove();

  this.editorElement = null;
}

startEditorDrag(event) {
  if (!this.editorElement) return;

  this.editorDrag.active = true;
  this.editorDrag.startX = event.clientX;
  this.editorDrag.startY = event.clientY;

  const rect = this.editorElement.getBoundingClientRect();
  this.editorDrag.startLeft = rect.left;
  this.editorDrag.startTop = rect.top;

  event.preventDefault();
}

doEditorDrag(event) {
  if (!this.editorDrag.active || !this.editorElement) return;

  this.editorElement.style.left =
    `${this.editorDrag.startLeft + event.clientX - this.editorDrag.startX}px`;
  this.editorElement.style.top =
    `${this.editorDrag.startTop + event.clientY - this.editorDrag.startY}px`;
}

endEditorDrag() {
  this.editorDrag.active = false;
}


getTalkToMeTiles(scene = canvas.scene) {
  if (!scene || scene.id !== canvas.scene?.id) return [];

  return (scene.tiles?.contents ?? [])
    .filter(tileDoc => {
      if (tileDoc.parent?.id !== scene.id) return false;

      const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
      const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};

      return Boolean(utility.template || speech.managed);
    })
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}


// Build tile editor
createTileEditorBox() {
  const box = ttmMake("section", null, "ttm-editor-box");
  box.id = "ttm-tile-editor-box";

  const selector = ttmMake("select");
  selector.id = "ttm-edit-tile-select";

  const blank = ttmMake("option", "— Select a TalkToMe tile —");
  blank.value = "";
  ttmAdd(selector, blank);

  for (const tileDoc of this.getTalkToMeTiles()) {
    const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
    const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};
    const templateName = utility.template ?? "speech";
    const option = ttmMake(
      "option",
      `${tileDoc.name ?? speech.name ?? "Unnamed Tile"} [${templateName}]`
    );
    option.value = tileDoc.id;
    ttmAdd(selector, option);
  }

  const makeInput = (type = "text") => {
    const input = ttmMake("input");
    input.type = type;
    return input;
  };

  const makeNumber = (step = null, min = null) => {
    const input = makeInput("number");
    if (step !== null) input.step = step;
    if (min !== null) input.min = min;
    return input;
  };

  const makeSelect = options => {
    const select = ttmMake("select");
    for (const [value, label] of options) {
      const option = ttmMake("option", label);
      option.value = value;
      ttmAdd(select, option);
    }
    return select;
  };

  const effectsEnabledEdit = this.createCheckbox(
    "ttm-edit-effects-enabled",
    "Sound & Animation",
    false
  );

  const soundEnabledEdit = this.createCheckbox(
    "ttm-edit-sound-enabled",
    "Play a sound when activated",
    false
  );
  const soundFileEdit = makeInput();
  const soundVolumeEdit = makeNumber("0.05", 0);
  soundVolumeEdit.max = 1;

  const animationEnabledEdit = this.createCheckbox(
    "ttm-edit-animation-enabled",
    "Animate the tile when activated",
    false
  );
  const animationTypeEdit = makeSelect([
    ["none", "None"],
    ["pulse", "Pulse"],
    ["shake", "Shake"],
    ["spin", "Spin"],
    ["fade", "Fade"]
  ]);
  const animationDurationEdit = makeNumber("0.05", 0.15);

  const magicCasterTokenEdit = this.createTokenSelect(
    "ttm-edit-magic-caster-token"
  );
  const magicSpellItemEdit = makeSelect([]);
  const magicActivityEdit = makeSelect([]);
  magicActivityEdit.hidden = true;
  const magicTargetModeEdit = makeSelect([
    ["none", "No automatic targets"],
    ["triggering-token", "Triggering token"],
    ["tokens-within-tile", "Tokens inside tile"],
    ["current-targets", "Current user targets"],
    ["selected-tokens", "Currently selected tokens"],
    ["player-tokens", "All player-owned tokens"],
    ["npc-tokens", "All NPC tokens"],
    ["template", "Tokens inside spell template"]
  ]);
  const magicTemplateTypeEdit = makeSelect([
    ["none", "No automatic template"],
    ["circle", "Circle"],
    ["cone", "Cone"],
    ["ray", "Ray"],
    ["rect", "Rectangle"]
  ]);
  const magicTemplateOriginEdit = makeSelect([
    ["tile", "Tile centre"],
    ["caster", "Caster token"],
    ["triggering-token", "Triggering token"],
    ["custom", "Custom canvas point"]
  ]);
  const magicTemplateXEdit = makeNumber();
  const magicTemplateYEdit = makeNumber();
  const magicTemplateDistanceEdit = makeNumber("1", 0);
  const magicTemplateAngleEdit = makeNumber("1", 0);
  const magicTemplateWidthEdit = makeNumber("1", 0);
  const magicTemplateDirectionEdit = makeNumber("1");
  const magicCastLevelEdit = makeSelect([
    ["auto", "Use spell's normal level"],
    ["0", "Cantrip"],
    ["1", "1st level"],
    ["2", "2nd level"],
    ["3", "3rd level"],
    ["4", "4th level"],
    ["5", "5th level"],
    ["6", "6th level"],
    ["7", "7th level"],
    ["8", "8th level"],
    ["9", "9th level"]
  ]);
  const magicConsumeSlotEdit = this.createCheckbox(
    "ttm-edit-magic-consume-slot",
    "Consume spell slot or resource",
    true
  );
  const magicConfigureDialogEdit = this.createCheckbox(
    "ttm-edit-magic-configure-dialog",
    "Show D&D5e casting dialog",
    false
  );
  const magicAutoCastEdit = this.createCheckbox(
    "ttm-edit-magic-auto-cast",
    "Cast automatically without confirmation",
    true
  );

  const syncMagicCastModeEdit = source => {
    if (
      source === "auto"
      && magicAutoCastEdit.input.checked
    ) {
      magicConfigureDialogEdit.input.checked = false;
    }

    if (
      source === "dialog"
      && magicConfigureDialogEdit.input.checked
    ) {
      magicAutoCastEdit.input.checked = false;
    }
  };

  magicAutoCastEdit.input.addEventListener(
    "change",
    () => syncMagicCastModeEdit("auto")
  );
  magicConfigureDialogEdit.input.addEventListener(
    "change",
    () => syncMagicCastModeEdit("dialog")
  );
  const magicTemplateDetectedStatusEdit = ttmMake(
    "p",
    "Choose a spell to detect its configured area.",
    "notes ttm-magic-template-status"
  );

  const getEditorMagicActivities = spell => {
    const activities = spell?.system?.activities;
    if (!activities) return [];
    if (typeof activities.values === "function") {
      return Array.from(activities.values());
    }
    if (Array.isArray(activities)) return activities;
    return Object.values(activities);
  };

  const resetEditorMagicSelect = (select, label) => {
    select.replaceChildren();
    const option = ttmMake("option", label);
    option.value = "";
    ttmAdd(select, option);
  };

  const refreshEditorMagicActivities = (
    selectedActivityId = ""
  ) => {
    resetEditorMagicSelect(
      magicActivityEdit,
      "— Choose a spell Activity —"
    );
    const token = canvas.tokens?.get(
      magicCasterTokenEdit.value
    );
    const spell = token?.actor?.items?.get(
      magicSpellItemEdit.value
    );
    for (const activity of getEditorMagicActivities(spell)) {
      const option = ttmMake(
        "option",
        activity.name ?? activity.label
          ?? activity.type ?? "Spell Activity"
      );
      option.value = activity.id ?? activity._id ?? "";
      ttmAdd(magicActivityEdit, option);
    }
    magicActivityEdit.value = selectedActivityId;
  };

  const refreshEditorMagicSpells = (
    selectedSpellId = "",
    selectedActivityId = ""
  ) => {
    resetEditorMagicSelect(
      magicSpellItemEdit,
      "— Choose an Actor spell —"
    );
    const token = canvas.tokens?.get(
      magicCasterTokenEdit.value
    );
    for (const spell of Array.from(token?.actor?.items ?? [])
      .filter(item => item.type === "spell")
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const option = ttmMake("option", spell.name);
      option.value = spell.id;
      ttmAdd(magicSpellItemEdit, option);
    }
    magicSpellItemEdit.value = selectedSpellId;
    refreshEditorMagicActivities(selectedActivityId);
  };

  magicCasterTokenEdit.addEventListener(
    "change",
    () => refreshEditorMagicSpells()
  );
  magicSpellItemEdit.addEventListener(
    "change",
    () => {
      refreshEditorMagicActivities();

      const token = canvas.tokens?.get(
        magicCasterTokenEdit.value
      );
      const spell = token?.actor?.items?.get(
        magicSpellItemEdit.value
      );

      this.applyDetectedSpellTemplate({
        spell,
        typeInput: magicTemplateTypeEdit,
        distanceInput: magicTemplateDistanceEdit,
        angleInput: magicTemplateAngleEdit,
        widthInput: magicTemplateWidthEdit,
        statusElement: magicTemplateDetectedStatusEdit
      });
    }
  );

  const name = makeInput();
  const template = makeSelect([
    ["speech", "Speech Bubble"],
    ["switch", "Switch Activation"],
    ["light", "Environment: Ambient Light"],
    ["globalLight", "Environment: Global Lighting"],
    ["trap", "Trap Activation"],
    ["teleport", "Teleport Activation"],
    ["moveTokens", "Move Tokens"],
    ["spawnTokens", "Spawn Tokens"],
    ["reset", "Reset Tile"]
  ]);
  const trapTypeEdit = makeSelect([
    ["mundane", "Mundane"],
    ["magical", "Magical"]
  ]);
  const mundaneTrapTypeEdit = makeSelect([
    ["projectile", "Projectile"],
    ["foothold", "Foothold"],
    ["elevation", "Elevation"],
    ["environment", "Environment"]
  ]);

  const trapDelaySecondsEdit = makeInput("number");
  trapDelaySecondsEdit.min = "0";
  trapDelaySecondsEdit.step = "0.1";

  const trapTriggerChanceEdit = makeInput("number");
  trapTriggerChanceEdit.min = "0";
  trapTriggerChanceEdit.max = "100";
  trapTriggerChanceEdit.step = "1";

  const trapTriggerOnceEdit = this.createCheckbox(
    "ttm-edit-trap-trigger-once",
    "Trigger only once",
    false
  );
  const trapDisableAfterTriggerEdit = this.createCheckbox(
    "ttm-edit-trap-disable-after-trigger",
    "Disable after activation",
    false
  );
  const trapPauseGameEdit = this.createCheckbox(
    "ttm-edit-trap-pause-game",
    "Pause game when triggered",
    false
  );

  const behaviourTogglesEdit = {
    speech: this.createCheckbox(
      "ttm-edit-enable-speech", "Enable Speech behaviour", false
    ),
    switch: this.createCheckbox(
      "ttm-edit-enable-switch", "Enable Switch behaviour", false
    ),
    light: this.createCheckbox(
      "ttm-edit-enable-light", "Enable Ambient Light behaviour", false
    ),
    globalLight: this.createCheckbox(
      "ttm-edit-enable-global-light", "Enable Global Lighting behaviour", false
    ),
    trap: this.createCheckbox(
      "ttm-edit-enable-trap", "Enable Trap behaviour", false
    ),
    teleport: this.createCheckbox(
      "ttm-edit-enable-teleport", "Enable Teleport behaviour", false
    ),
    moveTokens: this.createCheckbox(
      "ttm-edit-enable-move", "Enable Move Tokens behaviour", false
    ),
    spawnTokens: this.createCheckbox(
      "ttm-edit-enable-spawn", "Enable Spawn Tokens behaviour", false
    ),
    magic: this.createCheckbox(
      "ttm-edit-enable-magic", "Enable Cast Spell behaviour", false
    ),
    reset: this.createCheckbox(
      "ttm-edit-enable-reset", "Enable Reset behaviour", false
    )
  };

  const trigger = makeSelect([
    ["enter", "Token enters tile"],
    ["exit", "Token exits tile"],
    ["switch", "Click / switch activation"],
    ["trap", "Trap triggered"],
    ["effect", "Magic spell/effect"],
    ["manual", "Manual only"]
  ]);
  const clickActivation = makeSelect([
    ["left", "Left click"],
    ["double-left", "Double left click"],
    ["right", "Right click"],
    ["any", "Any click"]
  ]);

  const width = makeNumber(null, 1);
  const height = makeNumber(null, 1);
  const inactiveImage = makeInput();
  const activeImage = makeInput();

  const linkedTileId = makeInput();
  linkedTileId.placeholder = "Selected linked TalkToMe tile ID";

  const doorWallId = makeInput();
  const doorAction = makeSelect([
    ["toggle", "Toggle door"],
    ["open", "Open door"],
    ["close", "Close door"],
    ["lock", "Lock door"]
  ]);

  const lightDim = makeNumber();
  const lightBright = makeNumber();
  const lightColor = makeInput();
  const lightAlpha = makeNumber("0.1");
  const lightAnimation = makeSelect([
    ["", "None"],
    ["torch", "Torch"],
    ["pulse", "Pulse"],
    ["chroma", "Chroma"],
    ["wave", "Wave"],
    ["fog", "Fog"],
    ["sunburst", "Sunburst"],
    ["dome", "Dome"],
    ["emanation", "Emanation"],
    ["hexa", "Hexa"],
    ["ghost", "Ghost"],
    ["energy", "Energy"],
    ["roiling", "Roiling"],
    ["hole", "Black Hole"],
    ["vortex", "Vortex"],
    ["bewitching", "Bewitching"],
    ["smokepatch", "Smoke Patch"]
  ]);

  const globalLightAction = makeSelect([
    ["on", "Fade to Day"],
    ["off", "Fade to Night"],
    ["toggle", "Toggle Day / Night"],
    ["set-darkness", "Set Darkness Level"],
    ["restore", "Restore Original Lighting"]
  ]);
  const globalDarkness = makeNumber("0.05", 0);
  globalDarkness.max = 1;
  const globalLightColorOverride = this.createCheckbox(
    "ttm-edit-global-light-colour-override",
    "Override global light colour",
    false
  );
  const globalLightColor = makeInput();

  const saveAbility = makeSelect(
    ["str", "dex", "con", "int", "wis", "cha"]
      .map(value => [value, value.toUpperCase()])
  );
  const saveDC = makeNumber();
  const trapTarget = makeSelect([
    ["triggering-token", "Triggering Token"],
    ["tokens-within-tile", "Tokens Within Tile"],
    ["use-player-tokens", "Use Player Tokens"]
  ]);

  const moveTargetMode = makeSelect([
    ["triggering-token", "Triggering Token"],
    ["tokens-within-tile", "Tokens Within Tile"],
    ["selected-tokens", "Currently Selected Tokens"],
    ["specific-npcs", "Specific NPCs"],
    ["player-tokens", "All Player-Owned Tokens"]
  ]);
  const moveNpcTokensEdit = this.createTokenMultiSelect(
    "ttm-edit-move-specific-npcs"
  );
  const moveRouteEdit = makeInput();
  moveRouteEdit.type = "hidden";
  moveRouteEdit.value = "[]";
  const moveDestinationX = makeNumber();
  const moveDestinationY = makeNumber();
  const moveOffsetX = makeNumber();
  const moveOffsetY = makeNumber();
  const moveSpacing = makeNumber(null, 0);
  const moveAutoRotateEdit = this.createCheckbox(
    "ttm-edit-move-auto-rotate",
    "Rotate NPCs to face movement direction",
    false
  );

  const spawnActorEdit = this.createActorSelect("ttm-edit-spawn-actor");
  const spawnQuantityEdit = makeNumber("1", 1);
  spawnQuantityEdit.max = 50;
  const spawnXEdit = makeNumber();
  const spawnYEdit = makeNumber();
  const spawnFormationEdit = makeSelect([
    ["single", "Single point"],
    ["grid", "Grid"],
    ["circle", "Circle"],
    ["random", "Random area"]
  ]);
  const spawnSpacingEdit = makeNumber("1", 0);
  const spawnHiddenEdit = this.createCheckbox(
    "ttm-edit-spawn-hidden",
    "Spawn tokens hidden",
    false
  );
  const spawnRemoveOnResetEdit = this.createCheckbox(
    "ttm-edit-spawn-remove-on-reset",
    "Remove spawned tokens when reset",
    true
  );

  const teleportX = makeNumber();
  const teleportY = makeNumber();
  const teleportOffsetX = makeNumber();
  const teleportOffsetY = makeNumber();
  const teleportResetSeconds = makeNumber("0.1", 0);
  const teleportCooldownSeconds = makeNumber("0.1", 0);

  const teleportAutoReset = this.createCheckbox(
    "ttm-edit-teleport-auto-reset",
    "Auto reset after activation",
    true
  );
  const teleportUseCooldown = this.createCheckbox(
    "ttm-edit-teleport-use-cooldown",
    "Use token teleport cooldown",
    true
  );
  const teleportAvoidTiles = this.createCheckbox(
    "ttm-edit-teleport-avoid-tiles",
    "Prevent landing on teleport tiles",
    true
  );

  const teleportCreateReturn = this.createCheckbox(
    "ttm-edit-teleport-create-return",
    "Create a return teleport tile",
    false
  );
  const hotspotSize = makeNumber("1", 1);
  const hotspotOffsetX = makeNumber("1");
  const hotspotOffsetY = makeNumber("1");

  const nodeGraphModeEdit = makeSelect([
    ["sequence", "Run targets in sequence"],
    ["parallel", "Run all targets together"]
  ]);
  const nodeGraphTargetsEdit = ttmMake("textarea");
  nodeGraphTargetsEdit.rows = 5;
  nodeGraphTargetsEdit.placeholder =
    "One target per line: TILE_ID | delay seconds";

  const multiUseModeEdit = makeSelect([
    ["sequence", "Run extra actions in sequence"],
    ["parallel", "Run extra actions together"]
  ]);
  const multiUseActionsEdit = ttmMake("textarea");
  multiUseActionsEdit.rows = 10;
  multiUseActionsEdit.placeholder =
    "JSON array of multi-use actions";

  const speechMode = makeSelect([
    ["table", "Roll from table"],
    ["custom", "Use custom text"],
    ["conversation-sequence", "Conversation sequence"],
    ["conversation-advanced", "Advanced conversation"]
  ]);
  const speechTable = this.createTableSelect("ttm-edit-speech-table");
  const speechText = ttmMake("textarea");
  speechText.rows = 4;
  speechText.placeholder = "Custom speech text";
  const speechNpcName = makeInput();
  const speechSubjectToken = this.createTokenSelect(
    "ttm-edit-speech-subject-token"
  );
  speechSubjectToken.dataset.ttmTokenSelect = "true";

  const conversationEnabledEdit = this.createCheckbox(
    "ttm-edit-conversation-enabled",
    "Use conversation chain",
    false
  );
  const conversationIdEdit = makeInput();
  const conversationStartEdit = this.createCheckbox(
    "ttm-edit-conversation-start",
    "This NPC starts the conversation",
    false
  );
  const conversationStartNodeEdit = makeInput();
  const conversationNextTileIdEdit = makeInput();

  const conversationSequenceEnabledEdit = this.createCheckbox(
    "ttm-edit-conversation-sequence-enabled",
    "Use simple conversation sequence",
    false
  );

  const conversationOrderEdit = makeInput();
  conversationOrderEdit.placeholder = "1,1,2,2,3";

  const conversationLineDelayEdit = makeNumber("0.25", 0.25);
  conversationLineDelayEdit.value = 3;

  const conversationParticipantEditors = [];

  for (let index = 1; index <= 5; index += 1) {
    const token = this.createTokenSelect(
      `ttm-edit-conversation-token-${index}`
    );
    token.dataset.ttmTokenSelect = "true";

    const table = this.createTableSelect(
      `ttm-edit-conversation-table-${index}`
    );

    const npcName = makeInput();
    npcName.placeholder = "Optional name override";

    conversationParticipantEditors.push({
      slot: index,
      token,
      table,
      npcName
    });
  }

  const postChat = this.createCheckbox(
    "ttm-edit-post-chat",
    "Post speech to chat",
    false
  );
  const zoomToSpeaker = this.createCheckbox(
    "ttm-edit-zoom-speaker",
    "Zoom to speaker",
    false
  );
  const typingAnimation = this.createCheckbox(
    "ttm-edit-typing-animation",
    "Typing animation",
    false
  );

  const showToPlayers = this.createCheckbox(
    "ttm-edit-show-players",
    "Show this tile to players",
    true
  );
  const requireVision = this.createCheckbox(
    "ttm-edit-require-vision",
    "Players require vision to activate",
    false
  );
  const hideBehindWalls = this.createCheckbox(
    "ttm-edit-hide-walls",
    "Hide from players when blocked by walls",
    true
  );
  const multipleUseEdit = this.createCheckbox(
    "ttm-edit-multiple-use",
    "Multiple use",
    true
  );

  const activationAudienceEdit =
    this.createActivationAudienceSelect(
      "ttm-edit-activation-audience"
    );

  const cooldownEnabled = this.createCheckbox(
    "ttm-edit-cooldown-enabled",
    "Enable activation cooldown",
    false
  );
  const cooldownSeconds = makeNumber("0.1", 0.2);

  const status = ttmMake(
    "p",
    "Select a tile to load its TalkToMe settings.",
    "notes ttm-editor-status"
  );

  const fields = ttmMake("div", null, "ttm-editor-fields");
  fields.hidden = true;

  const makeGroup = (title, templates = []) => {
    const group = ttmMake("section", null, "ttm-editor-template-group");
    group.dataset.templates = templates.join(",");
    group.dataset.groupTitle = title;
    return group;
  };

  const commonGroup = makeGroup("Common Settings", [
    "speech", "switch", "light", "globalLight", "trap", "teleport", "moveTokens", "spawnTokens", "magic", "reset"
  ]);
  ttmAdd(commonGroup, this.createField("Tile name", name));
  ttmAdd(commonGroup, this.createField("Template", template));
  ttmAdd(commonGroup, this.createField("Trigger", trigger));
  const clickActivationField = this.createField(
    "Click activation",
    clickActivation
  );
  clickActivationField.dataset.editorClickActivation = "true";
  clickActivationField.dataset.triggerOnly = "switch";
  ttmAdd(commonGroup, clickActivationField);
  ttmAdd(commonGroup, this.createField("Width", width));
  ttmAdd(commonGroup, this.createField("Height", height));
  ttmAdd(commonGroup, this.createImagePickerField(
    "Inactive/default image",
    inactiveImage
  ));
  ttmAdd(commonGroup, this.createImagePickerField(
    "Active image",
    activeImage
  ));
  ttmAdd(commonGroup, showToPlayers.label);
  ttmAdd(commonGroup, requireVision.label);
  ttmAdd(commonGroup, hideBehindWalls.label);
  ttmAdd(commonGroup, multipleUseEdit.label);
  ttmAdd(
    commonGroup,
    this.createField(
      "Who can activate this tile?",
      activationAudienceEdit
    )
  );
  ttmAdd(commonGroup, cooldownEnabled.label);
  ttmAdd(commonGroup, this.createField(
    "Pause after activation (seconds)",
    cooldownSeconds
  ));

  const effectsGroupEdit = makeGroup(
    "Sound & Animation",
    [
      "speech",
      "switch",
      "light",
      "globalLight",
      "trap",
      "teleport",
      "moveTokens",
      "spawnTokens",
      "reset"
    ]
  );
  ttmAdd(effectsGroupEdit, effectsEnabledEdit.label);
  ttmAdd(effectsGroupEdit, soundEnabledEdit.label);
  ttmAdd(
    effectsGroupEdit,
    this.createAudioPickerField(
      "Activation sound",
      soundFileEdit
    )
  );
  ttmAdd(
    effectsGroupEdit,
    this.createField("Sound volume (0-1)", soundVolumeEdit)
  );
  ttmAdd(effectsGroupEdit, animationEnabledEdit.label);
  ttmAdd(
    effectsGroupEdit,
    this.createField("Tile animation", animationTypeEdit)
  );
  ttmAdd(
    effectsGroupEdit,
    this.createField(
      "Animation duration (seconds)",
      animationDurationEdit
    )
  );

  const speechGroup = makeGroup("Speech Settings", ["speech"]);
  ttmAdd(speechGroup, behaviourTogglesEdit.speech.label);
  ttmAdd(speechGroup, this.createField("Speech source", speechMode));

  const standardSpeechEditorGroup = ttmMake(
    "section",
    null,
    "ttm-editor-standard-speech"
  );

  const editorRollTableField = this.createField(
    "RollTable",
    speechTable
  );
  const editorCustomTextField = this.createField(
    "Custom speech",
    speechText
  );

  ttmAdd(standardSpeechEditorGroup, editorRollTableField);
  ttmAdd(standardSpeechEditorGroup, editorCustomTextField);
  ttmAdd(
    standardSpeechEditorGroup,
    this.createField("NPC name override", speechNpcName)
  );
  ttmAdd(
    standardSpeechEditorGroup,
    this.createField("Speaker token", speechSubjectToken)
  );

  ttmAdd(speechGroup, standardSpeechEditorGroup);
  const sequenceConversationGroup = ttmMake(
    "section",
    null,
    "ttm-editor-conversation-sequence"
  );

  ttmAdd(
    sequenceConversationGroup,
    ttmMake("h3", "Conversation Sequence Settings")
  );
  ttmAdd(
    sequenceConversationGroup,
    this.createField("Speaking order", conversationOrderEdit)
  );
  ttmAdd(
    sequenceConversationGroup,
    this.createField(
      "Delay between lines (seconds)",
      conversationLineDelayEdit
    )
  );

  for (const participant of conversationParticipantEditors) {
    const participantGroup = ttmMake(
      "section",
      null,
      "ttm-conversation-participant"
    );

    ttmAdd(
      participantGroup,
      ttmMake("h4", `NPC ${participant.slot}`)
    );
    ttmAdd(
      participantGroup,
      this.createField("Speaking token", participant.token)
    );
    ttmAdd(
      participantGroup,
      this.createField("RollTable", participant.table)
    );
    ttmAdd(
      participantGroup,
      this.createField("Name override", participant.npcName)
    );

    ttmAdd(sequenceConversationGroup, participantGroup);
  }

  ttmAdd(
    sequenceConversationGroup,
    this.createHint(
      "The speaking order uses NPC numbers, for example 1,1,2,2,3."
    )
  );

  const advancedConversationGroup = ttmMake(
    "section",
    null,
    "ttm-editor-advanced-conversation"
  );

  ttmAdd(
    advancedConversationGroup,
    ttmMake("h3", "Advanced Node Conversation")
  );
  ttmAdd(
    advancedConversationGroup,
    this.createField("Conversation ID", conversationIdEdit)
  );
  ttmAdd(advancedConversationGroup, conversationStartEdit.label);
  ttmAdd(
    advancedConversationGroup,
    this.createField("Starting node", conversationStartNodeEdit)
  );
  ttmAdd(
    advancedConversationGroup,
    this.createTilePickerField(
      "Next speaker tile",
      conversationNextTileIdEdit
    )
  );
  ttmAdd(
    advancedConversationGroup,
    this.createHint(
      "Advanced result format: "
      + "[[node:start|next:reply-1]] Spoken text."
    )
  );

  ttmAdd(speechGroup, sequenceConversationGroup);
  ttmAdd(speechGroup, advancedConversationGroup);
  ttmAdd(speechGroup, postChat.label);
  ttmAdd(speechGroup, zoomToSpeaker.label);
  ttmAdd(speechGroup, typingAnimation.label);

  const switchGroup = makeGroup("Switch Settings", ["switch"]);
  ttmAdd(switchGroup, behaviourTogglesEdit.switch.label);
  ttmAdd(switchGroup, this.createField("Door Wall ID", doorWallId));
  ttmAdd(switchGroup, this.createField("Door action", doorAction));

  const linkedGroup = makeGroup(
    "Linked Tile",
    [
      "speech",
      "switch",
      "light",
      "globalLight",
      "trap",
      "teleport",
      "moveTokens",
      "spawnTokens",
      "reset"
    ]
  );
  ttmAdd(linkedGroup, this.createTilePickerField(
    "Linked Tile ID",
    linkedTileId
  ));

  const lightGroup = makeGroup("Light Settings", ["light"]);
  ttmAdd(lightGroup, behaviourTogglesEdit.light.label);
  ttmAdd(lightGroup, this.createField("Dim radius", lightDim));
  ttmAdd(lightGroup, this.createField("Bright radius", lightBright));
  ttmAdd(lightGroup, this.createField("Colour", lightColor));
  ttmAdd(lightGroup, this.createField("Alpha", lightAlpha));
  ttmAdd(lightGroup, this.createField("Animation", lightAnimation));

  const globalLightGroup = makeGroup(
    "Environment: Global Lighting",
    ["globalLight"]
  );
  ttmAdd(globalLightGroup, behaviourTogglesEdit.globalLight.label);
  ttmAdd(globalLightGroup, this.createField("Action", globalLightAction));
  ttmAdd(globalLightGroup, this.createField("Darkness level (0-1)", globalDarkness));
  ttmAdd(globalLightGroup, globalLightColorOverride.label);
  ttmAdd(globalLightGroup, this.createField("Global light colour", globalLightColor));
  ttmAdd(
    globalLightGroup,
    this.createHint(
      "This tile always uses Foundry's standard Day/Night darkness animation. Instant changes are not available."
    )
  );

  const trapTypeField = this.createField(
    "Trap type",
    trapTypeEdit
  );

  const generalTrapGroup = makeGroup(
    "General Trap Settings",
    ["trap"]
  );
  ttmAdd(
    generalTrapGroup,
    this.createField("Delay before activation (seconds)", trapDelaySecondsEdit)
  );
  ttmAdd(
    generalTrapGroup,
    this.createField("Trigger chance (%)", trapTriggerChanceEdit)
  );
  ttmAdd(generalTrapGroup, trapTriggerOnceEdit.label);
  ttmAdd(generalTrapGroup, trapDisableAfterTriggerEdit.label);
  ttmAdd(generalTrapGroup, trapPauseGameEdit.label);

  const trapGroup = makeGroup("Mundane Trap Settings", ["trap"]);
  trapGroup.dataset.trapTypeOnly = "mundane";
  ttmAdd(
    trapGroup,
    this.createField("Mundane trap type", mundaneTrapTypeEdit)
  );
  ttmAdd(trapGroup, this.createField("Save ability", saveAbility));
  ttmAdd(trapGroup, this.createField("Save DC", saveDC));
  ttmAdd(trapGroup, this.createField("Target mode", trapTarget));

  const moveTokensGroup = makeGroup(
    "Move Tokens Settings",
    ["moveTokens"]
  );
  ttmAdd(moveTokensGroup, behaviourTogglesEdit.moveTokens.label);
  ttmAdd(
    moveTokensGroup,
    this.createField("Tokens to move", moveTargetMode)
  );

  const moveNpcTokensEditField = this.createField(
    "NPCs to move",
    moveNpcTokensEdit
  );
  ttmAdd(moveTokensGroup, moveNpcTokensEditField);

  const moveRouteEditField =
    this.createMovementRoutePickerField(
      "Movement route",
      moveRouteEdit
    );
  ttmAdd(moveTokensGroup, moveRouteEditField);
  ttmAdd(
    moveTokensGroup,
    this.createCanvasPointPickerField(
      "Fallback destination",
      moveDestinationX,
      moveDestinationY
    )
  );
  ttmAdd(
    moveTokensGroup,
    this.createField("Destination offset X", moveOffsetX)
  );
  ttmAdd(
    moveTokensGroup,
    this.createField("Destination offset Y", moveOffsetY)
  );
  ttmAdd(
    moveTokensGroup,
    this.createField("Formation spacing", moveSpacing)
  );
  ttmAdd(moveTokensGroup, moveAutoRotateEdit.label);

  const spawnTokensGroup = makeGroup(
    "Spawn Tokens Settings",
    ["spawnTokens"]
  );
  ttmAdd(spawnTokensGroup, behaviourTogglesEdit.spawnTokens.label);
  ttmAdd(spawnTokensGroup, this.createField("Actor to spawn", spawnActorEdit));
  ttmAdd(spawnTokensGroup, this.createField("Quantity", spawnQuantityEdit));
  ttmAdd(
    spawnTokensGroup,
    this.createCanvasPointPickerField("Spawn location", spawnXEdit, spawnYEdit)
  );
  ttmAdd(spawnTokensGroup, this.createField("Formation", spawnFormationEdit));
  ttmAdd(spawnTokensGroup, this.createField("Spacing (pixels)", spawnSpacingEdit));
  ttmAdd(spawnTokensGroup, spawnHiddenEdit.label);
  ttmAdd(spawnTokensGroup, spawnRemoveOnResetEdit.label);

  const teleportGroup = makeGroup("Teleport Settings", ["teleport"]);
  ttmAdd(teleportGroup, behaviourTogglesEdit.teleport.label);
  ttmAdd(teleportGroup, this.createField("Destination X", teleportX));
  ttmAdd(teleportGroup, this.createField("Destination Y", teleportY));
  ttmAdd(teleportGroup, this.createField("Offset X", teleportOffsetX));
  ttmAdd(teleportGroup, this.createField("Offset Y", teleportOffsetY));
  ttmAdd(teleportGroup, teleportAutoReset.label);
  ttmAdd(teleportGroup, this.createField(
    "Auto-reset delay (seconds)",
    teleportResetSeconds
  ));
  ttmAdd(teleportGroup, teleportUseCooldown.label);
  ttmAdd(teleportGroup, this.createField(
    "Token teleport cooldown (seconds)",
    teleportCooldownSeconds
  ));
  ttmAdd(teleportGroup, teleportAvoidTiles.label);

  const advancedAutomationGroup = makeGroup(
    "Advanced Tile Automation",
    [
      "speech",
      "switch",
      "light",
      "globalLight",
      "trap",
      "teleport",
      "moveTokens",
      "spawnTokens",
      "reset"
    ]
  );
  ttmAdd(
    advancedAutomationGroup,
    this.createHint(
      "These settings are shared with the Node Editor and "
      + "Multi-Use Tiles tabs."
    )
  );
  ttmAdd(
    advancedAutomationGroup,
    this.createField("Node chain mode", nodeGraphModeEdit)
  );
  ttmAdd(
    advancedAutomationGroup,
    this.createField(
      "Node targets (Tile ID | delay)",
      nodeGraphTargetsEdit
    )
  );
  ttmAdd(
    advancedAutomationGroup,
    this.createHint(
      "Use the dedicated tabs for a visual builder. JSON editing here "
      + "allows every saved action to remain accessible in one editor."
    )
  );

  const magicGroup = makeGroup(
    "Magical Trap Settings",
    ["trap"]
  );
  magicGroup.dataset.trapTypeOnly = "magical";
  ttmAdd(
    magicGroup,
    this.createField("Caster token", magicCasterTokenEdit)
  );
  ttmAdd(
    magicGroup,
    this.createField("Spell", magicSpellItemEdit)
  );
  ttmAdd(
    magicGroup,
    this.createField("Cast at level", magicCastLevelEdit)
  );
  ttmAdd(magicGroup, magicConsumeSlotEdit.label);
  ttmAdd(magicGroup, magicAutoCastEdit.label);
  ttmAdd(magicGroup, magicConfigureDialogEdit.label);
  ttmAdd(magicGroup, magicTemplateDetectedStatusEdit);
  ttmAdd(
    magicGroup,
    this.createField("Automatic targets", magicTargetModeEdit)
  );
  ttmAdd(
    magicGroup,
    this.createField("Spell template", magicTemplateTypeEdit)
  );
  ttmAdd(
    magicGroup,
    this.createField("Template origin", magicTemplateOriginEdit)
  );
  ttmAdd(
    magicGroup,
    this.createCanvasPointPickerField(
      "Custom template point",
      magicTemplateXEdit,
      magicTemplateYEdit
    )
  );
  ttmAdd(
    magicGroup,
    this.createField("Template distance", magicTemplateDistanceEdit)
  );
  ttmAdd(
    magicGroup,
    this.createField("Cone angle", magicTemplateAngleEdit)
  );
  ttmAdd(
    magicGroup,
    this.createField("Ray/rectangle width", magicTemplateWidthEdit)
  );
  ttmAdd(
    magicGroup,
    this.createField("Direction (degrees)", magicTemplateDirectionEdit)
  );
  const previewMagicTemplateEdit = ttmMake(
    "button",
    "Preview Spell Template Blueprint",
    "ttm-primary"
  );
  previewMagicTemplateEdit.type = "button";
  previewMagicTemplateEdit.addEventListener("click", () =>
    this.previewSpellTemplateBlueprint({
      type: magicTemplateTypeEdit.value,
      origin: magicTemplateOriginEdit.value,
      customX: magicTemplateXEdit.value,
      customY: magicTemplateYEdit.value,
      distance: magicTemplateDistanceEdit.value,
      angle: magicTemplateAngleEdit.value,
      width: magicTemplateWidthEdit.value,
      direction: magicTemplateDirectionEdit.value,
      casterTokenId: magicCasterTokenEdit.value
    })
  );
  const clearMagicTemplatesEdit = ttmMake(
    "button",
    "Clear Templates",
    "ttm-secondary"
  );
  clearMagicTemplatesEdit.type = "button";
  clearMagicTemplatesEdit.addEventListener(
    "click",
    () => this.clearSpellTemplateBlueprints()
  );

  const magicTemplateButtonsEdit = ttmMake(
    "div",
    null,
    "ttm-button-row"
  );
  ttmAdd(magicTemplateButtonsEdit, previewMagicTemplateEdit);
  ttmAdd(magicTemplateButtonsEdit, clearMagicTemplatesEdit);
  ttmAdd(magicGroup, magicTemplateButtonsEdit);

  const trapBehaviourGroup = makeGroup(
    "Trap Behaviour",
    ["trap"]
  );
  trapBehaviourGroup.dataset.trapBehaviourContainer = "true";
  ttmAdd(trapBehaviourGroup, behaviourTogglesEdit.trap.label);
  ttmAdd(trapBehaviourGroup, trapTypeField);
  ttmAdd(trapBehaviourGroup, generalTrapGroup);
  ttmAdd(trapBehaviourGroup, trapGroup);
  ttmAdd(trapBehaviourGroup, magicGroup);

  const resetGroup = makeGroup("Reset Settings", ["reset"]);
  ttmAdd(resetGroup, behaviourTogglesEdit.reset.label);
  ttmAdd(
    resetGroup,
    this.createHint(
      "Reset tiles restore all TalkToMe utility tiles to their saved original state."
    )
  );

  const editorGroupDefinitions = [
    [commonGroup, "Common Settings", true],
    [effectsGroupEdit, "Sound & Animation", false],
    [speechGroup, "Speech", true],
    [switchGroup, "Switch", false],
    [linkedGroup, "Linked Tile", false],
    [lightGroup, "Ambient Light", false],
    [globalLightGroup, "Global Lighting", false],
    [trapBehaviourGroup, "Trap Behaviour", false],
    [teleportGroup, "Teleport", false],
    [moveTokensGroup, "Movement", false],
    [spawnTokensGroup, "Spawning", false],
    [advancedAutomationGroup, "Advanced Automation", false],
    [resetGroup, "Reset", false]
  ];

  for (const [group, title, open] of editorGroupDefinitions) {
    ttmAdd(
      fields,
      this.makeCollapsibleSection(group, title, open)
    );
  }

  const buttons = ttmMake("div", null, "ttm-button-row");
  const selectOnCanvas = ttmMake("button", "Select on Canvas");
  selectOnCanvas.type = "button";
  const reload = ttmMake("button", "Reload");
  reload.type = "button";
  const save = ttmMake("button", "Save Changes");
  save.type = "button";

  const getSelectedTile = () => {
    return selector.value
      ? canvas.scene?.tiles?.get(selector.value) ?? null
      : null;
  };

  const updateCooldownState = () => {
    cooldownSeconds.disabled = !cooldownEnabled.input.checked;
  };

  const updateSpeechMode = () => {
    const modeValue = speechMode.value;
    const isTable = modeValue === "table";
    const isCustom = modeValue === "custom";
    const isSequence = modeValue === "conversation-sequence";
    const isAdvanced = modeValue === "conversation-advanced";

    standardSpeechEditorGroup.hidden = isSequence;

    editorRollTableField.hidden =
      !(isTable || isAdvanced);
    editorCustomTextField.hidden = !isCustom;

    speechTable.disabled = !(isTable || isAdvanced);
    speechText.disabled = !isCustom;

    sequenceConversationGroup.hidden = !isSequence;
    advancedConversationGroup.hidden = !isAdvanced;

    sequenceConversationGroup
      .querySelectorAll("input, select, textarea")
      .forEach(control => {
        control.disabled = !isSequence;
      });

    advancedConversationGroup
      .querySelectorAll("input, select, textarea")
      .forEach(control => {
        control.disabled = !isAdvanced;
      });

    conversationSequenceEnabledEdit.input.checked = isSequence;
    conversationEnabledEdit.input.checked = isAdvanced;
  };

  const updateMoveNpcEditorVisibility = () => {
    const useSpecificNpcs =
      moveTargetMode.value === "specific-npcs";

    moveNpcTokensEditField.hidden = !useSpecificNpcs;
    moveNpcTokensEdit.disabled = !useSpecificNpcs;
  };

  const updateTemplateGroups = () => {
    for (const field of fields.querySelectorAll("[data-trigger-only]")) {
      field.hidden =
        field.dataset.triggerOnly !== trigger.value;
    }

    const selected = template.value;
    const trapEnabled = behaviourTogglesEdit.trap.input.checked;

    for (const group of fields.querySelectorAll(
      ".ttm-editor-template-group"
    )) {
      const templates = String(group.dataset.templates ?? "").split(",");
      const trapTypeOnly = group.dataset.trapTypeOnly;
      group.hidden = Boolean(
        trapTypeOnly && (
          !trapEnabled || trapTypeOnly !== trapTypeEdit.value
        )
      );
    }

    trapTypeField.hidden = !trapEnabled;
    trapGroup.hidden = !trapEnabled || trapTypeEdit.value !== "mundane";
    magicGroup.hidden = !trapEnabled || trapTypeEdit.value !== "magical";

    const clickField = fields.querySelector(
      "[data-editor-click-activation='true']"
    );

    if (clickField) {
      clickField.hidden =
        selected === "speech"
        && trigger.value !== "switch";
    }

    updateSpeechMode();
    updateEditorTrapTypeVisibility();
  };

  const updateEditorTrapTypeVisibility = () => {
    const trapEnabled =
      template.value === "trap"
      && behaviourTogglesEdit.trap.input.checked;

    trapTypeField.hidden = !trapEnabled;
    trapGroup.hidden =
      !trapEnabled || trapTypeEdit.value !== "mundane";
    magicGroup.hidden =
      !trapEnabled || trapTypeEdit.value !== "magical";
  };

  trapTypeEdit.addEventListener("change", () => {
    const magical = trapTypeEdit.value === "magical";
    behaviourTogglesEdit.trap.input.checked = true;
    behaviourTogglesEdit.magic.input.checked = magical;
    updateTemplateGroups();
    updateEditorTrapTypeVisibility();
  });

  for (const toggle of Object.values(behaviourTogglesEdit)) {
    toggle.input.addEventListener("change", updateTemplateGroups);
  }

  const loadTile = () => {
    const tileDoc = getSelectedTile();
    fields.hidden = !tileDoc;

    if (!tileDoc) {
      status.textContent =
        "Select a tile to load its TalkToMe settings.";
      return;
    }

    const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
    const speech = tileDoc.getFlag(TTM_ID, "speech") ?? {};
    const legacyMagicTile = utility.template === "magic";
    const selectedTemplate = legacyMagicTile
      ? "trap"
      : (utility.template ?? "speech");
    const savedMultiUse =
      tileDoc.getFlag(TTM_ID, "multiUse") ?? {};
    const savedAdditionalTemplates = new Set(
      Array.isArray(savedMultiUse.actions)
        ? savedMultiUse.actions.map(action => action.template)
        : []
    );

    for (const [key, toggle] of Object.entries(
      behaviourTogglesEdit
    )) {
      if (key === "speech") {
        toggle.input.checked = selectedTemplate === "speech";
      } else if (key === "trap") {
        toggle.input.checked = selectedTemplate === "trap";
      } else if (key === "magic") {
        toggle.input.checked =
          selectedTemplate === "trap"
          && (legacyMagicTile || utility.trapType === "magical");
      } else {
        toggle.input.checked =
          key === selectedTemplate
          || savedAdditionalTemplates.has(key);
      }

      toggle.input.disabled = key === selectedTemplate;
    }

    name.value = tileDoc.name ?? speech.name ?? "";
    template.value = selectedTemplate;
    trapTypeEdit.value = legacyMagicTile
      ? "magical"
      : (utility.trapType ?? "mundane");
    mundaneTrapTypeEdit.value =
      utility.mundaneTrapType ?? "projectile";
    trapDelaySecondsEdit.value = Math.max(
      0,
      Number(utility.trapDelaySeconds ?? 0)
    );
    trapTriggerChanceEdit.value = Math.max(
      0,
      Math.min(100, Number(utility.trapTriggerChance ?? 100))
    );
    trapTriggerOnceEdit.input.checked =
      utility.trapTriggerOnce === true;
    trapDisableAfterTriggerEdit.input.checked =
      utility.trapDisableAfterTrigger === true;
    trapPauseGameEdit.input.checked =
      utility.trapPauseGame === true;
    trigger.value = speech.trigger ?? utility.trigger ?? "manual";
    clickActivation.value =
      speech.clickActivation
      ?? utility.clickActivation
      ?? "left";

    width.value = Number(tileDoc.width ?? 100);
    height.value = Number(tileDoc.height ?? 100);
    inactiveImage.value =
      utility.inactiveImage
      ?? utility.defaultImage
      ?? tileDoc.texture?.src
      ?? "";
    activeImage.value = utility.activeImage ?? "";

    // Always resolve either historical linked field into the editor.
    linkedTileId.value =
      utility.linkedTriggerTileId
      || utility.targetTileId
      || "";

    doorWallId.value = utility.doorWallId ?? "";
    doorAction.value = utility.doorAction ?? "toggle";

    lightDim.value = Number(utility.lightDim ?? 20);
    lightBright.value = Number(utility.lightBright ?? 10);
    lightColor.value = utility.lightColor ?? "#ffffff";
    lightAlpha.value = Number(utility.lightAlpha ?? 0.5);
    lightAnimation.value = utility.lightAnimation ?? "";
    globalLightAction.value = utility.globalLightAction ?? "toggle";
    globalDarkness.value = Number(utility.globalDarkness ?? 0.75);
    globalLightColorOverride.input.checked =
      utility.globalLightColorOverride === true;
    globalLightColor.value = utility.globalLightColor ?? "#ffffff";
    saveAbility.value = utility.saveAbility ?? "dex";
    saveDC.value = Number(utility.saveDC ?? 10);
    trapTarget.value = utility.trapTarget ?? "triggering-token";

    moveDestinationX.value = utility.moveDestinationX ?? "";
    moveDestinationY.value = utility.moveDestinationY ?? "";
    moveRouteEdit.value = JSON.stringify(
      Array.isArray(utility.moveRoute)
        ? utility.moveRoute
        : []
    );
    moveRouteEditField.refreshRouteSummary?.();
    moveTargetMode.value =
      utility.moveTargetMode ?? "triggering-token";

    const selectedMoveTokenIds = new Set(
      Array.isArray(utility.moveTokenIds)
        ? utility.moveTokenIds
        : []
    );

    for (const option of moveNpcTokensEdit.options) {
      option.selected = selectedMoveTokenIds.has(option.value);
    }

    moveOffsetX.value = Number(utility.moveOffsetX ?? 0);
    moveOffsetY.value = Number(utility.moveOffsetY ?? 0);
    moveSpacing.value = Number(
      utility.moveSpacing ?? canvas.grid?.size ?? 100
    );
    moveAutoRotateEdit.input.checked =
      utility.moveAutoRotate === true;

    spawnActorEdit.value = utility.spawnActorId ?? "";
    spawnQuantityEdit.value = Number(utility.spawnQuantity ?? 1);
    spawnXEdit.value = utility.spawnX ?? "";
    spawnYEdit.value = utility.spawnY ?? "";
    spawnFormationEdit.value = utility.spawnFormation ?? "grid";
    spawnSpacingEdit.value = Number(utility.spawnSpacing ?? canvas.grid?.size ?? 100);
    spawnHiddenEdit.input.checked = utility.spawnHidden === true;
    spawnRemoveOnResetEdit.input.checked = utility.spawnRemoveOnReset !== false;
    magicCasterTokenEdit.value =
      utility.magicCasterTokenId ?? "";
    refreshEditorMagicSpells(
      utility.magicSpellItemId ?? "",
      utility.magicActivityId ?? ""
    );
    magicCastLevelEdit.value =
      String(utility.magicCastLevel ?? "auto");
    magicConsumeSlotEdit.input.checked =
      utility.magicConsumeSlot !== false;
    magicAutoCastEdit.input.checked =
      utility.magicAutoCast !== false
      && utility.magicConfigureDialog !== true;
    magicConfigureDialogEdit.input.checked =
      utility.magicConfigureDialog === true;
    magicTargetModeEdit.value =
      utility.magicTargetMode ?? "none";
    magicTemplateTypeEdit.value =
      utility.magicTemplateType ?? "none";
    magicTemplateOriginEdit.value =
      utility.magicTemplateOrigin ?? "tile";
    magicTemplateXEdit.value = utility.magicTemplateX ?? "";
    magicTemplateYEdit.value = utility.magicTemplateY ?? "";
    magicTemplateDistanceEdit.value = Number(
      utility.magicTemplateDistance ?? 20
    );
    magicTemplateAngleEdit.value = Number(
      utility.magicTemplateAngle ?? 90
    );
    magicTemplateWidthEdit.value = Number(
      utility.magicTemplateWidth ?? 5
    );
    magicTemplateDirectionEdit.value = Number(
      utility.magicTemplateDirection ?? 0
    );
    const loadedMagicToken = canvas.tokens?.get(
      magicCasterTokenEdit.value
    );
    const loadedMagicSpell =
      loadedMagicToken?.actor?.items?.get(
        magicSpellItemEdit.value
      );

    if (
      !utility.magicTemplateType
      || utility.magicTemplateType === "none"
    ) {
      this.applyDetectedSpellTemplate({
        spell: loadedMagicSpell,
        typeInput: magicTemplateTypeEdit,
        distanceInput: magicTemplateDistanceEdit,
        angleInput: magicTemplateAngleEdit,
        widthInput: magicTemplateWidthEdit,
        statusElement: magicTemplateDetectedStatusEdit
      });
    } else {
      magicTemplateDetectedStatusEdit.textContent =
        "Saved template settings loaded. Change the spell to detect again.";
    }

    teleportX.value = utility.teleportX ?? "";
    teleportY.value = utility.teleportY ?? "";
    teleportOffsetX.value = Number(utility.teleportOffsetX ?? 0);
    teleportOffsetY.value = Number(utility.teleportOffsetY ?? 0);
    teleportAutoReset.input.checked =
      utility.teleportAutoReset !== false;
    teleportResetSeconds.value = Number(
      utility.teleportResetSeconds ?? 3
    );
    teleportUseCooldown.input.checked =
      utility.teleportUseCooldown !== false;
    teleportCooldownSeconds.value = Number(
      utility.teleportCooldownSeconds ?? 3
    );
    teleportAvoidTiles.input.checked =
      utility.teleportAvoidTiles !== false;
    teleportCreateReturn.input.checked =
      utility.teleportCreateReturn === true;
    hotspotSize.value = Number(utility.hotspotSize ?? 64);
    hotspotOffsetX.value = Number(utility.hotspotOffsetX ?? 0);
    hotspotOffsetY.value = Number(utility.hotspotOffsetY ?? 0);

    const nodeGraph =
      tileDoc.getFlag(TTM_ID, "nodeGraph") ?? {};
    nodeGraphModeEdit.value =
      nodeGraph.mode ?? "sequence";
    nodeGraphTargetsEdit.value = (
      Array.isArray(nodeGraph.targets)
        ? nodeGraph.targets
        : []
    )
      .map(target =>
        `${target.tileId ?? ""} | ${Number(target.delay ?? 0)}`
      )
      .join("\n");

    const multiUse =
      tileDoc.getFlag(TTM_ID, "multiUse") ?? {};
    multiUseModeEdit.value =
      multiUse.mode ?? "sequence";
    multiUseActionsEdit.value = JSON.stringify(
      Array.isArray(multiUse.actions)
        ? multiUse.actions
        : [],
      null,
      2
    );

    if (speech.conversationSequenceEnabled === true) {
      speechMode.value = "conversation-sequence";
    } else if (speech.conversationEnabled === true) {
      speechMode.value = "conversation-advanced";
    } else {
      speechMode.value = speech.mode ?? "table";
    }

    speechTable.value = speech.tableId ?? "";
    speechText.value = speech.text ?? "";
    speechNpcName.value = speech.npcName ?? "";
    speechSubjectToken.value = speech.subjectTokenId ?? "";
    conversationEnabledEdit.input.checked =
      speech.conversationEnabled === true;
    conversationIdEdit.value = speech.conversationId ?? "";
    conversationStartEdit.input.checked =
      speech.conversationStart === true;
    conversationStartNodeEdit.value =
      speech.conversationStartNode ?? "start";
    conversationNextTileIdEdit.value =
      speech.conversationNextTileId ?? "";

    conversationSequenceEnabledEdit.input.checked =
      speech.conversationSequenceEnabled === true;

    conversationOrderEdit.value = Array.isArray(
      speech.conversationOrder
    )
      ? speech.conversationOrder.join(",")
      : "";

    conversationLineDelayEdit.value = Number(
      speech.conversationLineDelay ?? 3
    );

    const participants = Array.isArray(
      speech.conversationParticipants
    )
      ? speech.conversationParticipants
      : [];

    for (const editor of conversationParticipantEditors) {
      const participant = participants[editor.slot - 1] ?? {};
      editor.token.value = participant.tokenId ?? "";
      editor.table.value = participant.tableId ?? "";
      editor.npcName.value = participant.npcName ?? "";
    }

    postChat.input.checked = speech.postChat === true;
    zoomToSpeaker.input.checked = speech.zoomToSpeaker === true;
    typingAnimation.input.checked =
      speech.typingAnimation === true;

    showToPlayers.input.checked = tileDoc.hidden !== true;
    requireVision.input.checked =
      utility.requirePlayerVision === true;
    hideBehindWalls.input.checked =
      utility.hideBehindWalls === true;
    multipleUseEdit.input.checked =
      utility.multipleUse !== false;

    activationAudienceEdit.value =
      this.activationTypesToAudienceValue(
        utility.activationActorTypes
      );

    effectsEnabledEdit.input.checked =
      utility.effectsEnabled === true
      || utility.soundEnabled === true
      || utility.animationEnabled === true;
    soundEnabledEdit.input.checked =
      utility.soundEnabled === true;
    soundFileEdit.value = utility.soundFile ?? "";
    soundVolumeEdit.value = Number(
      utility.soundVolume ?? 0.8
    );
    animationEnabledEdit.input.checked =
      utility.animationEnabled === true;
    animationTypeEdit.value =
      utility.animationType ?? "none";
    animationDurationEdit.value = Number(
      utility.animationDuration ?? 0.7
    );

    cooldownEnabled.input.checked =
      utility.activationCooldownEnabled === true;
    cooldownSeconds.value = Number(
      utility.activationCooldownSeconds ?? 1
    );

    updateCooldownState();
    updateMoveNpcEditorVisibility();
    synchronisePrimaryBehaviourEdit();

    status.textContent =
      `Editing ${tileDoc.name ?? tileDoc.id} (${tileDoc.id})`;
  };

  selector.addEventListener("change", loadTile);
  reload.addEventListener("click", loadTile);
  const synchronisePrimaryBehaviourEdit = () => {
    for (const [key, toggle] of Object.entries(
      behaviourTogglesEdit
    )) {
      if (key === template.value) {
        toggle.input.checked = true;
        toggle.input.disabled = true;
      } else {
        toggle.input.disabled = false;
      }

      toggle.input.dispatchEvent(
        new Event("change")
      );
    }

    effectsEnabledEdit.input.dispatchEvent(
      new Event("change")
    );
    updateTemplateGroups();
  };

  this.bindOptionalSection(
    effectsGroupEdit,
    effectsEnabledEdit.input
  );
  this.bindOptionalSection(
    speechGroup,
    behaviourTogglesEdit.speech.input
  );
  this.bindOptionalSection(
    switchGroup,
    behaviourTogglesEdit.switch.input
  );
  this.bindOptionalSection(
    lightGroup,
    behaviourTogglesEdit.light.input
  );
  this.bindOptionalSection(
    globalLightGroup,
    behaviourTogglesEdit.globalLight.input
  );
  this.bindOptionalSection(
    trapGroup,
    behaviourTogglesEdit.trap.input
  );
  this.bindOptionalSection(
    teleportGroup,
    behaviourTogglesEdit.teleport.input
  );
  this.bindOptionalSection(
    moveTokensGroup,
    behaviourTogglesEdit.moveTokens.input
  );
  this.bindOptionalSection(
    spawnTokensGroup,
    behaviourTogglesEdit.spawnTokens.input
  );
  this.bindOptionalSection(
    magicGroup,
    behaviourTogglesEdit.trap.input
  );
  this.bindOptionalSection(
    resetGroup,
    behaviourTogglesEdit.reset.input
  );

  template.addEventListener("change", synchronisePrimaryBehaviourEdit);
  trigger.addEventListener("change", updateTemplateGroups);
  moveTargetMode.addEventListener(
    "change",
    updateMoveNpcEditorVisibility
  );
  speechMode.addEventListener("change", updateSpeechMode);
  conversationSequenceEnabledEdit.input.addEventListener(
    "change",
    updateSpeechMode
  );
  cooldownEnabled.input.addEventListener(
    "change",
    updateCooldownState
  );

  selectOnCanvas.addEventListener("click", () => {
    const tileDoc = getSelectedTile();
    if (!tileDoc) return;

    canvas.tiles?.activate?.();
    canvas.tiles?.get(tileDoc.id)?.control?.({ releaseOthers: true });
    canvas.animatePan?.({
      x: Number(tileDoc.x ?? 0) + Number(tileDoc.width ?? 0) / 2,
      y: Number(tileDoc.y ?? 0) + Number(tileDoc.height ?? 0) / 2
    });
  });

  save.addEventListener("click", async () => {
    const tileDoc = getSelectedTile();

    if (!tileDoc) {
      ui.notifications.warn("Select a TalkToMe tile to edit.");
      return;
    }

    const currentUtility =
      tileDoc.getFlag(TTM_ID, "utility") ?? {};
    const currentSpeech =
      tileDoc.getFlag(TTM_ID, "speech") ?? {};
    const selectedTemplate = template.value;

    if (
      selectedTemplate === "moveTokens"
      && moveTargetMode.value === "specific-npcs"
      && moveNpcTokensEdit.selectedOptions.length === 0
    ) {
      ui.notifications.warn(
        "Select at least one NPC for the Move Tokens tile."
      );
      return;
    }

    if (
      selectedTemplate === "speech"
      && speechMode.value === "conversation-sequence"
    ) {
      const orderValues = String(
        conversationOrderEdit.value ?? ""
      )
        .split(",")
        .map(value => Number(value.trim()))
        .filter(value => Number.isInteger(value));

      if (!orderValues.length) {
        ui.notifications.warn(
          "Enter a conversation speaking order such as 1,1,2,2."
        );
        return;
      }

      const missingSlot = orderValues.find(slot => {
        return (
          slot < 1
          || slot > 5
          || !conversationParticipantEditors[
            slot - 1
          ]?.table.value
        );
      });

      if (missingSlot) {
        ui.notifications.warn(
          `NPC ${missingSlot} is used in the speaking order `
          + "but has no RollTable assigned."
        );
        return;
      }
    }
    const chosenInactiveImage = inactiveImage.value.trim();
    const chosenLinkedId = linkedTileId.value.trim();

    const nodeTargets = String(nodeGraphTargetsEdit.value ?? "")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [tileIdPart, delayPart = "0"] = line.split("|");

        return {
          tileId: String(tileIdPart ?? "").trim(),
          delay: Math.max(
            0,
            Number(String(delayPart).trim() || 0)
          )
        };
      })
      .filter(target =>
        target.tileId
        && target.tileId !== tileDoc.id
      );

    let multiUseActions = [];

    try {
      const parsed = JSON.parse(
        multiUseActionsEdit.value || "[]"
      );

      if (!Array.isArray(parsed)) {
        throw new Error("Multi-use actions must be a JSON array.");
      }

      multiUseActions = parsed;
    } catch (error) {
      ui.notifications.warn(
        `Multi-use actions JSON is invalid: ${error.message}`
      );
      return;
    }

    const utilityPatch = {
      template: selectedTemplate,
      trigger: trigger.value,
      clickActivation: clickActivation.value,
      inactiveImage: chosenInactiveImage,
      defaultImage: chosenInactiveImage,
      activeImage: activeImage.value.trim(),
      linkedTriggerTileId: chosenLinkedId,
      targetTileId: chosenLinkedId,
      requirePlayerVision: requireVision.input.checked,
      hideBehindWalls: hideBehindWalls.input.checked,
      multipleUse: multipleUseEdit.input.checked,
      activationActorTypes:
        this.activationAudienceValueToTypes(
          activationAudienceEdit.value
        ),
      effectsEnabled: effectsEnabledEdit.input.checked,
      soundEnabled:
        effectsEnabledEdit.input.checked
        && soundEnabledEdit.input.checked,
      soundFile: soundFileEdit.value.trim(),
      soundVolume: Math.max(
        0,
        Math.min(1, Number(soundVolumeEdit.value || 0.8))
      ),
      animationEnabled:
        effectsEnabledEdit.input.checked
        && animationEnabledEdit.input.checked,
      animationType: animationTypeEdit.value,
      animationDuration: Math.max(
        0.15,
        Number(animationDurationEdit.value || 0.7)
      ),
      activationCooldownEnabled: cooldownEnabled.input.checked,
      activationCooldownSeconds: Math.max(
        0.2,
        Number(cooldownSeconds.value || 1)
      ),
      trapType:
        selectedTemplate === "trap"
          ? trapTypeEdit.value
          : (utility.trapType ?? "mundane"),
      mundaneTrapType:
        selectedTemplate === "trap"
          ? mundaneTrapTypeEdit.value
          : (utility.mundaneTrapType ?? "projectile")
    };

    if (selectedTemplate === "switch") {
      Object.assign(utilityPatch, {
        doorWallId: doorWallId.value.trim(),
        doorAction: doorAction.value
      });
    }

    if (selectedTemplate === "light") {
      Object.assign(utilityPatch, {
        lightDim: Number(lightDim.value || 20),
        lightBright: Number(lightBright.value || 10),
        lightColor: lightColor.value.trim() || "#ffffff",
        lightAlpha: Number(lightAlpha.value || 0.5),
        lightAnimation: lightAnimation.value
      });
    }

    if (selectedTemplate === "globalLight") {
      Object.assign(utilityPatch, {
        globalLightAction: globalLightAction.value,
        globalDarkness: Math.max(
          0,
          Math.min(1, Number(globalDarkness.value || 0.75))
        ),
        globalLightColorOverride:
          globalLightColorOverride.input.checked,
        globalLightColor:
          globalLightColor.value.trim() || "#ffffff",
        globalLightUseFoundryFade: true
      });
    }

    if (selectedTemplate === "trap") {
      Object.assign(utilityPatch, {
        saveAbility: saveAbility.value,
        saveDC: Number(saveDC.value || 10),
        trapTarget: trapTarget.value,
        mundaneTrapType: mundaneTrapTypeEdit.value
      });
    }

    if (selectedTemplate === "moveTokens") {
      Object.assign(utilityPatch, {
        moveDestinationX: moveDestinationX.value,
        moveDestinationY: moveDestinationY.value,
        moveRoute: (() => {
          try {
            const parsed = JSON.parse(
              moveRouteEdit.value || "[]"
            );
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })(),
        moveTargetMode: moveTargetMode.value,
        moveTokenIds: Array.from(
          moveNpcTokensEdit.selectedOptions
        ).map(option => option.value),
        moveOffsetX: Number(moveOffsetX.value || 0),
        moveOffsetY: Number(moveOffsetY.value || 0),
        moveSpacing: Math.max(
          0,
          Number(moveSpacing.value || 0)
        ),
        moveAutoRotate: moveAutoRotateEdit.input.checked
      });
    }

    if (selectedTemplate === "spawnTokens") {
      if (!spawnActorEdit.value) {
        ui.notifications.warn("Choose an Actor to spawn.");
        return;
      }

      if (
        !Number.isFinite(Number(spawnXEdit.value))
        || !Number.isFinite(Number(spawnYEdit.value))
      ) {
        ui.notifications.warn("Choose a valid spawn location.");
        return;
      }

      Object.assign(utilityPatch, {
        spawnActorId: spawnActorEdit.value,
        spawnQuantity: Math.max(1, Math.min(50, Number(spawnQuantityEdit.value || 1))),
        spawnX: spawnXEdit.value,
        spawnY: spawnYEdit.value,
        spawnFormation: spawnFormationEdit.value,
        spawnSpacing: Math.max(0, Number(spawnSpacingEdit.value || 0)),
        spawnHidden: spawnHiddenEdit.input.checked,
        spawnRemoveOnReset: spawnRemoveOnResetEdit.input.checked
      });
    }

    if (
      selectedTemplate === "trap"
      && trapTypeEdit.value === "magical"
    ) {
      if (
        !magicCasterTokenEdit.value
        || !magicSpellItemEdit.value
      ) {
        ui.notifications.warn(
          "Choose a caster token and spell."
        );
        return;
      }

      Object.assign(utilityPatch, {
        trapType: trapTypeEdit.value,
      magicCasterTokenId: magicCasterTokenEdit.value,
        magicSpellItemId: magicSpellItemEdit.value,
        magicActivityId: magicActivityEdit.value,
        magicCastLevel: magicCastLevelEdit.value,
        magicConsumeSlot: magicConsumeSlotEdit.input.checked,
        magicAutoCast: magicAutoCastEdit.input.checked,
        magicConfigureDialog:
          magicAutoCastEdit.input.checked
            ? false
            : magicConfigureDialogEdit.input.checked,
        magicTargetMode: magicTargetModeEdit.value,
        magicTemplateType: magicTemplateTypeEdit.value,
        magicTemplateOrigin: magicTemplateOriginEdit.value,
        magicTemplateX: magicTemplateXEdit.value,
        magicTemplateY: magicTemplateYEdit.value,
        magicTemplateDistance: Number(magicTemplateDistanceEdit.value || 20),
        magicTemplateAngle: Number(magicTemplateAngleEdit.value || 90),
        magicTemplateWidth: Number(magicTemplateWidthEdit.value || 5),
        magicTemplateDirection: Number(magicTemplateDirectionEdit.value || 0)
      });
    }

    if (selectedTemplate === "teleport") {
      Object.assign(utilityPatch, {
        teleportX: teleportX.value,
        teleportY: teleportY.value,
        teleportOffsetX: Number(teleportOffsetX.value || 0),
        teleportOffsetY: Number(teleportOffsetY.value || 0),
        teleportAutoReset: teleportAutoReset.input.checked,
        teleportResetSeconds: Number(
          teleportResetSeconds.value || 0
        ),
        teleportUseCooldown: teleportUseCooldown.input.checked,
        teleportCooldownSeconds: Number(
          teleportCooldownSeconds.value || 0
        ),
        teleportAvoidTiles: teleportAvoidTiles.input.checked,
        teleportCreateReturn:
          teleportCreateReturn.input.checked,
        hotspotSize: Math.max(
          1,
          Number(hotspotSize.value || 64)
        ),
        hotspotOffsetX: Number(hotspotOffsetX.value || 0),
        hotspotOffsetY: Number(hotspotOffsetY.value || 0)
      });
    }

    const originalPatch = {
      active: false,
      image: chosenInactiveImage,
      inactiveImage: chosenInactiveImage,
      activeImage: activeImage.value.trim(),
      requirePlayerVision: requireVision.input.checked,
      hideBehindWalls: hideBehindWalls.input.checked,
      multipleUse: multipleUseEdit.input.checked,
      activationActorTypes:
        this.activationAudienceValueToTypes(
          activationAudienceEdit.value
        ),
      effectsEnabled: effectsEnabledEdit.input.checked,
      soundEnabled:
        effectsEnabledEdit.input.checked
        && soundEnabledEdit.input.checked,
      soundFile: soundFileEdit.value.trim(),
      soundVolume: Math.max(
        0,
        Math.min(1, Number(soundVolumeEdit.value || 0.8))
      ),
      animationEnabled:
        effectsEnabledEdit.input.checked
        && animationEnabledEdit.input.checked,
      animationType: animationTypeEdit.value,
      animationDuration: Math.max(
        0.15,
        Number(animationDurationEdit.value || 0.7)
      ),
      activationCooldownEnabled: cooldownEnabled.input.checked,
      activationCooldownSeconds: Math.max(
        0.2,
        Number(cooldownSeconds.value || 1)
      ),
      ...utilityPatch
    };

    const utilityUpdates = foundry.utils.mergeObject(
      currentUtility,
      {
        ...utilityPatch,
        originalState: foundry.utils.mergeObject(
          currentUtility.originalState ?? {},
          originalPatch,
          { inplace: false }
        )
      },
      { inplace: false }
    );

    const speechUpdates = foundry.utils.mergeObject(
      currentSpeech,
      {
        managed: true,
        name: name.value.trim(),
        trigger: trigger.value,
        clickActivation: clickActivation.value,
        tileImage: chosenInactiveImage,
        mode: selectedTemplate === "speech"
          ? (
              speechMode.value === "custom"
                ? "custom"
                : "table"
            )
          : currentSpeech.mode,
        tableId: selectedTemplate === "speech"
          ? speechTable.value
          : currentSpeech.tableId,
        text: selectedTemplate === "speech"
          ? speechText.value
          : currentSpeech.text,
        npcName: selectedTemplate === "speech"
          ? speechNpcName.value.trim()
          : currentSpeech.npcName,
        subjectTokenId: selectedTemplate === "speech"
          ? speechSubjectToken.value
          : currentSpeech.subjectTokenId,
        postChat: selectedTemplate === "speech"
          ? postChat.input.checked
          : currentSpeech.postChat,
        zoomToSpeaker: selectedTemplate === "speech"
          ? zoomToSpeaker.input.checked
          : currentSpeech.zoomToSpeaker,
        typingAnimation: selectedTemplate === "speech"
          ? typingAnimation.input.checked
          : currentSpeech.typingAnimation,
        conversationEnabled: selectedTemplate === "speech"
          ? speechMode.value === "conversation-advanced"
          : currentSpeech.conversationEnabled,
        conversationId: selectedTemplate === "speech"
          ? conversationIdEdit.value.trim()
          : currentSpeech.conversationId,
        conversationStart: selectedTemplate === "speech"
          ? conversationStartEdit.input.checked
          : currentSpeech.conversationStart,
        conversationStartNode: selectedTemplate === "speech"
          ? (conversationStartNodeEdit.value.trim() || "start")
          : currentSpeech.conversationStartNode,
        conversationNextTileId: selectedTemplate === "speech"
          ? conversationNextTileIdEdit.value.trim()
          : currentSpeech.conversationNextTileId,
        conversationSequenceEnabled:
          selectedTemplate === "speech"
            ? speechMode.value === "conversation-sequence"
            : currentSpeech.conversationSequenceEnabled,
        conversationParticipants:
          selectedTemplate === "speech"
            ? conversationParticipantEditors.map(editor => ({
                tokenId: editor.token.value,
                tableId: editor.table.value,
                npcName: editor.npcName.value.trim()
              }))
            : currentSpeech.conversationParticipants,
        conversationOrder:
          selectedTemplate === "speech"
            ? String(conversationOrderEdit.value ?? "")
                .split(",")
                .map(value => Number(value.trim()))
                .filter(value =>
                  Number.isInteger(value)
                  && value >= 1
                  && value <= 5
                )
            : currentSpeech.conversationOrder,
        conversationLineDelay:
          selectedTemplate === "speech"
            ? Math.max(
                0.25,
                Number(conversationLineDelayEdit.value || 3)
              )
            : currentSpeech.conversationLineDelay
      },
      { inplace: false }
    );

    const updates = {
      name: name.value.trim() || tileDoc.name,
      width: Math.max(
        1,
        Number(width.value || tileDoc.width || 100)
      ),
      height: Math.max(
        1,
        Number(height.value || tileDoc.height || 100)
      ),
      hidden: !showToPlayers.input.checked,
      [`flags.${TTM_ID}.utility`]: utilityUpdates,
      [`flags.${TTM_ID}.speech`]: speechUpdates
    };

    if (chosenInactiveImage && utilityUpdates.active !== true) {
      updates["texture.src"] = chosenInactiveImage;
    }

    await tileDoc.update(updates);

    if (nodeTargets.length) {
      await tileDoc.setFlag(TTM_ID, "nodeGraph", {
        enabled: true,
        mode: nodeGraphModeEdit.value,
        targets: nodeTargets
      });
    } else {
      await tileDoc.unsetFlag(TTM_ID, "nodeGraph");
    }

    const automaticActions = [];
    const addAutomaticAction = (key, data) => {
      if (
        key !== selectedTemplate
        && behaviourTogglesEdit[key]?.input.checked
      ) {
        automaticActions.push({ template: key, ...data });
      }
    };

    addAutomaticAction("speech", {
      mode: speechMode.value === "custom" ? "custom" : "table",
      text: speechText.value,
      tableId: speechTable.value,
      tokenId: speechSubjectToken.value,
      npcName: speechNpcName.value.trim()
    });
    addAutomaticAction("switch", {
      doorWallId: doorWallId.value.trim(),
      doorAction: doorAction.value
    });
    addAutomaticAction("light", {
      lightDim: Number(lightDim.value || 20),
      lightBright: Number(lightBright.value || 10),
      lightColor: lightColor.value.trim() || "#ffffff",
      lightAlpha: Number(lightAlpha.value || 0.5),
      lightAnimation: lightAnimation.value
    });
    addAutomaticAction("globalLight", {
      globalLightAction: globalLightAction.value,
      globalDarkness: Math.max(
        0,
        Math.min(1, Number(globalDarkness.value || 0.75))
      )
    });
    addAutomaticAction("trap", {
      saveAbility: saveAbility.value,
      saveDC: Number(saveDC.value || 10),
      trapTarget: trapTarget.value
    });
    addAutomaticAction("teleport", {
      teleportX: teleportX.value,
      teleportY: teleportY.value,
      teleportOffsetX: Number(teleportOffsetX.value || 0),
      teleportOffsetY: Number(teleportOffsetY.value || 0),
      teleportAvoidTiles: teleportAvoidTiles.input.checked,
      teleportUseCooldown: teleportUseCooldown.input.checked,
      teleportCooldownSeconds: Number(
        teleportCooldownSeconds.value || 0
      )
    });
    addAutomaticAction("moveTokens", {
      moveDestinationX: moveDestinationX.value,
      moveDestinationY: moveDestinationY.value,
      moveRoute: (() => {
        try {
          const parsed = JSON.parse(moveRouteEdit.value || "[]");
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })(),
      moveTargetMode: moveTargetMode.value,
      moveTokenIds: Array.from(
        moveNpcTokensEdit.selectedOptions
      ).map(option => option.value),
      moveOffsetX: Number(moveOffsetX.value || 0),
      moveOffsetY: Number(moveOffsetY.value || 0),
      moveSpacing: Math.max(0, Number(moveSpacing.value || 0)),
      moveAutoRotate: moveAutoRotateEdit.input.checked
    });
    addAutomaticAction("magic", {
      magicCasterTokenId: magicCasterTokenEdit.value,
      magicSpellItemId: magicSpellItemEdit.value,
      magicActivityId: magicActivityEdit.value,
      magicCastLevel: magicCastLevelEdit.value,
      magicConsumeSlot: magicConsumeSlotEdit.input.checked,
      magicAutoCast: magicAutoCastEdit.input.checked,
      magicConfigureDialog:
        magicAutoCastEdit.input.checked
          ? false
          : magicConfigureDialogEdit.input.checked,
      magicTargetMode: magicTargetModeEdit.value,
      magicTemplateType: magicTemplateTypeEdit.value,
      magicTemplateOrigin: magicTemplateOriginEdit.value,
      magicTemplateX: magicTemplateXEdit.value,
      magicTemplateY: magicTemplateYEdit.value,
      magicTemplateDistance: Number(magicTemplateDistanceEdit.value || 20),
      magicTemplateAngle: Number(magicTemplateAngleEdit.value || 90),
      magicTemplateWidth: Number(magicTemplateWidthEdit.value || 5),
      magicTemplateDirection: Number(magicTemplateDirectionEdit.value || 0)
    });
    addAutomaticAction("spawnTokens", {
      spawnActorId: spawnActorEdit.value,
      spawnQuantity: Math.max(
        1,
        Math.min(50, Number(spawnQuantityEdit.value || 1))
      ),
      spawnX: spawnXEdit.value,
      spawnY: spawnYEdit.value,
      spawnFormation: spawnFormationEdit.value,
      spawnSpacing: Math.max(
        0,
        Number(spawnSpacingEdit.value || 0)
      ),
      spawnHidden: spawnHiddenEdit.input.checked,
      spawnRemoveOnReset: spawnRemoveOnResetEdit.input.checked
    });
    addAutomaticAction("reset", {});

    if (automaticActions.length) {
      await tileDoc.setFlag(TTM_ID, "multiUse", {
        enabled: true,
        mode: "sequence",
        actions: automaticActions
      });
    } else {
      await tileDoc.unsetFlag(TTM_ID, "multiUse");
    }

    ui.notifications.info(
      `TalkToMe updated ${tileDoc.name ?? tileDoc.id}.`
    );

    this.refreshManagedTileList();
    loadTile();
  });

  ttmAdd(buttons, selectOnCanvas);
  ttmAdd(buttons, reload);
  ttmAdd(buttons, save);

  ttmAdd(box, this.createField("TalkToMe tile", selector));
  ttmAdd(box, status);
  ttmAdd(box, fields);
  ttmAdd(box, buttons);

  setTimeout(() => {
    updateCooldownState();
    updateTemplateGroups();
  }, 0);

  return box;
}

  // Node-based tile chains
  createNodeEditorPanel() {
    const panel = ttmMake("section", null, "ttm-panel");
    panel.dataset.panel = "nodes";
    panel.hidden = this.activeTab !== "nodes";

    ttmAdd(
      panel,
      this.createHint(
        "Build a chain on one source tile. The source can trigger "
        + "multiple existing tiles without placing extra connector tiles."
      )
    );

    const sourceSelect = ttmMake("select");
    const sourceBlank = ttmMake(
      "option",
      "— Choose the source tile —"
    );
    sourceBlank.value = "";
    ttmAdd(sourceSelect, sourceBlank);

    for (const tile of this.getTalkToMeTiles()) {
      const option = ttmMake(
        "option",
        `${tile.name ?? "Tile"} [${tile.id}]`
      );
      option.value = tile.id;
      ttmAdd(sourceSelect, option);
    }

    const mode = ttmMake("select");
    for (const [value, label] of [
      ["sequence", "Run targets in sequence"],
      ["parallel", "Run all targets together"]
    ]) {
      const option = ttmMake("option", label);
      option.value = value;
      ttmAdd(mode, option);
    }

    const rows = ttmMake(
      "div",
      null,
      "ttm-node-target-list"
    );

    const createTargetSelect = () => {
      const select = ttmMake("select");
      const blank = ttmMake(
        "option",
        "— Choose a target tile —"
      );
      blank.value = "";
      ttmAdd(select, blank);

      for (const tile of this.getTalkToMeTiles()) {
        const option = ttmMake(
          "option",
          `${tile.name ?? "Tile"} [${tile.id}]`
        );
        option.value = tile.id;
        ttmAdd(select, option);
      }

      return select;
    };

    const addTargetRow = (data = {}) => {
      const row = ttmMake(
        "div",
        null,
        "ttm-node-target-row"
      );
      const target = createTargetSelect();
      const delay = ttmMake("input");
      const remove = ttmMake("button", "Remove");

      target.value = data.tileId ?? "";
      delay.type = "number";
      delay.min = 0;
      delay.step = 0.1;
      delay.value = Number(data.delay ?? 0);
      delay.title = "Delay before this target runs, in seconds";

      remove.type = "button";
      remove.addEventListener("click", () => row.remove());

      ttmAdd(row, target);
      ttmAdd(row, delay);
      ttmAdd(row, remove);
      rows.appendChild(row);
    };

    const loadGraph = () => {
      rows.replaceChildren();

      const source = canvas.scene?.tiles?.get(
        sourceSelect.value
      );
      const graph =
        source?.getFlag(TTM_ID, "nodeGraph") ?? {};

      mode.value = graph.mode ?? "sequence";

      const targets = Array.isArray(graph.targets)
        ? graph.targets
        : [];

      if (!targets.length) addTargetRow();
      else targets.forEach(addTargetRow);
    };

    sourceSelect.addEventListener("change", loadGraph);

    const addTarget = ttmMake(
      "button",
      "＋ Add Target Tile",
      "ttm-node-editor-button"
    );
    addTarget.type = "button";
    addTarget.addEventListener(
      "click",
      () => addTargetRow()
    );

    const save = ttmMake(
      "button",
      "Save Tile Chain",
      "ttm-node-editor-button"
    );
    save.type = "button";
    save.addEventListener("click", async () => {
      const source = canvas.scene?.tiles?.get(
        sourceSelect.value
      );

      if (!source) {
        ui.notifications.warn(
          "Choose a source tile for the node chain."
        );
        return;
      }

      const targets = Array.from(
        rows.querySelectorAll(".ttm-node-target-row")
      )
        .map(row => {
          const controls = row.querySelectorAll(
            "select, input"
          );

          return {
            tileId: controls[0]?.value ?? "",
            delay: Math.max(
              0,
              Number(controls[1]?.value ?? 0)
            )
          };
        })
        .filter(target =>
          target.tileId
          && target.tileId !== source.id
        );

      await source.setFlag(TTM_ID, "nodeGraph", {
        enabled: true,
        mode: mode.value,
        targets
      });

      ui.notifications.info(
        `Saved ${targets.length} node target`
        + `${targets.length === 1 ? "" : "s"} `
        + `to ${source.name ?? "the source tile"}.`
      );
    });

    const disable = ttmMake(
      "button",
      "Disable Tile Chain",
      "ttm-node-editor-button"
    );
    disable.type = "button";
    disable.addEventListener("click", async () => {
      const source = canvas.scene?.tiles?.get(
        sourceSelect.value
      );

      if (!source) {
        ui.notifications.warn(
          "Choose a source tile first."
        );
        return;
      }

      await source.unsetFlag(TTM_ID, "nodeGraph");
      loadGraph();
      ui.notifications.info("Tile chain disabled.");
    });

    const test = ttmMake(
      "button",
      "Test Tile Chain",
      "ttm-node-editor-button"
    );
    test.type = "button";
    test.addEventListener("click", async () => {
      const source = canvas.scene?.tiles?.get(
        sourceSelect.value
      );

      if (!source) {
        ui.notifications.warn(
          "Choose and save a source tile first."
        );
        return;
      }

      await game.talkToMe?.runNodeGraph?.(
        source,
        canvas.tokens?.controlled?.[0] ?? null
      );
    });

    ttmAdd(
      panel,
      this.createField("Source tile", sourceSelect)
    );
    ttmAdd(
      panel,
      this.createField("Execution mode", mode)
    );

    const headings = ttmMake(
      "div",
      null,
      "ttm-node-target-headings"
    );
    ttmAdd(headings, ttmMake("strong", "Target tile"));
    ttmAdd(headings, ttmMake("strong", "Delay (seconds)"));
    ttmAdd(headings, ttmMake("span", ""));
    ttmAdd(panel, headings);
    ttmAdd(panel, rows);
    ttmAdd(panel, addTarget);

    const actions = ttmMake(
      "div",
      null,
      "ttm-node-editor-actions"
    );
    ttmAdd(actions, save);
    ttmAdd(actions, test);
    ttmAdd(actions, disable);
    ttmAdd(panel, actions);

    addTargetRow();
    return panel;
  }

  // Multi-template tile builder
  createMultiUseTilesPanel() {
    const panel = ttmMake("section", null, "ttm-panel");
    panel.dataset.panel = "multi";
    panel.hidden = this.activeTab !== "multi";

    ttmAdd(
      panel,
      this.createHint(
        "Add complete Trigger Tile templates to one physical tile. "
        + "Its normal template runs first, followed by these additional templates."
      )
    );

    const sourceSelect = ttmMake("select");
    const blank = ttmMake(
      "option",
      "— Choose the multi-use tile —"
    );
    blank.value = "";
    ttmAdd(sourceSelect, blank);

    for (const tile of this.getTalkToMeTiles()) {
      const option = ttmMake(
        "option",
        `${tile.name ?? "Tile"} [${tile.id}]`
      );
      option.value = tile.id;
      ttmAdd(sourceSelect, option);
    }

    const executionMode = ttmMake("select");
    for (const [value, label] of [
      ["sequence", "Run templates in sequence"],
      ["parallel", "Run templates together"]
    ]) {
      const option = ttmMake("option", label);
      option.value = value;
      ttmAdd(executionMode, option);
    }

    const actions = ttmMake(
      "div",
      null,
      "ttm-multi-action-list"
    );

    const makeNumber = (value = 0, step = "1", min = null) => {
      const input = ttmMake("input");
      input.type = "number";
      input.value = value;
      input.step = step;
      if (min !== null) input.min = min;
      return input;
    };

    const makeSelect = options => {
      const select = ttmMake("select");

      for (const [value, label] of options) {
        const option = ttmMake("option", label);
        option.value = value;
        ttmAdd(select, option);
      }

      return select;
    };

    const addActionRow = (saved = {}) => {
      const card = ttmMake(
        "section",
        null,
        "ttm-multi-action-card"
      );
      const header = ttmMake(
        "div",
        null,
        "ttm-multi-action-header"
      );
      const type = makeSelect([
        ["speech", "Speech Bubble"],
        ["switch", "Switch Activation"],
        ["light", "Environment: Ambient Light"],
        ["globalLight", "Environment: Global Lighting"],
        ["trap", "Trap Activation"],
        ["teleport", "Teleport Activation"],
        ["moveTokens", "Move Tokens"],
        ["spawnTokens", "Spawn Tokens"],
        ["reset", "Reset Tile"]
      ]);
      const remove = ttmMake("button", "Remove");

      remove.type = "button";
      remove.addEventListener("click", () => card.remove());

      ttmAdd(header, type);
      ttmAdd(header, remove);
      ttmAdd(card, header);

      const body = ttmMake(
        "div",
        null,
        "ttm-multi-action-body"
      );

      const rebuild = () => {
        body.replaceChildren();
        const value = type.value;

        if (value === "speech") {
          const mode = makeSelect([
            ["custom", "Custom text"],
            ["table", "RollTable"]
          ]);
          mode.value = saved.mode ?? "custom";

          const text = ttmMake("textarea");
          text.rows = 3;
          text.placeholder = "Speech bubble text";
          text.value = saved.text ?? "";

          const table = this.createTableSelect(
            `ttm-multi-table-${foundry.utils.randomID()}`
          );
          table.value = saved.tableId ?? "";

          const token = this.createTokenSelect(
            `ttm-multi-token-${foundry.utils.randomID()}`
          );
          token.value = saved.tokenId ?? "";

          const npcName = ttmMake("input");
          npcName.type = "text";
          npcName.placeholder = "Optional NPC name";
          npcName.value = saved.npcName ?? "";

          ttmAdd(body, this.createField("Speech source", mode));
          ttmAdd(body, this.createField("Custom text", text));
          ttmAdd(body, this.createField("RollTable", table));
          ttmAdd(body, this.createField("Speaker", token));
          ttmAdd(body, this.createField("NPC name", npcName));

          card.readAction = () => ({
            template: "speech",
            mode: mode.value,
            text: text.value,
            tableId: table.value,
            tokenId: token.value,
            npcName: npcName.value.trim()
          });
        } else if (value === "switch") {
          const wall = ttmMake("input");
          wall.type = "text";
          wall.placeholder = "Wall ID";
          wall.value = saved.doorWallId ?? "";

          const action = makeSelect([
            ["toggle", "Toggle door"],
            ["open", "Open door"],
            ["close", "Close door"],
            ["lock", "Lock door"]
          ]);
          action.value = saved.doorAction ?? "toggle";

          ttmAdd(
            body,
            this.createWallPickerField("Door Wall ID", wall)
          );
          ttmAdd(body, this.createField("Door action", action));

          card.readAction = () => ({
            template: "switch",
            doorWallId: wall.value.trim(),
            doorAction: action.value
          });
        } else if (value === "light") {
          const dim = makeNumber(saved.lightDim ?? 20);
          const bright = makeNumber(saved.lightBright ?? 10);
          const color = ttmMake("input");
          color.type = "color";
          color.value = saved.lightColor ?? "#ffffff";
          const alpha = makeNumber(
            saved.lightAlpha ?? 0.5,
            "0.05",
            0
          );
          alpha.max = 1;

          ttmAdd(body, this.createField("Dim radius", dim));
          ttmAdd(body, this.createField("Bright radius", bright));
          ttmAdd(body, this.createField("Colour", color));
          ttmAdd(body, this.createField("Alpha", alpha));

          card.readAction = () => ({
            template: "light",
            lightDim: Number(dim.value || 20),
            lightBright: Number(bright.value || 10),
            lightColor: color.value,
            lightAlpha: Number(alpha.value || 0.5)
          });
        } else if (value === "globalLight") {
          const action = makeSelect([
            ["on", "Fade to Day"],
            ["off", "Fade to Night"],
            ["toggle", "Toggle Day / Night"],
            ["set-darkness", "Set Darkness Level"],
            ["restore", "Restore Original Lighting"]
          ]);
          action.value = saved.globalLightAction ?? "toggle";

          const darkness = makeNumber(
            saved.globalDarkness ?? 0.75,
            "0.05",
            0
          );
          darkness.max = 1;

          ttmAdd(body, this.createField("Action", action));
          ttmAdd(
            body,
            this.createField("Darkness level", darkness)
          );

          card.readAction = () => ({
            template: "globalLight",
            globalLightAction: action.value,
            globalDarkness: Math.max(
              0,
              Math.min(1, Number(darkness.value || 0.75))
            )
          });
        } else if (value === "trap") {
          const ability = makeSelect(
            ["str", "dex", "con", "int", "wis", "cha"]
              .map(item => [item, item.toUpperCase()])
          );
          ability.value = saved.saveAbility ?? "dex";
          const dc = makeNumber(saved.saveDC ?? 10, "1", 1);
          const target = makeSelect([
            ["triggering-token", "Triggering Token"],
            ["tokens-within-tile", "Tokens Within Tile"],
            ["use-player-tokens", "Player Tokens"]
          ]);
          target.value = saved.trapTarget ?? "triggering-token";

          ttmAdd(body, this.createField("Save ability", ability));
          ttmAdd(body, this.createField("Save DC", dc));
          ttmAdd(body, this.createField("Targets", target));

          card.readAction = () => ({
            template: "trap",
            saveAbility: ability.value,
            saveDC: Number(dc.value || 10),
            trapTarget: target.value
          });
        } else if (value === "teleport") {
          const x = makeNumber(saved.teleportX ?? "");
          const y = makeNumber(saved.teleportY ?? "");
          const offsetX = makeNumber(saved.teleportOffsetX ?? 0);
          const offsetY = makeNumber(saved.teleportOffsetY ?? 0);

          ttmAdd(
            body,
            this.createCanvasPointPickerField(
              "Destination",
              x,
              y
            )
          );
          ttmAdd(body, this.createField("Offset X", offsetX));
          ttmAdd(body, this.createField("Offset Y", offsetY));

          card.readAction = () => ({
            template: "teleport",
            teleportX: x.value,
            teleportY: y.value,
            teleportOffsetX: Number(offsetX.value || 0),
            teleportOffsetY: Number(offsetY.value || 0),
            teleportAvoidTiles: true,
            teleportUseCooldown: false
          });
        } else if (value === "moveTokens") {
          const target = makeSelect([
            ["triggering-token", "Triggering Token"],
            ["tokens-within-tile", "Tokens Within Tile"],
            ["selected-tokens", "Selected Tokens"],
            ["player-tokens", "Player-Owned Tokens"]
          ]);
          target.value = saved.moveTargetMode ?? "triggering-token";

          const x = makeNumber(saved.moveDestinationX ?? "");
          const y = makeNumber(saved.moveDestinationY ?? "");
          const spacing = makeNumber(
            saved.moveSpacing ?? canvas.grid?.size ?? 100,
            "1",
            0
          );

          ttmAdd(body, this.createField("Tokens to move", target));
          ttmAdd(
            body,
            this.createCanvasPointPickerField(
              "Destination",
              x,
              y
            )
          );
          ttmAdd(body, this.createField("Formation spacing", spacing));

          card.readAction = () => ({
            template: "moveTokens",
            moveTargetMode: target.value,
            moveDestinationX: x.value,
            moveDestinationY: y.value,
            moveSpacing: Math.max(
              0,
              Number(spacing.value || 0)
            ),
            moveRoute: []
          });
        } else if (value === "spawnTokens") {
          const actor = this.createActorSelect(
            `ttm-multi-actor-${foundry.utils.randomID()}`
          );
          actor.value = saved.spawnActorId ?? "";

          const quantity = makeNumber(
            saved.spawnQuantity ?? 1,
            "1",
            1
          );
          quantity.max = 50;

          const x = makeNumber(saved.spawnX ?? "");
          const y = makeNumber(saved.spawnY ?? "");
          const formation = makeSelect([
            ["single", "Single point"],
            ["grid", "Grid"],
            ["circle", "Circle"],
            ["random", "Random area"]
          ]);
          formation.value = saved.spawnFormation ?? "grid";

          const spacing = makeNumber(
            saved.spawnSpacing ?? canvas.grid?.size ?? 100,
            "1",
            0
          );

          ttmAdd(body, this.createField("Actor", actor));
          ttmAdd(body, this.createField("Quantity", quantity));
          ttmAdd(
            body,
            this.createCanvasPointPickerField(
              "Spawn location",
              x,
              y
            )
          );
          ttmAdd(body, this.createField("Formation", formation));
          ttmAdd(body, this.createField("Spacing", spacing));

          card.readAction = () => ({
            template: "spawnTokens",
            spawnActorId: actor.value,
            spawnQuantity: Math.max(
              1,
              Math.min(50, Number(quantity.value || 1))
            ),
            spawnX: x.value,
            spawnY: y.value,
            spawnFormation: formation.value,
            spawnSpacing: Math.max(
              0,
              Number(spacing.value || 0)
            ),
            spawnHidden: false,
            spawnRemoveOnReset: true
          });
        } else {
          ttmAdd(
            body,
            this.createHint(
              "Reset all TalkToMe tiles and remove reset-managed spawned tokens."
            )
          );

          card.readAction = () => ({
            template: "reset"
          });
        }
      };

      type.value = saved.template ?? "speech";
      type.addEventListener("change", () => {
        saved = {};
        rebuild();
      });

      ttmAdd(card, body);
      actions.appendChild(card);
      rebuild();
    };

    const load = () => {
      actions.replaceChildren();

      const source = canvas.scene?.tiles?.get(
        sourceSelect.value
      );
      const config =
        source?.getFlag(TTM_ID, "multiUse") ?? {};

      executionMode.value = config.mode ?? "sequence";

      const savedActions = Array.isArray(config.actions)
        ? config.actions
        : [];

      if (!savedActions.length) addActionRow();
      else savedActions.forEach(addActionRow);
    };

    sourceSelect.addEventListener("change", load);

    const add = ttmMake(
      "button",
      "＋ Add Trigger Template",
      "ttm-multi-action-button"
    );
    add.type = "button";
    add.addEventListener("click", () => addActionRow());

    const save = ttmMake(
      "button",
      "Save Multi-Use Tile",
      "ttm-multi-action-button"
    );
    save.type = "button";
    save.addEventListener("click", async () => {
      const source = canvas.scene?.tiles?.get(
        sourceSelect.value
      );

      if (!source) {
        ui.notifications.warn("Choose a source tile.");
        return;
      }

      const savedActions = Array.from(
        actions.querySelectorAll(".ttm-multi-action-card")
      )
        .map(card => card.readAction?.())
        .filter(Boolean);

      await source.setFlag(TTM_ID, "multiUse", {
        enabled: true,
        mode: executionMode.value,
        actions: savedActions
      });

      ui.notifications.info(
        `Saved ${savedActions.length} additional template`
        + `${savedActions.length === 1 ? "" : "s"}.`
      );
    });

    const test = ttmMake(
      "button",
      "Test Added Templates",
      "ttm-multi-action-button"
    );
    test.type = "button";
    test.addEventListener("click", async () => {
      const source = canvas.scene?.tiles?.get(
        sourceSelect.value
      );

      if (!source) {
        ui.notifications.warn("Choose a source tile.");
        return;
      }

      await game.talkToMe?.runMultiUseActions?.(
        source,
        canvas.tokens?.controlled?.[0] ?? null
      );
    });

    const disable = ttmMake(
      "button",
      "Disable Multi-Use Templates",
      "ttm-multi-action-button"
    );
    disable.type = "button";
    disable.addEventListener("click", async () => {
      const source = canvas.scene?.tiles?.get(
        sourceSelect.value
      );

      if (!source) {
        ui.notifications.warn("Choose a source tile.");
        return;
      }

      await source.unsetFlag(TTM_ID, "multiUse");
      load();
      ui.notifications.info("Multi-use templates disabled.");
    });

    ttmAdd(
      panel,
      this.createField("Multi-use tile", sourceSelect)
    );
    ttmAdd(
      panel,
      this.createField("Execution mode", executionMode)
    );
    ttmAdd(panel, actions);
    ttmAdd(panel, add);

    const buttons = ttmMake(
      "div",
      null,
      "ttm-multi-action-buttons"
    );
    ttmAdd(buttons, save);
    ttmAdd(buttons, test);
    ttmAdd(buttons, disable);
    ttmAdd(panel, buttons);

    addActionRow();
    return panel;
  }

  // Macro generator
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
    ttmAdd(panel, this.createTemplateField("RollTable", tableSelect, ["speech", "switch", "light", "globalLight", "trap", "teleport", "moveTokens", "spawnTokens", "magic", "reset"]));
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
    if (this.managerElement) this.refreshTileManagerList();
  if (!this.element) return;

  const list = this.element.querySelector("#ttm-managed-tiles");
  const editorSelect = this.element.querySelector("#ttm-edit-tile-select");
  if (!list) return;

  const selectedEditorId = editorSelect?.value ?? "";
  const docs = this.getTalkToMeTiles();

  list.innerHTML = "";

  if (editorSelect) {
    editorSelect.innerHTML = "";
    const blank = ttmMake("option", "— Select a TalkToMe tile —");
    blank.value = "";
    ttmAdd(editorSelect, blank);

    for (const doc of docs) {
      const utility = doc.getFlag(TTM_ID, "utility") ?? {};
      const option = ttmMake(
        "option",
        `${doc.name ?? "Unnamed Tile"} [${utility.template ?? "speech"}]`
      );
      option.value = doc.id;
      if (doc.id === selectedEditorId) option.selected = true;
      ttmAdd(editorSelect, option);
    }
  }

  if (!docs.length) {
    list.innerHTML =
      `<p class="notes">No TalkToMe tiles on this scene yet.</p>`;
    return;
  }

  for (const doc of docs) {
    const utility = doc.getFlag(TTM_ID, "utility") ?? {};
    const speech = doc.getFlag(TTM_ID, "speech") ?? {};
    const name = doc.name || speech.name || "TalkToMe Tile";
    const template = utility.template ?? "speech";
    const trigger = speech.trigger ?? utility.trigger ?? "manual";

    const card = ttmMake("article", null, "ttm-tile-card");
    card.innerHTML = `
      <div>
        <strong>${ttmEscapeHtml(name)}</strong>
        <p class="notes">
          Template: ${ttmEscapeHtml(template)}
          · Trigger: ${ttmEscapeHtml(trigger)}
        </p>
      </div>
    `;

    const row = ttmMake("div", null, "ttm-card-buttons");

    const triggerButton = ttmMake("button", "Trigger");
    triggerButton.type = "button";
    triggerButton.addEventListener(
      "click",
      () => this.api.triggerSpeechTile(doc.id)
    );

    const selectButton = ttmMake("button", "Select");
    selectButton.type = "button";
    selectButton.addEventListener("click", () => {
      canvas.tiles?.activate?.();
      canvas.tiles?.get(doc.id)?.control?.({ releaseOthers: true });
      canvas.animatePan?.({
        x: Number(doc.x ?? 0) + Number(doc.width ?? 0) / 2,
        y: Number(doc.y ?? 0) + Number(doc.height ?? 0) / 2
      });
    });

    const editButton = ttmMake("button", "Edit");
    editButton.type = "button";
    editButton.addEventListener("click", () => {
      const useTalkToMeEditor = game.settings.get(
        TTM_ID,
        "useTalkToMeTileEditor"
      );

      if (useTalkToMeEditor) {
        this.openTileEditor(doc.id);
        return;
      }

      canvas.tiles?.get(doc.id)?.sheet?.render(true);
    });

    const deleteButton = ttmMake("button", "Delete");
    deleteButton.type = "button";
    deleteButton.addEventListener("click", async () => {
      const ok = await Dialog.confirm({
        title: "Delete TalkToMe Tile?",
        content:
          `<p>Delete <strong>${ttmEscapeHtml(name)}</strong>?</p>`
      });

      if (!ok) return;

      await doc.delete();
      this.refreshManagedTileList();
    });

    ttmAdd(row, triggerButton);
    ttmAdd(row, selectButton);
    ttmAdd(row, editButton);
    ttmAdd(row, deleteButton);
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
