import { TTM_ID, TTM_MATT_ID, TTM_TAGGER_ID } from "./constants.js";

import {
  ttmCurrentPlacementPosition,
  ttmIsGM,
  ttmModuleActive,
  ttmNotice,
  ttmSlug,
  ttmTokenById
} from "./helpers.js";

import { generateMattPresetScript, generateTileTriggerScript } from "./macros.js";
import { resolveToken } from "./speech.js";

export const TTM_MOVEMENT_TRIGGERS = ["enter", "exit"];
export const TTM_ACTION_TRIGGERS = ["switch", "trap", "effect", "manual"];

export const TTM_PRESET_LABELS = {
  enter: "Speech: Token Enters",
  exit: "Speech: Token Exits",
  switch: "Speech: Switch Activated",
  trap: "Speech: Trap Triggered",
  effect: "Speech: Magic/Effect Triggered",
  manual: "Speech: Manual"
};

export const TTM_SWITCH_CLICK_LABELS = {
  left: "Left Click",
  "double-left": "Double Left Click",
  right: "Right Click",
  any: "Any Click"
};

export function getManagedSpeechTiles() {
  return canvas.scene?.tiles
    ?.filter(t => t.getFlag(TTM_ID, "speech")?.managed === true)
    ?.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")) ?? [];
}

export function getGridSize() {
  return canvas.scene?.grid?.size ?? canvas.grid?.size ?? 100;
}

export function getTileRect(tileDoc) {
  const x = Number(tileDoc?.x ?? 0);
  const y = Number(tileDoc?.y ?? 0);
  const w = Number(tileDoc?.width ?? 0);
  const h = Number(tileDoc?.height ?? 0);

  return {
    left: Math.min(x, x + w),
    top: Math.min(y, y + h),
    right: Math.max(x, x + w),
    bottom: Math.max(y, y + h)
  };
}

export function getTokenRect(tokenDoc) {
  const grid = getGridSize();

  const x = Number(tokenDoc?.x ?? 0);
  const y = Number(tokenDoc?.y ?? 0);
  const w = Math.max(grid * 0.25, Number(tokenDoc?.width ?? 1) * grid);
  const h = Math.max(grid * 0.25, Number(tokenDoc?.height ?? 1) * grid);

  return {
    left: x,
    top: y,
    right: x + w,
    bottom: y + h
  };
}

export function rectsOverlap(a, b) {
  if (!a || !b) return false;

  return a.right >= b.left
    && a.left <= b.right
    && a.bottom >= b.top
    && a.top <= b.bottom;
}

export function tileContainsToken(tileDoc, tokenDoc) {
  return rectsOverlap(getTileRect(tileDoc), getTokenRect(tokenDoc));
}

export function pointInTile(tileDoc, point) {
  if (!tileDoc || !point) return false;

  const rect = getTileRect(tileDoc);

  return point.x >= rect.left
    && point.x <= rect.right
    && point.y >= rect.top
    && point.y <= rect.bottom;
}

export function templateLabel(template = "speech", trigger = "enter") {
  const labels = {
    speech: TTM_PRESET_LABELS[trigger] || "Speech Tile",
    switch: "Switch Activation",
    light: "Light Activation",
    trap: "Trap Activation",
    teleport: "Teleport Activation",
    reset: "Create Reset Tile"
  };

  return labels[template] || "Speech Tile";
}

export function mattTriggerModeForTalkToMe(trigger, clickActivation = "left") {
  if (trigger === "enter") return "enter";
  if (trigger === "exit") return "exit";

  if (trigger === "switch") {
    if (clickActivation === "double-left") return "dblclick";
    if (clickActivation === "right") return "rightclick";
    if (clickActivation === "any") return "click";
    return "click";
  }

  if (trigger === "trap") return "enter";
  if (trigger === "effect") return "manual";
  return "manual";
}

export function generateMattFlags({
  trigger = "enter",
  script = "",
  tileName = "TalkToMe Speech",
  clickActivation = "left"
} = {}) {
  const mattTrigger = mattTriggerModeForTalkToMe(trigger, clickActivation);
  const active = mattTrigger !== "manual";
  const triggerList = active ? [mattTrigger] : [];

  // MATT's internal flag shape can change between versions.
  // This block is intentionally best-effort while TalkToMe also keeps its own
  // scanner/click listener fallback.
  return {
    active,
    restriction: "all",
    controlled: "all",
    trigger: mattTrigger,
    triggers: triggerList,
    method: mattTrigger,
    allowpaused: true,
    minrequired: 0,
    chance: 100,
    actions: [
      {
        action: "script",
        name: `${tileName} TalkToMe Speech`,
        data: {
          command: script,
          script
        }
      },
      {
        action: "runmacro",
        name: `${tileName} TalkToMe Macro`,
        data: {
          entity: "",
          macro: "",
          command: script
        }
      }
    ]
  };
}

