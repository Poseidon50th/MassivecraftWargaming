export const DEFAULT_DAILY_ROOM_LIMIT = 400;
export const DEFAULT_CLIENT_ROOM_LIMIT = 8;
export const DEFAULT_CLIENT_WINDOW_MS = 10 * 60 * 1_000;

export function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export function utcDay(now) {
  return new Date(now).toISOString().slice(0, 10);
}

export function admitRoomCreation({ daily, recentByClient }, clientKey, now, options = {}) {
  const dailyLimit = positiveInteger(options.dailyLimit, DEFAULT_DAILY_ROOM_LIMIT, 50_000);
  const clientLimit = positiveInteger(options.clientLimit, DEFAULT_CLIENT_ROOM_LIMIT, 100);
  const clientWindowMs = positiveInteger(options.clientWindowMs, DEFAULT_CLIENT_WINDOW_MS, 24 * 60 * 60 * 1_000);
  const day = utcDay(now);
  const currentDaily = daily?.day === day ? daily : { day, count: 0 };
  if (currentDaily.count >= dailyLimit) {
    return {
      allowed: false,
      code: "capacity_reserved",
      message: "New rooms are paused for today so battles already in progress can continue. Please try again after midnight UTC.",
      daily: currentDaily,
    };
  }

  const cutoff = now - clientWindowMs;
  const recent = (recentByClient.get(clientKey) ?? []).filter((timestamp) => timestamp > cutoff);
  if (recent.length >= clientLimit) {
    recentByClient.set(clientKey, recent);
    return {
      allowed: false,
      code: "room_creation_limited",
      message: "Too many rooms were created from this connection. Wait ten minutes, then try again.",
      daily: currentDaily,
    };
  }

  recent.push(now);
  recentByClient.set(clientKey, recent);
  return {
    allowed: true,
    daily: { day, count: currentDaily.count + 1 },
  };
}
