import { TTM_ID } from "./constants.js";

const CONVERSATION_FLAG = "conversationStates";

function normalise(value) {
  return String(value ?? "").trim();
}

function parseHeader(text) {
  const source = String(text ?? "");
  const match = source.match(/^\s*\[\[([^\]]+)\]\]\s*/);
  if (!match) {
    return {
      node: "",
      next: "",
      tile: "",
      text: source.trim()
    };
  }

  const metadata = {};
  for (const part of match[1].split("|")) {
    const separator = part.indexOf(":");
    if (separator < 0) continue;

    const key = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim();
    metadata[key] = value;
  }

  return {
    node: normalise(metadata.node),
    next: normalise(metadata.next),
    tile: normalise(metadata.tile ?? metadata.nexttile),
    text: source.slice(match[0].length).trim()
  };
}

async function resultText(result) {
  if (!result) return "";

  if (typeof result.getChatText === "function") {
    return String(await result.getChatText());
  }

  return String(
    result.text
    ?? result.name
    ?? result.description
    ?? result.document?.name
    ?? ""
  );
}

function weightedChoice(entries) {
  const weighted = entries.map(entry => ({
    ...entry,
    weight: Math.max(1, Number(entry.result.weight ?? 1))
  }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;

  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }

  return weighted.at(-1) ?? null;
}

function stateKey(tileDoc, speech) {
  return normalise(speech.conversationId)
    || `tile-${tileDoc.id}`;
}

function getStates(scene) {
  return foundry.utils.deepClone(
    scene?.getFlag(TTM_ID, CONVERSATION_FLAG) ?? {}
  );
}

async function setStates(scene, states) {
  await scene.setFlag(TTM_ID, CONVERSATION_FLAG, states);
}

export async function resetConversation(conversationId = "", scene = canvas.scene) {
  if (!scene) return false;

  const states = getStates(scene);

  if (conversationId) {
    delete states[conversationId];
  } else {
    for (const key of Object.keys(states)) delete states[key];
  }

  await setStates(scene, states);
  return true;
}

export function getConversationState(conversationId, scene = canvas.scene) {
  if (!scene) return null;
  return getStates(scene)[conversationId] ?? null;
}

export async function resolveConversationLine(tileDoc, table, speech) {
  const scene = tileDoc?.parent ?? canvas.scene;

  if (!scene || !table || speech.conversationEnabled !== true) {
    return null;
  }

  const id = stateKey(tileDoc, speech);
  const states = getStates(scene);
  const existing = states[id] ?? null;
  const isStart = speech.conversationStart === true;
  const startNode = normalise(speech.conversationStartNode) || "start";

  if (!existing && !isStart) {
    return {
      blocked: true,
      reason: "waiting-for-start",
      conversationId: id
    };
  }

  if (existing?.expectedTileId && existing.expectedTileId !== tileDoc.id) {
    return {
      blocked: true,
      reason: "waiting-for-other-speaker",
      conversationId: id,
      expectedTileId: existing.expectedTileId
    };
  }

  const currentNode = normalise(existing?.node) || startNode;
  const candidates = [];

  for (const result of table.results?.contents ?? table.results ?? []) {
    const raw = await resultText(result);
    const parsed = parseHeader(raw);

    if (parsed.node === currentNode) {
      candidates.push({ result, parsed });
    }
  }

  if (!candidates.length) {
    ui.notifications.warn(
      `TalkToMe conversation "${id}" could not find node `
      + `"${currentNode}" in ${table.name}.`
    );

    return {
      blocked: true,
      reason: "missing-node",
      conversationId: id,
      node: currentNode
    };
  }

  const selected = weightedChoice(candidates);
  if (!selected) return null;

  const nextNode = normalise(selected.parsed.next);
  const configuredNextTile = normalise(
    speech.conversationNextTileId
  );
  const nextTileId =
    normalise(selected.parsed.tile)
    || configuredNextTile;

  if (!nextNode || ["end", "stop", "complete"].includes(nextNode.toLowerCase())) {
    delete states[id];
  } else {
    states[id] = {
      node: nextNode,
      expectedTileId: nextTileId || tileDoc.id,
      previousTileId: tileDoc.id,
      previousResultId: selected.result.id,
      updatedAt: Date.now()
    };
  }

  await setStates(scene, states);

  return {
    blocked: false,
    text: selected.parsed.text,
    conversationId: id,
    node: currentNode,
    nextNode,
    nextTileId
  };
}

export function conversationResultSyntaxExample() {
  return "[[node:start|next:reply-1]] Hey, how are you?";
}


const activeConversationSequences = new Set();

function sequenceKey(tileDoc) {
  return `${tileDoc.parent?.id ?? canvas.scene?.id}.${tileDoc.id}`;
}

function wait(milliseconds) {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

export async function playConversationSequence(
  api,
  tileDoc,
  speech,
  tokenLike = null
) {
  const key = sequenceKey(tileDoc);

  if (activeConversationSequences.has(key)) {
    ui.notifications.warn(
      `${tileDoc.name ?? "Conversation"} is already playing.`
    );
    return false;
  }

  const participants = Array.isArray(speech.conversationParticipants)
    ? speech.conversationParticipants.slice(0, 5)
    : [];

  const configuredOrder = Array.isArray(
    speech.conversationOrder
  )
    ? speech.conversationOrder.map(value => Number(value))
    : [];

  const order = configuredOrder.length
    ? configuredOrder
    : [1, 1, 2, 2];

  const lineGapMs = Math.max(
    250,
    Number(speech.conversationLineDelay ?? 3) * 1000
  );

  const bubbleDurationMs = Math.max(
    500,
    Number(game.settings.get(TTM_ID, "bubbleDuration") ?? 5500)
  );

  const validOrder = order.filter(
    slot => Number.isInteger(slot) && slot >= 1 && slot <= 5
  );

  if (!validOrder.length) {
    ui.notifications.warn(
      "This conversation tile has no valid speaking order."
    );
    return false;
  }

  const missingSlot = validOrder.find(slot => {
    return !String(participants[slot - 1]?.tableId ?? "").trim();
  });

  if (missingSlot) {
    ui.notifications.warn(
      `Conversation NPC ${missingSlot} has no RollTable assigned.`
    );
    return false;
  }

  // Resolve every order entry to an immutable step before starting.
  // This guarantees slot 1 always uses NPC 1's table, slot 2 NPC 2's, etc.
  const steps = validOrder.map((slot, sequenceIndex) => {
    const participant = participants[slot - 1];

    return {
      sequenceIndex,
      slot,
      tokenId: String(participant.tokenId ?? ""),
      tableId: String(participant.tableId ?? ""),
      npcName: String(participant.npcName ?? "")
    };
  });

  const usedTables = new Map();

  activeConversationSequences.add(key);

  try {
    for (const step of steps) {
      const table = game.tables?.get(step.tableId);

      if (!table) {
        ui.notifications.warn(
          `Conversation NPC ${step.slot}'s RollTable could not be found.`
        );
        return false;
      }

      usedTables.set(table.id, table);

      // Draw from the exact table assigned to this order slot first.
      // Passing the resulting text to say() prevents a second or wrong table draw.
      const lineText = await api.rollTable(table);

      if (!lineText) {
        ui.notifications.warn(
          `Conversation NPC ${step.slot}'s RollTable returned no text.`
        );
        return false;
      }

      const token =
        (step.tokenId ? canvas.tokens?.get(step.tokenId) : null)
        ?? tokenLike
        ?? null;

      await api.say({
        token,
        tableId: "",
        text: lineText,
        npcName: step.npcName,
        postChat: speech.postChat,
        zoomToSpeaker: speech.zoomToSpeaker
      });

      const isLast =
        step.sequenceIndex === steps.length - 1;

      if (!isLast) {
        // Never advance before the current bubble has had time to display.
        await wait(Math.max(lineGapMs, bubbleDurationMs));
      }
    }

    return true;
  } finally {
    for (const table of usedTables.values()) {
      try {
        if (typeof table.resetResults === "function") {
          await table.resetResults();
        } else {
          const drawnResults = (
            table.results?.contents
            ?? table.results
            ?? []
          ).filter(result => result.drawn === true);

          if (drawnResults.length) {
            await table.updateEmbeddedDocuments(
              "TableResult",
              drawnResults.map(result => ({
                _id: result.id,
                drawn: false
              }))
            );
          }
        }
      } catch (error) {
        console.error(
          `TalkToMe failed to reset RollTable ${table.name}.`,
          error
        );
      }
    }

    activeConversationSequences.delete(key);
  }
}
