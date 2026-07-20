// =============================================================================
// Tile Effects
// =============================================================================
// Plays optional one-shot audio and lightweight tile animations on each client.

import { TTM_ID } from "./constants.js";

function getTilePlaceable(tileId) {
  return canvas.tiles?.get?.(tileId)
    ?? canvas.tiles?.placeables?.find(
      tile => tile.document?.id === tileId
    )
    ?? null;
}

async function playSound(src, volume = 0.8) {
  if (!src) return false;

  const options = {
    src,
    volume: Math.max(0, Math.min(1, Number(volume ?? 0.8))),
    autoplay: true,
    loop: false
  };

  const helper =
    globalThis.foundry?.audio?.AudioHelper
    ?? globalThis.AudioHelper;

  if (typeof helper?.play === "function") {
    await helper.play(options, false);
    return true;
  }

  if (typeof game.audio?.play === "function") {
    await game.audio.play(src, {
      volume: options.volume,
      loop: false
    });
    return true;
  }

  console.warn("TalkToMe could not find Foundry's audio player.");
  return false;
}

function animateValue(duration, update) {
  return new Promise(resolve => {
    const startedAt = performance.now();

    const frame = now => {
      const progress = Math.min(
        1,
        (now - startedAt) / Math.max(1, duration)
      );

      update(progress);

      if (progress >= 1) {
        resolve();
        return;
      }

      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  });
}

async function animateTile(tileId, type, duration = 700) {
  const tile = getTilePlaceable(tileId);
  if (!tile || !type || type === "none") return false;

  const target = tile.mesh ?? tile;
  const original = {
    alpha: Number(target.alpha ?? 1),
    rotation: Number(target.rotation ?? 0),
    scaleX: Number(target.scale?.x ?? 1),
    scaleY: Number(target.scale?.y ?? 1),
    x: Number(target.position?.x ?? target.x ?? 0),
    y: Number(target.position?.y ?? target.y ?? 0)
  };

  const restore = () => {
    target.alpha = original.alpha;
    target.rotation = original.rotation;

    if (target.scale?.set) {
      target.scale.set(original.scaleX, original.scaleY);
    }

    if (target.position?.set) {
      target.position.set(original.x, original.y);
    } else {
      target.x = original.x;
      target.y = original.y;
    }
  };

  try {
    await animateValue(
      Math.max(150, Number(duration ?? 700)),
      progress => {
        const wave = Math.sin(progress * Math.PI);
        const cycle = Math.sin(progress * Math.PI * 4);

        if (type === "pulse" && target.scale?.set) {
          const multiplier = 1 + wave * 0.18;
          target.scale.set(
            original.scaleX * multiplier,
            original.scaleY * multiplier
          );
        } else if (type === "shake") {
          const amount = cycle * (1 - progress) * 10;

          if (target.position?.set) {
            target.position.set(
              original.x + amount,
              original.y
            );
          } else {
            target.x = original.x + amount;
          }
        } else if (type === "spin") {
          target.rotation =
            original.rotation + progress * Math.PI * 2;
        } else if (type === "fade") {
          target.alpha =
            original.alpha * (0.25 + Math.abs(cycle) * 0.75);
        }
      }
    );

    return true;
  } finally {
    restore();
  }
}

export async function playTileEffectsLocal(data = {}) {
  const tasks = [];

  if (data.soundEnabled === true && data.soundFile) {
    tasks.push(
      playSound(data.soundFile, data.soundVolume)
    );
  }

  if (
    data.animationEnabled === true
    && data.animationType
    && data.animationType !== "none"
  ) {
    tasks.push(
      animateTile(
        data.tileId,
        data.animationType,
        data.animationDuration
      )
    );
  }

  if (!tasks.length) return false;

  await Promise.allSettled(tasks);
  return true;
}

export async function activateTileEffects(tileDoc) {
  if (!tileDoc) return false;

  const utility = tileDoc.getFlag(TTM_ID, "utility") ?? {};
  const data = {
    action: "tileEffects",
    senderId: game.user?.id,
    sceneId: canvas.scene?.id,
    tileId: tileDoc.id,
    soundEnabled: utility.soundEnabled === true,
    soundFile: String(utility.soundFile ?? ""),
    soundVolume: Math.max(
      0,
      Math.min(1, Number(utility.soundVolume ?? 0.8))
    ),
    animationEnabled: utility.animationEnabled === true,
    animationType: utility.animationType ?? "none",
    animationDuration: Math.max(
      150,
      Number(utility.animationDuration ?? 700)
    )
  };

  const hasEffects =
    (data.soundEnabled && data.soundFile)
    || (
      data.animationEnabled
      && data.animationType !== "none"
    );

  if (!hasEffects) return false;

  await playTileEffectsLocal(data);
  game.socket.emit(`module.${TTM_ID}`, data);
  return true;
}
