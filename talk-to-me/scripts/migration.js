import {
  TTM_ID,
  TTM_TILE_SCHEMA_VERSION,
  TTM_WORLD_MIGRATION_VERSION
} from "./constants.js";

function clone(value) {
  return foundry.utils.deepClone(value ?? {});
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanOr(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function inferTemplate(utility, speech) {
  if (utility.template) return utility.template;
  if (utility.doorWallId || utility.doorAction) return "switch";
  if (
    utility.lightDim !== undefined
    || utility.lightBright !== undefined
    || utility.ambientLightId
  ) return "light";
  if (
    utility.teleportX !== undefined
    || utility.teleportY !== undefined
  ) return "teleport";
  if (utility.saveDC !== undefined || utility.trapTarget) return "trap";
  if (speech.managed === true || speech.mode || speech.tableId || speech.text) {
    return "speech";
  }
  return "";
}

function inferTrigger(template, utility, speech) {
  const trigger = speech.trigger ?? utility.trigger;
  if (trigger) return trigger;

  if (template === "switch" || template === "light" || template === "reset") {
    return "switch";
  }

  if (template === "trap") return "trap";
  if (template === "teleport") return "enter";
  return "manual";
}

function currentTexture(tileDoc) {
  return tileDoc.texture?.src ?? tileDoc.img ?? "";
}

function buildOriginalState(tileDoc, utility) {
  const existing = clone(utility.originalState);
  const inactiveImage =
    existing.inactiveImage
    ?? existing.image
    ?? utility.inactiveImage
    ?? utility.defaultImage
    ?? currentTexture(tileDoc);

  return foundry.utils.mergeObject(
    existing,
    {
      active: booleanOr(existing.active, false),
      image: inactiveImage,
      inactiveImage,
      activeImage:
        existing.activeImage
        ?? utility.activeImage
        ?? "",
      doorWallId:
        existing.doorWallId
        ?? utility.doorWallId
        ?? "",
      doorAction:
        existing.doorAction
        ?? utility.doorAction
        ?? "toggle",
      originalDoorState:
        Number.isFinite(Number(existing.originalDoorState))
          ? Number(existing.originalDoorState)
          : null,
      lightDim: numberOr(
        existing.lightDim ?? utility.lightDim,
        20
      ),
      lightBright: numberOr(
        existing.lightBright ?? utility.lightBright,
        10
      ),
      lightColor:
        existing.lightColor
        ?? utility.lightColor
        ?? "#ffffff",
      lightAlpha: numberOr(
        existing.lightAlpha ?? utility.lightAlpha,
        0.5
      ),
      lightAnimation:
        existing.lightAnimation
        ?? utility.lightAnimation
        ?? "",
      teleportX:
        existing.teleportX
        ?? utility.teleportX
        ?? "",
      teleportY:
        existing.teleportY
        ?? utility.teleportY
        ?? "",
      teleportOffsetX: numberOr(
        existing.teleportOffsetX ?? utility.teleportOffsetX,
        0
      ),
      teleportOffsetY: numberOr(
        existing.teleportOffsetY ?? utility.teleportOffsetY,
        0
      ),
      teleportAvoidTiles: booleanOr(
        existing.teleportAvoidTiles
          ?? utility.teleportAvoidTiles,
        true
      ),
      teleportUseCooldown: booleanOr(
        existing.teleportUseCooldown
          ?? utility.teleportUseCooldown,
        true
      ),
      teleportCooldownSeconds: numberOr(
        existing.teleportCooldownSeconds
          ?? utility.teleportCooldownSeconds,
        3
      ),
      requirePlayerVision: booleanOr(
        existing.requirePlayerVision
          ?? utility.requirePlayerVision,
        false
      ),
      hideBehindWalls: booleanOr(
        existing.hideBehindWalls
          ?? utility.hideBehindWalls,
        true
      ),
      activationCooldownEnabled: booleanOr(
        existing.activationCooldownEnabled
          ?? utility.activationCooldownEnabled,
        false
      ),
      activationCooldownSeconds: Math.max(
        0.2,
        numberOr(
          existing.activationCooldownSeconds
            ?? utility.activationCooldownSeconds,
          1
        )
      )
    },
    { inplace: false }
  );
}

function migrateToVersion1(tileDoc, data) {
  const utility = clone(data.utility);
  const speech = clone(data.speech);
  const template = inferTemplate(utility, speech);

  if (!template) return data;

  const trigger = inferTrigger(template, utility, speech);
  const clickActivation =
    speech.clickActivation
    ?? utility.clickActivation
    ?? "left";
  const inactiveImage =
    utility.inactiveImage
    ?? utility.defaultImage
    ?? speech.tileImage
    ?? currentTexture(tileDoc);
  const linkedId =
    utility.linkedTriggerTileId
    || utility.targetTileId
    || "";

  data.utility = foundry.utils.mergeObject(
    utility,
    {
      template,
      trigger,
      clickActivation,
      active: booleanOr(utility.active, false),
      inactiveImage,
      defaultImage: utility.defaultImage ?? inactiveImage,
      activeImage: utility.activeImage ?? "",
      linkedTriggerTileId: linkedId,
      targetTileId: linkedId,
      requirePlayerVision: booleanOr(
        utility.requirePlayerVision,
        false
      ),
      hideBehindWalls: booleanOr(
        utility.hideBehindWalls,
        true
      ),
      activationCooldownEnabled: booleanOr(
        utility.activationCooldownEnabled,
        false
      ),
      activationCooldownSeconds: Math.max(
        0.2,
        numberOr(utility.activationCooldownSeconds, 1)
      )
    },
    { inplace: false }
  );

  data.speech = foundry.utils.mergeObject(
    speech,
    {
      managed: true,
      name: speech.name ?? tileDoc.name ?? "TalkToMe Tile",
      trigger,
      clickActivation,
      tileImage: speech.tileImage ?? inactiveImage,
      mode: speech.mode ?? "table",
      text: speech.text ?? "",
      tableId: speech.tableId ?? "",
      npcName: speech.npcName ?? "",
      subjectTokenId: speech.subjectTokenId ?? "",
      postChat: booleanOr(speech.postChat, false),
      zoomToSpeaker: booleanOr(speech.zoomToSpeaker, false)
    },
    { inplace: false }
  );

  data.version = 1;
  return data;
}

function migrateToVersion2(tileDoc, data) {
  const utility = clone(data.utility);
  const speech = clone(data.speech);
  const template = inferTemplate(utility, speech);

  if (!template) return data;

  const linkedId =
    utility.linkedTriggerTileId
    || utility.targetTileId
    || "";

  data.utility = foundry.utils.mergeObject(
    utility,
    {
      linkedTriggerTileId: linkedId,
      targetTileId: linkedId,
      lightDim: numberOr(utility.lightDim, 20),
      lightBright: numberOr(utility.lightBright, 10),
      lightColor: utility.lightColor ?? "#ffffff",
      lightAlpha: numberOr(utility.lightAlpha, 0.5),
      lightAnimation: utility.lightAnimation ?? "",
      saveAbility: utility.saveAbility ?? "dex",
      saveDC: numberOr(utility.saveDC, 10),
      trapTarget: utility.trapTarget ?? "triggering-token",
      teleportOffsetX: numberOr(utility.teleportOffsetX, 0),
      teleportOffsetY: numberOr(utility.teleportOffsetY, 0),
      teleportAutoReset: booleanOr(
        utility.teleportAutoReset,
        true
      ),
      teleportResetSeconds: numberOr(
        utility.teleportResetSeconds,
        3
      ),
      teleportUseCooldown: booleanOr(
        utility.teleportUseCooldown,
        true
      ),
      teleportCooldownSeconds: numberOr(
        utility.teleportCooldownSeconds,
        3
      ),
      teleportAvoidTiles: booleanOr(
        utility.teleportAvoidTiles,
        true
      ),
      hotspotSize: Math.max(
        8,
        numberOr(utility.hotspotSize, 64)
      ),
      hotspotOffsetX: numberOr(utility.hotspotOffsetX, 0),
      hotspotOffsetY: numberOr(utility.hotspotOffsetY, 0)
    },
    { inplace: false }
  );

  data.utility.originalState = buildOriginalState(
    tileDoc,
    data.utility
  );
  data.version = 2;
  return data;
}

function migrateToVersion3(tileDoc, data) {
  const speech = clone(data.speech);

  data.speech = foundry.utils.mergeObject(
    speech,
    {
      conversationEnabled: booleanOr(
        speech.conversationEnabled,
        false
      ),
      conversationId: speech.conversationId ?? "",
      conversationStart: booleanOr(
        speech.conversationStart,
        false
      ),
      conversationStartNode:
        speech.conversationStartNode
        ?? "start",
      conversationNextTileId:
        speech.conversationNextTileId
        ?? ""
    },
    { inplace: false }
  );

  data.version = 3;
  return data;
}

function migrateToVersion4(tileDoc, data) {
  const speech = clone(data.speech);

  data.speech = foundry.utils.mergeObject(
    speech,
    {
      conversationSequenceEnabled: booleanOr(
        speech.conversationSequenceEnabled,
        false
      ),
      conversationParticipants: Array.isArray(
        speech.conversationParticipants
      )
        ? speech.conversationParticipants.slice(0, 5)
        : [],
      conversationOrder: Array.isArray(
        speech.conversationOrder
      )
        ? speech.conversationOrder
        : [],
      conversationLineDelay: Math.max(
        0.25,
        numberOr(speech.conversationLineDelay, 3)
      )
    },
    { inplace: false }
  );

  data.version = 4;
  return data;
}

function migrateToVersion5(tileDoc, data) {
  const utility = clone(data.utility);

  data.utility = foundry.utils.mergeObject(
    utility,
    {
      multipleUse: booleanOr(utility.multipleUse, true),
      usedOnce: booleanOr(utility.usedOnce, false)
    },
    { inplace: false }
  );

  data.utility.originalState = foundry.utils.mergeObject(
    data.utility.originalState ?? {},
    {
      multipleUse: booleanOr(
        data.utility.originalState?.multipleUse
          ?? utility.multipleUse,
        true
      )
    },
    { inplace: false }
  );

  data.version = 5;
  return data;
}

function isTalkToMeTile(tileDoc) {
  const root = tileDoc.flags?.[TTM_ID] ?? {};
  const utility = root.utility ?? {};
  const speech = root.speech ?? {};

  return Boolean(
    utility.template
    || speech.managed
    || speech.mode
    || speech.tableId
    || speech.text
    || utility.doorWallId
    || utility.teleportX !== undefined
    || utility.lightDim !== undefined
  );
}

export function buildTileMigration(tileDoc) {
  if (!isTalkToMeTile(tileDoc)) return null;

  const root = clone(tileDoc.flags?.[TTM_ID]);
  const fromVersion = numberOr(root.dataVersion, 0);

  if (fromVersion >= TTM_TILE_SCHEMA_VERSION) {
    return null;
  }

  let data = {
    version: fromVersion,
    utility: clone(root.utility),
    speech: clone(root.speech)
  };

  if (data.version < 1) data = migrateToVersion1(tileDoc, data);
  if (data.version < 2) data = migrateToVersion2(tileDoc, data);
  if (data.version < 3) data = migrateToVersion3(tileDoc, data);
  if (data.version < 4) data = migrateToVersion4(tileDoc, data);
  if (data.version < 5) data = migrateToVersion5(tileDoc, data);

  return {
    _id: tileDoc.id,
    [`flags.${TTM_ID}.dataVersion`]: TTM_TILE_SCHEMA_VERSION,
    [`flags.${TTM_ID}.utility`]: data.utility,
    [`flags.${TTM_ID}.speech`]: data.speech
  };
}

export async function migrateScene(scene, {
  dryRun = false
} = {}) {
  const updates = [];
  const failures = [];

  for (const tileDoc of scene.tiles?.contents ?? []) {
    try {
      const update = buildTileMigration(tileDoc);
      if (update) updates.push(update);
    } catch (error) {
      failures.push({
        sceneId: scene.id,
        sceneName: scene.name,
        tileId: tileDoc.id,
        tileName: tileDoc.name,
        error
      });
    }
  }

  let migrated = updates.length;

  if (!dryRun && updates.length) {
    try {
      await scene.updateEmbeddedDocuments("Tile", updates);
    } catch (error) {
      failures.push({
        sceneId: scene.id,
        sceneName: scene.name,
        tileId: null,
        tileName: null,
        error
      });
      migrated = 0;
    }
  }

  return {
    sceneId: scene.id,
    sceneName: scene.name,
    scanned: scene.tiles?.size ?? 0,
    migrated,
    failures
  };
}

export async function migrateWorld({
  dryRun = false,
  notify = true,
  force = false
} = {}) {
  if (!game.user?.isGM) {
    if (notify) {
      ui.notifications.warn(
        "Only a GM can run TalkToMe data migrations."
      );
    }
    return null;
  }

  const storedVersion = numberOr(
    game.settings.get(TTM_ID, "worldDataVersion"),
    0
  );

  if (
    !force
    && !dryRun
    && storedVersion >= TTM_WORLD_MIGRATION_VERSION
  ) {
    return {
      fromVersion: storedVersion,
      toVersion: TTM_WORLD_MIGRATION_VERSION,
      scenes: 0,
      scanned: 0,
      migrated: 0,
      failures: []
    };
  }

  const reports = [];

  for (const scene of game.scenes?.contents ?? []) {
    reports.push(await migrateScene(scene, { dryRun }));
  }

  const report = {
    fromVersion: storedVersion,
    toVersion: TTM_WORLD_MIGRATION_VERSION,
    scenes: reports.length,
    scanned: reports.reduce(
      (sum, item) => sum + item.scanned,
      0
    ),
    migrated: reports.reduce(
      (sum, item) => sum + item.migrated,
      0
    ),
    failures: reports.flatMap(item => item.failures),
    dryRun
  };

  if (!dryRun && report.failures.length === 0) {
    await game.settings.set(
      TTM_ID,
      "worldDataVersion",
      TTM_WORLD_MIGRATION_VERSION
    );
  }

  console.log("TalkToMe migration report", report);

  if (notify) {
    if (report.failures.length) {
      ui.notifications.warn(
        `TalkToMe migrated ${report.migrated} tile(s), `
        + `with ${report.failures.length} failure(s).`
      );
    } else {
      ui.notifications.info(
        dryRun
          ? `TalkToMe migration preview found `
            + `${report.migrated} tile(s) to update.`
          : `TalkToMe migration complete: `
            + `${report.migrated} tile(s) updated.`
      );
    }
  }

  return report;
}

export async function runAutomaticMigration() {
  if (!game.user?.isGM) return null;

  const activeGM = game.users?.activeGM;
  if (activeGM && activeGM.id !== game.user.id) return null;

  return migrateWorld({
    dryRun: false,
    notify: false,
    force: false
  });
}
