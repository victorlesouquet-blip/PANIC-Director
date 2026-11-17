// Motor de Sincronización en Tiempo Real para toda la clase (Nube Zero-Config + BroadcastChannel)
// Permite que todos los alumnos escaneen el QR con su móvil y sus partidas aparezcan al instante en el Proyector.

import { normalizeInitials } from './telemetryStore.js';

const ROOM_STORAGE_KEY = 'panic_director_room_code_v1';
const CLIENT_ID_KEY = 'panic_director_client_id_v1';
const RESET_AT_KEY_PREFIX = 'panic_director_reset_at_';
const NTFY_BASE_URL = 'https://ntfy.sh';
const ACTIVE_RUN_TTL_MS = 66000; // 60s de partida + margen

export function normalizeRoomCode(raw) {
  const cleaned = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 12);
  return cleaned || 'CLASE';
}

export function buildTopicForRoom(roomCode) {
  const norm = normalizeRoomCode(roomCode).toLowerCase();
  return `panic_director_live_v2_${norm}`;
}

export function getPublicGameUrl(roomCode) {
  const norm = normalizeRoomCode(roomCode);
  if (typeof window !== 'undefined' && window.location) {
    const { origin, pathname, hostname } = window.location;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      const cleanPath = pathname.endsWith('/') ? pathname : `${pathname}/`;
      return `${origin}${cleanPath}?room=${encodeURIComponent(norm)}`;
    }
  }
  return `https://victorlesouquet-blip.github.io/PANIC-Director/?room=${encodeURIComponent(norm)}`;
}

export class LiveClassroomSync {
  constructor(store, options = {}) {
    this.store = store;
    this.fetchImpl = options.fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    this.EventSourceImpl = options.EventSourceImpl || (typeof EventSource !== 'undefined' ? EventSource : null);
    this.storage = options.storage !== undefined ? options.storage : (typeof window !== 'undefined' ? window.localStorage : null);

    this.clientId = this._loadOrCreateClientId();
    this.roomCode = normalizeRoomCode(options.initialRoom || this._detectInitialRoom());
    this.resetAtIso = this._loadResetAt(this.roomCode);

    this.connectionState = 'connecting'; // 'connecting' | 'live' | 'local'
    this.activePlayers = new Map(); // key: clientId o initials -> { clientId, initials, avatar, mode, startedAt }
    this.liveEvents = []; // últimos eventos recibidos en la sesión
    this.processedEventIds = new Set();
    this.listeners = new Set();
    this.runToastListeners = new Set();

    this._eventSource = null;
    this._pollTimer = null;
    this._cleanupTimer = null;
    this._broadcastChannel = null;
  }

