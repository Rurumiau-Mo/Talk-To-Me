import { TTM_ID } from "./constants.js";

class LightManager {
  constructor() {
    this.operations = new Map();
  }

  getFlags(tileDoc) {
    return tileDoc?.getFlag?.(TTM_ID, "utility") ?? {};
  }

  getCenter(tileDoc) {
    const placeable = canvas?.tiles?.get(tileDoc?.id);
    const visual = placeable?.mesh ?? placeable;

    try {
      if (visual?.getBounds && canvas?.stage?.worldTransform) {
        const bounds = visual.getBounds();
        const screenCenter = {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2
        };
        const worldCenter = canvas.stage.worldTransform.applyInverse(screenCenter);

        if (Number.isFinite(worldCenter?.x) && Number.isFinite(worldCenter?.y)) {
          return {
            x: Math.round(worldCenter.x),
            y: Math.round(worldCenter.y)
          };
        }
      }
    } catch (error) {
      console.warn("TalkToMe could not resolve the rendered tile image centre.", error);
    }

    return {
      x: Math.round(Number(tileDoc?.x ?? 0) + Number(tileDoc?.width ?? 0) / 2),
      y: Math.round(Number(tileDoc?.y ?? 0) + Number(tileDoc?.height ?? 0) / 2)
    };
  }

  getOwnedLights(tileDoc) {
    if (!tileDoc || !canvas?.scene) return [];

    return (canvas.scene.lights?.contents ?? []).filter(lightDoc => {
      const owner = lightDoc.getFlag(TTM_ID, "ownerTileId")
        ?? lightDoc.getFlag(TTM_ID, "parentTileId")
        ?? lightDoc.getFlag(TTM_ID, "linkedTileId");
      return owner === tileDoc.id;
    });
  }

  async runExclusive(tileId, operation) {
    const previous = this.operations.get(tileId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.operations.set(tileId, current);

    try {
      return await current;
    } finally {
      if (this.operations.get(tileId) === current) this.operations.delete(tileId);
    }
  }

  buildData(tileDoc, flags) {
    const center = this.getCenter(tileDoc);

    return {
      x: center.x,
      y: center.y,
      hidden: false,
      config: {
        dim: Number(flags.lightDim ?? 20),
        bright: Number(flags.lightBright ?? 10),
        color: flags.lightColor || "#ffffff",
        alpha: Number(flags.lightAlpha ?? 0.5),
        animation: {
          type: flags.lightAnimation || "",
          speed: 1,
          intensity: 1
        }
      },
      flags: {
        [TTM_ID]: {
          managed: true,
          ownerTileId: tileDoc.id
        }
      }
    };
  }

  async deduplicate(tileDoc, keepId = null) {
    const duplicates = this.getOwnedLights(tileDoc).filter(light => light.id !== keepId);
    if (!duplicates.length) return;

    await canvas.scene.deleteEmbeddedDocuments(
      "AmbientLight",
      duplicates.map(light => light.id)
    );
  }

  async setActive(tileDoc, active) {
    return this.runExclusive(tileDoc.id, async () => {
      const currentTile = canvas.scene?.tiles?.get(tileDoc.id) ?? tileDoc;
      const flags = this.getFlags(currentTile);
      const owned = this.getOwnedLights(currentTile);
      let lightDoc = flags.ambientLightId
        ? canvas.scene?.lights?.get(flags.ambientLightId) ?? null
        : null;

      if (!lightDoc && owned.length) lightDoc = owned[0];

      if (!active) {
        const ids = this.getOwnedLights(currentTile).map(light => light.id);
        if (ids.length) await canvas.scene.deleteEmbeddedDocuments("AmbientLight", ids);

        const updates = {
          [`flags.${TTM_ID}.utility.active`]: false,
          [`flags.${TTM_ID}.utility.lightOn`]: false,
          [`flags.${TTM_ID}.utility.ambientLightId`]: ""
        };
        if (flags.inactiveImage) updates["texture.src"] = flags.inactiveImage;
        await currentTile.update(updates);
        return false;
      }

      const data = this.buildData(currentTile, flags);
      if (lightDoc) await lightDoc.update(data);
      else {
        const created = await canvas.scene.createEmbeddedDocuments("AmbientLight", [data]);
        lightDoc = created?.[0] ?? null;
      }

      if (!lightDoc) throw new Error("TalkToMe could not create the AmbientLight.");

      await this.deduplicate(currentTile, lightDoc.id);

      const updates = {
        [`flags.${TTM_ID}.utility.active`]: true,
        [`flags.${TTM_ID}.utility.lightOn`]: true,
        [`flags.${TTM_ID}.utility.ambientLightId`]: lightDoc.id
      };
      if (flags.activeImage) updates["texture.src"] = flags.activeImage;
      await currentTile.update(updates);
      return true;
    });
  }

  async toggle(tileDoc, forceState = null) {
    const flags = this.getFlags(canvas.scene?.tiles?.get(tileDoc.id) ?? tileDoc);
    const active = forceState === null
      ? !(flags.active === true || flags.lightOn === true)
      : forceState === true;
    return this.setActive(tileDoc, active);
  }

  async sync(tileDoc) {
    if (!tileDoc || !canvas?.scene) return false;
    const flags = this.getFlags(tileDoc);
    if (flags.template !== "light") return false;

    const owned = this.getOwnedLights(tileDoc);
    let lightDoc = flags.ambientLightId
      ? canvas.scene.lights?.get(flags.ambientLightId) ?? null
      : null;
    if (!lightDoc && owned.length) lightDoc = owned[0];
    if (!lightDoc) return false;

    const center = this.getCenter(tileDoc);
    await lightDoc.update(center);
    await this.deduplicate(tileDoc, lightDoc.id);

    if (flags.ambientLightId !== lightDoc.id) {
      await tileDoc.update({ [`flags.${TTM_ID}.utility.ambientLightId`]: lightDoc.id });
    }
    return true;
  }

  async remove(tileDoc) {
    if (!tileDoc || !canvas?.scene) return;
    const ids = this.getOwnedLights(tileDoc).map(light => light.id);
    if (ids.length) await canvas.scene.deleteEmbeddedDocuments("AmbientLight", ids);
  }

  async reconcileScene() {
    if (!canvas?.scene) return;

    for (const tileDoc of canvas.scene.tiles?.contents ?? []) {
      const flags = this.getFlags(tileDoc);
      if (flags.template !== "light") continue;

      const shouldBeActive = flags.active === true || flags.lightOn === true;
      const owned = this.getOwnedLights(tileDoc);

      if (!shouldBeActive) {
        if (owned.length || flags.ambientLightId) {
          await this.setActive(tileDoc, false);
        }
        continue;
      }

      if (!owned.length && !flags.ambientLightId) {
        await this.setActive(tileDoc, true);
        continue;
      }

      const keep = flags.ambientLightId
        ? canvas.scene.lights?.get(flags.ambientLightId) ?? owned[0]
        : owned[0];

      if (!keep) continue;

      await this.deduplicate(tileDoc, keep.id);
      await this.sync(tileDoc);
    }
  }
}

export const lightManager = new LightManager();