export async function createSpeechTile({
  name = "",
  npcName = "",
  subjectTokenId = "",
  tableId = "",
  trigger = "enter",
  mode = "table",
  text = "",
  postChat = false,
  zoomToSpeaker = false,
  hidden = true,
  width = 200,
  height = 200,
  clickActivation = "left",
  tileImage = "",
  presetName = "",
  template = "speech",
  activeImage = "",
  inactiveImage = "",
  doorWallId = "",
  doorAction = "toggle",
  targetTileId = "",
  lightDim = 20,
  lightBright = 10,
  lightColor = "#ffffff",
  lightAlpha = 0.5,
  lightAnimation = "",
  saveAbility = "dex",
  saveDC = 10,
  targetPlayers = "",
  teleportX = "",
  teleportY = ""
} = {}) {
  if (!ttmIsGM()) {
    ttmNotice("warn", "Only the GM can create speech tiles.");
    return null;
  }

  if (!canvas.scene) {
    ttmNotice("warn", "No active scene.");
    return null;
  }

  const table = tableId ? game.tables.get(tableId) : null;

  if (mode === "table" && !table) {
    ttmNotice("warn", "Choose a RollTable for table speech mode.");
    return null;
  }

  if (mode === "custom" && !text.trim()) {
    ttmNotice("warn", "Enter custom speech for custom speech mode.");
    return null;
  }

  const pos = ttmCurrentPlacementPosition();
  const presetLabel = presetName || templateLabel(template, trigger);
  const tileName = name || `${presetLabel}${npcName ? ` - ${npcName}` : ""}`;
  const script = generateMattPresetScript({ trigger, postChat, zoomToSpeaker });
  const fallbackScript = generateTileTriggerScript({ postChat, zoomToSpeaker });
  const textureSrc = inactiveImage || tileImage || game.settings.get(TTM_ID, "speechTileImage") || "icons/svg/sound.svg";

  const flags = {
    [TTM_ID]: {
      utility: {
        template,
        active: false,
        inactiveImage: inactiveImage || textureSrc,
        activeImage,
        defaultImage: textureSrc,
        doorWallId,
        doorAction,
        targetTileId,
        lightDim,
        lightBright,
        lightColor,
        lightAlpha,
        lightAnimation,
        saveAbility,
        saveDC,
        targetPlayers,
        teleportX,
        teleportY
      },
      speech: {
        managed: true,
        preset: presetLabel,
        name: tileName,
        npcName,
        subjectTokenId,
        tableId,
        tableName: table?.name ?? "",
        trigger,
        mode,
        text,
        postChat,
        zoomToSpeaker,
        script,
        fallbackScript,
        clickActivation,
        tileImage: textureSrc,
        mattTrigger: mattTriggerModeForTalkToMe(trigger, clickActivation),
        createdAt: Date.now()
      }
    }
  };

  if (ttmModuleActive(TTM_MATT_ID)) {
    flags[TTM_MATT_ID] = generateMattFlags({
      trigger,
      script,
      tileName,
      clickActivation
    });
  }

  if (ttmModuleActive(TTM_TAGGER_ID)) {
    flags.tagger = {
      tags: [
        "talk-to-me",
        "speech-tile",
        `ttm-trigger-${trigger}`,
        `ttm-preset-${ttmSlug(presetLabel)}`,
        ttmSlug(tileName),
        npcName ? `npc-${ttmSlug(npcName)}` : "npc-custom"
      ]
    };
  }

  const data = {
    name: tileName,
    x: pos.x,
    y: pos.y,
    width,
    height,
    hidden,
    alpha: hidden ? 0.25 : 0.75,
    texture: {
      src: textureSrc,
      scaleX: 1,
      scaleY: 1
    },
    flags
  };

  const created = await canvas.scene.createEmbeddedDocuments("Tile", [data]);
  const doc = created?.[0];

  if (doc) {
    ttmNotice("info", `Created ${presetLabel}: ${tileName}.`);
    canvas.tiles?.activate?.();
    canvas.tiles?.get(doc.id)?.control?.({ releaseOthers: true });
  }

  return doc ?? null;
}

export async function triggerSpeechTile(api, tileId, tokenLike = null, overrides = {}) {
  const doc = canvas.scene?.tiles?.get(tileId);
  if (!doc) return ttmNotice("warn", "Speech tile not found.");

  const flags = doc.getFlag(TTM_ID, "speech");
  if (!flags) return ttmNotice("warn", "That tile is not a TalkToMe speech tile.");

  const table = flags.tableId ? game.tables.get(flags.tableId) : null;
  const subjectToken = flags.subjectTokenId ? ttmTokenById(flags.subjectTokenId) : null;
  const token = subjectToken ?? resolveToken(tokenLike);

  await api.say({
    token,
    tableId: table?.id ?? "",
    text: flags.mode === "custom" ? flags.text : "",
    npcName: flags.npcName,
    postChat: overrides.postChat ?? flags.postChat,
    zoomToSpeaker: overrides.zoomToSpeaker ?? flags.zoomToSpeaker
  });
}