  _loadOrCreateClientId() {
    if (this.storage) {
      try {
        const saved = this.storage.getItem(CLIENT_ID_KEY);
        if (saved) return saved;
        const created = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        this.storage.setItem(CLIENT_ID_KEY, created);
        return created;
      } catch {
        // Ignorar
      }
    }
    return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  _detectInitialRoom() {
    if (typeof window !== 'undefined' && window.location) {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('room') || params.get('sala');
      if (fromUrl) {
        const norm = normalizeRoomCode(fromUrl);
        this._saveRoom(norm);
        return norm;
      }
    }
    if (this.storage) {
      try {
        const saved = this.storage.getItem(ROOM_STORAGE_KEY);
        if (saved) return normalizeRoomCode(saved);
      } catch {
        // Ignorar
      }
    }
    return 'CLASE';
  }

  _saveRoom(roomCode) {
    if (!this.storage) return;
    try {
      this.storage.setItem(ROOM_STORAGE_KEY, roomCode);
    } catch {
      // Ignorar
    }
  }

  _loadResetAt(roomCode) {
    if (!this.storage) return null;
    try {
      return this.storage.getItem(`${RESET_AT_KEY_PREFIX}${roomCode}`) || null;
    } catch {
      return null;
    }
  }

  _saveResetAt(roomCode, iso) {
    this.resetAtIso = iso;
    if (!this.storage) return;
    try {
      if (iso) {
        this.storage.setItem(`${RESET_AT_KEY_PREFIX}${roomCode}`, iso);
      } else {
        this.storage.removeItem(`${RESET_AT_KEY_PREFIX}${roomCode}`);
      }
    } catch {
      // Ignorar
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  onRealtimeRun(callback) {
    this.runToastListeners.add(callback);
    return () => this.runToastListeners.delete(callback);
  }

  notify() {
    this._pruneExpiredActivePlayers();
    for (const cb of this.listeners) {
      try {
        cb(this.getState());
      } catch {
        // Ignorar errores de suscriptor
      }
    }
  }

  getState() {
    this._pruneExpiredActivePlayers();
    return {
      roomCode: this.roomCode,
      connectionState: this.connectionState,
      publicUrl: getPublicGameUrl(this.roomCode),
      activePlayers: Array.from(this.activePlayers.values()).sort((a, b) => b.startedAt - a.startedAt),
      liveEvents: this.liveEvents.slice(0, 20)
    };
  }

  setRoom(nextRoomCode) {
    const normalized = normalizeRoomCode(nextRoomCode);
    if (normalized === this.roomCode) return;
    this.roomCode = normalized;
    this._saveRoom(normalized);
    this.resetAtIso = this._loadResetAt(normalized);
    this.activePlayers.clear();
    this.liveEvents = [];
    this.processedEventIds.clear();
    this.reconnect();
    this.notify();
  }

  start() {
    this._setupLocalChannel();
    this.reconnect();
    if (typeof setInterval !== 'undefined' && !this._cleanupTimer) {
      this._cleanupTimer = setInterval(() => {
        const before = this.activePlayers.size;
        this._pruneExpiredActivePlayers();
        if (this.activePlayers.size !== before) {
          this.notify();
        }
      }, 2000);
    }
  }

  stop() {
    if (this._eventSource) {
      try {
        this._eventSource.close();
      } catch {
        // Ignorar
      }
      this._eventSource = null;
    }
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    if (this._broadcastChannel) {
      try {
        this._broadcastChannel.close();
      } catch {
        // Ignorar
      }
      this._broadcastChannel = null;
    }
  }

  _setupLocalChannel() {
    if (typeof BroadcastChannel !== 'undefined' && !this._broadcastChannel) {
      try {
        this._broadcastChannel = new BroadcastChannel('panic_director_classroom_channel');
        this._broadcastChannel.onmessage = (ev) => {
          if (ev?.data) {
            this.ingestPayload(ev.data, { isRealtime: true });
          }
        };
      } catch {
        // Ignorar si BroadcastChannel no está soportado
      }
    }
  }

  reconnect() {
    if (this._eventSource) {
      try {
        this._eventSource.close();
      } catch {
        // Ignorar
      }
      this._eventSource = null;
    }
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }

    this.connectionState = 'connecting';
    this.notify();

    // 1. Descargar historial reciente de la sala en la nube (últimas 12h)
    this.fetchHistory('12h');

    // 2. Abrir stream SSE en tiempo real
    const topic = buildTopicForRoom(this.roomCode);
    if (this.EventSourceImpl) {
      try {
        const es = new this.EventSourceImpl(`${NTFY_BASE_URL}/${topic}/sse`);
        this._eventSource = es;
        es.onopen = () => {
          this.connectionState = 'live';
          this.notify();
        };
        es.onmessage = (event) => {
          this.connectionState = 'live';
          this._handleNtfyEnvelope(event.data, { isRealtime: true });
        };
        es.onerror = () => {
          if (this.connectionState === 'connecting') {
            this.connectionState = 'local';
            this.notify();
          }
        };
      } catch {
        this.connectionState = 'local';
      }
    }

    // 3. Polling ligero de respaldo cada 4.5s por si el móvil suspende SSE
    if (typeof setInterval !== 'undefined' && this.fetchImpl) {
      this._pollTimer = setInterval(() => {
        this.fetchHistory('25s', { isRealtime: true });
      }, 4500);
    }
  }

  async fetchHistory(since = '12h', { isRealtime = false } = {}) {
    if (!this.fetchImpl) return;
    const topic = buildTopicForRoom(this.roomCode);
    try {
      const res = await this.fetchImpl(`${NTFY_BASE_URL}/${topic}/json?poll=1&since=${encodeURIComponent(since)}`);
      if (!res.ok) return;
      this.connectionState = 'live';
      const text = await res.text();
      const lines = text.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines) {
        this._handleNtfyEnvelope(line, { isRealtime });
      }
      this.notify();
    } catch {
      if (this.connectionState === 'connecting') {
        this.connectionState = 'local';
        this.notify();
      }
    }
  }

  _handleNtfyEnvelope(rawJsonLine, { isRealtime = false } = {}) {
    try {
      const env = JSON.parse(rawJsonLine);
      if (env.event && env.event !== 'message') return;
      if (env.id && this.processedEventIds.has(env.id)) return;
      if (env.id) this.processedEventIds.add(env.id);

      const bodyStr = env.message;
      if (!bodyStr || typeof bodyStr !== 'string') return;
      const payload = JSON.parse(bodyStr);
      this.ingestPayload(payload, { isRealtime });
    } catch {
      // Ignorar mensajes que no sean JSON de telemetría
    }
  }

  ingestPayload(payload, { isRealtime = false } = {}) {
    if (!payload || typeof payload !== 'object') return false;
    if (payload.room && normalizeRoomCode(payload.room) !== this.roomCode) return false;

    const eventKey = payload.eventId || (payload.record && payload.record.id) || null;
    if (eventKey && this.processedEventIds.has(eventKey)) {
      return false;
    }
    if (eventKey) {
      this.processedEventIds.add(eventKey);
    }

    if (payload.type === 'room_reset' && payload.resetAt) {
      if (!this.resetAtIso || new Date(payload.resetAt) > new Date(this.resetAtIso)) {
        this._saveResetAt(this.roomCode, payload.resetAt);
        this.store.clearAll();
        this.activePlayers.clear();
        this.liveEvents = [];
        this.notify();
        return true;
      }
      return false;
    }

    if (payload.type === 'run_start') {
      const startedAt = Number(payload.startedAt) || Date.now();
      if (this.resetAtIso && startedAt < new Date(this.resetAtIso).getTime()) {
        return false;
      }
      if (Date.now() - startedAt > ACTIVE_RUN_TTL_MS) {
        return false;
      }
      const key = payload.clientId || normalizeInitials(payload.initials);
      this.activePlayers.set(key, {
        clientId: key,
        initials: normalizeInitials(payload.initials),
        avatar: payload.avatar || 'penitente',
        mode: payload.mode || 'director2026',
        startedAt
      });
      this.notify();
      return true;
    }

    if (payload.type === 'run_finish' && payload.record) {
      const rec = payload.record;
      const playedTime = new Date(rec.playedAt || Date.now()).getTime();
      if (this.resetAtIso && playedTime < new Date(this.resetAtIso).getTime()) {
        return false;
      }

      // Quitar de jugadores activos en arena
      if (payload.clientId) this.activePlayers.delete(payload.clientId);
      const normInit = normalizeInitials(rec.initials);
      for (const [k, v] of this.activePlayers.entries()) {
        if (v.initials === normInit) this.activePlayers.delete(k);
      }

      const added = this.store.importAndMergeJSON(JSON.stringify([rec]));
      this._pushLiveEvent(rec);

      if (added > 0 && isRealtime) {
        for (const cb of this.runToastListeners) {
          try {
            cb(rec);
          } catch {
            // Ignorar
          }
        }
      }
      this.notify();
      return added > 0;
    }

    if (payload.type === 'room_snapshot' && Array.isArray(payload.records)) {
      const validRecords = this.resetAtIso
        ? payload.records.filter((r) => new Date(r.playedAt || 0).getTime() >= new Date(this.resetAtIso).getTime())
        : payload.records;
      if (validRecords.length > 0) {
        const added = this.store.importAndMergeJSON(JSON.stringify(validRecords));
        for (const r of validRecords.slice(0, 8)) {
          this._pushLiveEvent(r);
        }
        if (added > 0) this.notify();
        return added > 0;
      }
    }

    return false;
  }

  _pushLiveEvent(rec) {
    if (!rec || !rec.id) return;
    if (this.liveEvents.some((e) => e.id === rec.id)) return;
    this.liveEvents.unshift({
      id: rec.id,
      initials: normalizeInitials(rec.initials),
      avatar: rec.avatar || 'penitente',
      mode: rec.mode || 'director2026',
      survivedSeconds: Number(rec.survivedSeconds) || 0,
      didSurvive: Boolean(rec.didSurvive),
      kills: Number(rec.kills) || 0,
      averageStress: Number(rec.averageStress) || 0,
      peakStress: Number(rec.peakStress) || 0,
      playedAt: rec.playedAt || new Date().toISOString()
    });
    this.liveEvents.sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
    if (this.liveEvents.length > 30) {
      this.liveEvents.length = 30;
    }
  }

  _pruneExpiredActivePlayers() {
    const now = Date.now();
    for (const [k, v] of this.activePlayers.entries()) {
      if (now - v.startedAt > ACTIVE_RUN_TTL_MS) {
        this.activePlayers.delete(k);
      }
    }
  }

  async publishRunStart({ initials, avatar, mode }) {
    const payload = {
      v: 1,
      eventId: `start_${this.clientId}_${Date.now()}`,
      type: 'run_start',
      room: this.roomCode,
      clientId: this.clientId,
      initials: normalizeInitials(initials),
      avatar: avatar || 'penitente',
      mode: mode || 'director2026',
      startedAt: Date.now()
    };
    this.ingestPayload(payload, { isRealtime: true });
    this._broadcastLocal(payload);
    await this._postToCloud(payload);
  }

  async publishRunFinish(record) {
    // Limpiar jugador activo local
    this.activePlayers.delete(this.clientId);
    this._pushLiveEvent(record);

    const payload = {
      v: 1,
      eventId: `finish_${record.id}`,
      type: 'run_finish',
      room: this.roomCode,
      clientId: this.clientId,
      record
    };
    this._broadcastLocal(payload);
    await this._postToCloud(payload);
    this.notify();
  }

  async publishRoomReset() {
    const resetAt = new Date().toISOString();
    this._saveResetAt(this.roomCode, resetAt);
    this.store.clearAll();
    this.activePlayers.clear();
    this.liveEvents = [];

    const payload = {
      v: 1,
      eventId: `reset_${this.clientId}_${Date.now()}`,
      type: 'room_reset',
      room: this.roomCode,
      clientId: this.clientId,
      resetAt
    };
    this._broadcastLocal(payload);
    await this._postToCloud(payload);
    this.notify();
  }

  async publishRoomSnapshot() {
    if (this.store.records.length === 0) return;
    const payload = {
      v: 1,
      eventId: `snap_${this.clientId}_${Date.now()}`,
      type: 'room_snapshot',
      room: this.roomCode,
      clientId: this.clientId,
      records: this.store.records.slice(0, 60)
    };
    this._broadcastLocal(payload);
    await this._postToCloud(payload);
  }

  _broadcastLocal(payload) {
    if (this._broadcastChannel) {
      try {
        this._broadcastChannel.postMessage(payload);
      } catch {
        // Ignorar
      }
    }
  }

  async _postToCloud(payload) {
    if (!this.fetchImpl) return false;
    const topic = buildTopicForRoom(this.roomCode);
    try {
      const res = await this.fetchImpl(`${NTFY_BASE_URL}/${topic}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8'
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        this.connectionState = 'live';
        this.notify();
        return true;
      }
    } catch {
      // Ignorar fallo puntual de red; la partida ya quedó guardada localmente
    }
    return false;
  }
}
