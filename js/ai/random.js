function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed) {
  let state = (Number(seed) >>> 0) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedForGame(game, scope = "turn") {
  const publicPosition = (game.units ?? [])
    .filter((unit) => unit.alive !== false)
    .map((unit) => `${unit.id}:${unit.x},${unit.y},${unit.facing}`)
    .sort()
    .join("|");
  const reserveCount = Object.values(game.reserves ?? {}).reduce(
    (total, reserve) => total + (Array.isArray(reserve) ? reserve.length : 0),
    0,
  );
  return hashText(`${game.aiSeed ?? 1}|${scope}|${game.round ?? 0}|${reserveCount}|${publicPosition}`);
}

export function createGameSeed() {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoObject.getRandomValues(values);
    return values[0] || 1;
  }
  return hashText(`${Date.now()}|${globalThis.performance?.now?.() ?? 0}`) || 1;
}

export function jitter(random, amplitude) {
  return amplitude ? (random() * 2 - 1) * amplitude : 0;
}
