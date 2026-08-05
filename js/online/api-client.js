export class MultiplayerApiError extends Error {
  constructor(message, code = "request_failed", status = 0) {
    super(message);
    this.name = "MultiplayerApiError";
    this.code = code;
    this.status = status;
  }
}

function websocketUrl(serverUrl, roomId) {
  const url = new URL(`${serverUrl}/api/rooms/${roomId}/socket`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const random = Math.random().toString(36).slice(2);
  return `mw-${Date.now().toString(36)}-${random}`;
}

export class MultiplayerApi extends EventTarget {
  constructor(serverUrl, {
    fetchImpl = globalThis.fetch,
    WebSocketImpl = globalThis.WebSocket,
    setTimeoutImpl = globalThis.setTimeout,
    clearTimeoutImpl = globalThis.clearTimeout,
  } = {}) {
    super();
    this.serverUrl = String(serverUrl).replace(/\/+$/, "");
    this.fetchImpl = fetchImpl?.bind(globalThis);
    this.WebSocketImpl = WebSocketImpl;
    this.setTimeoutImpl = setTimeoutImpl?.bind(globalThis);
    this.clearTimeoutImpl = clearTimeoutImpl?.bind(globalThis);
    this.credentials = null;
    this.socket = null;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.pending = new Map();
    this.lastFocusSyncAt = 0;
    this.closed = false;
  }

  setCredentials(credentials) {
    this.credentials = { ...credentials };
  }

  async request(path, options = {}) {
    const controller = new AbortController();
    const timeout = this.setTimeoutImpl(() => controller.abort(), 15_000);
    const headers = new Headers(options.headers ?? {});
    if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    if (this.credentials?.token) headers.set("authorization", `Bearer ${this.credentials.token}`);
    try {
      const response = await this.fetchImpl(`${this.serverUrl}${path}`, { ...options, headers, signal: controller.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new MultiplayerApiError(body.error || `The multiplayer server returned ${response.status}.`, body.code, response.status);
      return body;
    } catch (error) {
      if (error instanceof MultiplayerApiError) throw error;
      console.warn("Multiplayer request failed", error);
      if (error?.name === "AbortError") throw new MultiplayerApiError("The multiplayer server did not answer within 15 seconds.", "timeout");
      throw new MultiplayerApiError("The multiplayer server could not be reached. Check the server address and your internet connection.", "network_error");
    } finally {
      this.clearTimeoutImpl(timeout);
    }
  }

  health() {
    return this.request("/api/health");
  }

  createRoom(hostName) {
    return this.request("/api/rooms", { method: "POST", body: JSON.stringify({ hostName }) });
  }

  state() {
    if (!this.credentials) throw new MultiplayerApiError("Room credentials are missing.", "credentials_missing");
    return this.request(`/api/rooms/${this.credentials.roomId}/state`);
  }

  socketOpen() {
    return Boolean(this.socket && this.WebSocketImpl && this.socket.readyState === this.WebSocketImpl.OPEN);
  }

  sendLive(type, fields = {}, timeoutMs = 15_000) {
    if (!this.credentials) return Promise.reject(new MultiplayerApiError("Room credentials are missing.", "credentials_missing"));
    if (!this.socketOpen()) {
      return Promise.reject(new MultiplayerApiError("The live room is disconnected. Use Reconnect, then try again.", "connection_unavailable"));
    }
    const id = requestId();
    return new Promise((resolve, reject) => {
      const timeout = this.setTimeoutImpl(() => {
        this.pending.delete(id);
        reject(new MultiplayerApiError("The live room did not confirm that action. Reconnect before trying again.", "socket_timeout"));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.socket.send(JSON.stringify({ type, requestId: id, ...fields }));
      } catch {
        this.finishPending(id, new MultiplayerApiError("The live room disconnected before the action was sent.", "connection_lost"));
      }
    });
  }

  action(type, payload = {}) {
    return this.sendLive("action", { action: type, payload });
  }

  sync() {
    return this.sendLive("sync", {}, 10_000);
  }

  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  finishPending(id, error = null, value = null) {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    this.clearTimeoutImpl(pending.timeout);
    if (error) pending.reject(error);
    else pending.resolve(value);
  }

  rejectPending(message = "The live room disconnected before confirming an action.") {
    for (const id of [...this.pending.keys()]) {
      this.finishPending(id, new MultiplayerApiError(message, "connection_lost"));
    }
  }

  connect() {
    if (!this.credentials || !this.WebSocketImpl || this.closed) {
      if (!this.WebSocketImpl) this.emit("connection", { status: "error" });
      return;
    }
    if (this.socket && [this.WebSocketImpl.OPEN, this.WebSocketImpl.CONNECTING].includes(this.socket.readyState)) return;
    const socket = new this.WebSocketImpl(
      websocketUrl(this.serverUrl, this.credentials.roomId),
      ["massivecraft-v1", this.credentials.token],
    );
    this.socket = socket;
    this.emit("connection", { status: "connecting" });
    socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.emit("connection", { status: "connected" });
    });
    socket.addEventListener("message", (event) => {
      if (event.data === "pong") return;
      try {
        const message = JSON.parse(event.data);
        if (message.state) this.emit("state", message.state);
        if (message.type === "ack" && message.requestId) {
          this.finishPending(message.requestId, null, { state: message.state, duplicate: Boolean(message.duplicate) });
        } else if (message.type === "error") {
          const error = new MultiplayerApiError(message.error || "The live room rejected that action.", message.code, message.status);
          if (message.requestId) this.finishPending(message.requestId, error);
          else this.emit("error", error);
        }
      } catch {
        this.emit("error", new MultiplayerApiError("The live room sent unreadable data.", "invalid_socket_message"));
      }
    });
    socket.addEventListener("close", () => {
      if (this.socket === socket) this.socket = null;
      this.rejectPending();
      if (this.closed) return;
      this.emit("connection", { status: "reconnecting" });
      this.scheduleReconnect();
    });
    socket.addEventListener("error", () => socket.close());
  }

  scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;
    const delay = Math.min(60_000, 1_000 * (2 ** this.reconnectAttempt));
    this.reconnectAttempt += 1;
    this.reconnectTimer = this.setTimeoutImpl(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  async syncOnFocus() {
    if (this.closed || !this.credentials) return null;
    const now = Date.now();
    if (now - this.lastFocusSyncAt < 1_000) return null;
    this.lastFocusSyncAt = now;
    if (this.socketOpen()) {
      try { return await this.sync(); } catch { return null; }
    }
    try {
      const result = await this.state();
      this.emit("state", result.state);
      return result;
    } catch (error) {
      this.emit("error", error);
      return null;
    } finally {
      this.reconnectNow();
    }
  }

  reconnectNow() {
    if (this.closed || !this.credentials) return;
    if (this.reconnectTimer) this.clearTimeoutImpl(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    if (this.socketOpen()) {
      this.sync().catch((error) => this.emit("error", error));
      return;
    }
    if (this.socket && this.WebSocketImpl && this.socket.readyState === this.WebSocketImpl.CONNECTING) return;
    this.connect();
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) this.clearTimeoutImpl(this.reconnectTimer);
    this.reconnectTimer = null;
    this.rejectPending("The page closed before the live room confirmed an action.");
    if (this.socket) this.socket.close(1000, "Page closed");
    this.socket = null;
  }
}
