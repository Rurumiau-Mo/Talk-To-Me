import { TTM_ID, TTM_MATT_ID, TTM_TAGGER_ID } from "./constants.js";

import {
  ttmCurrentPlacementPosition,
  ttmIsGM,
  ttmModuleActive,
  ttmNotice,
  ttmSlug,
  ttmTokenById
} from "./helpers.js";

import { generateTileTriggerScript } from "./macros.js";
import { resolveToken } from "./speech.js";

export function getManagedSpeechTiles() {
  return canvas.scene?.tiles
    ?.filter(t => t.getFlag(TTM_ID, "speech")?.managed === true)
    ?.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")) ?? [];
}

export function tileContainsToken(tileDoc, tokenDoc) {
  if (!tileDoc || !tokenDoc) return false;

  const grid = canvas.scene?.grid?.size ?? canvas.grid?.size ?? 100;

  const tokenWidth = (tokenDoc.width ?? 1) * grid;
  const tokenHeight = (tokenDoc.height ?? 1) * grid;
  const cx = Number(tokenDoc.x ?? 0) + tokenWidth / 2;
  const cy = Number(tokenDoc.y ?? 0) + tokenHeight / 2;

  const tx = Number(tileDoc.x ?? 0);
  const ty = Number(tileDoc.y ?? 0);
  const tw = Number(tileDoc.width ?? 0);
  const th = Number(tileDoc.height ?? 0);

  return cx >= tx && cx <= tx + tw && cy >= ty && cy <= ty + th;
}

export function generateMattFlags({ trigger = "enter", script = "", tileName = "TalkToMe Speech" } = {}) {
  return {
    active: trigger !== "manual",
    restriction: "all",
    controlled: "all",
    trigger,
    triggers: trigger === "manual" ? [] : [trigger],
    method: trigger,
    allowpaused: true,
    minrequired: 0,
    chance: 100,
    actions: [
      {
        action: "script",
        name: `${tileName} Execute Script`,
        data: { command: script, script }
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
  height = 200
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
  const tileName = name || `${npcName || table?.name || "NPC"} Speech`;
  const script = generateTileTriggerScript({ postChat, zoomToSpeaker });

  const flags = {
    [TTM_ID]: {
      speech: {
        managed: true,
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
        script
      }
    }
  };

  if (ttmModuleActive(TTM_MATT_ID)) {
    flags[TTM_MATT_ID] = generateMattFlags({ trigger, script, tileName });
  }

  if (ttmModuleActive(TTM_TAGGER_ID)) {
    flags.tagger = {
      tags: [
        "talk-to-me",
        "speech-tile",
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
    alpha: hidden ? 0.25 : 0.65,
    texture: {
      src: game.settings.get(TTM_ID, "speechTileImage") || "icons/svg/sound.svg",
      scaleX: 1,
      scaleY: 1
    },
    flags
  };

  const created = await canvas.scene.createEmbeddedDocuments("Tile", [data]);
  const doc = created?.[0];

  if (doc) {
    ttmNotice("info", `Created speech tile: ${tileName}.`);
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