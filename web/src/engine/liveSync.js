// Motor de Sincronización en Tiempo Real Multi-Canal (MQTT sobre WebSockets con Mensajes Retenidos + Cloud Fallback + BroadcastChannel)
// Permite que todos los móviles que escaneen el QR envíen sus partidas en <100ms al Proyector, Telemetría y Ránking.

import { normalizeInitials } from './telemetryStore.js';

const ROOM_STORAGE_KEY = 'panic_director_room_code_v1';
const CLIENT_ID_KEY = 'panic_director_client_id_v1';
const RESET_AT_KEY_PREFIX = 'panic_director_reset_at_';
const ACTIVE_RUN_TTL_MS = 145000;

// Brokers públicos globales MQTT 3.1.1 sobre WebSockets (TLS / WSS, sin restricciones CORS)
const DEFAULT_WSS_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt'
];

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
  return `panic_director_live_v3_${norm}`;
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

// MARK: - Codificador / Decodificador binario ligero MQTT 3.1.1 para WebSockets

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function encodeRemainingLength(len) {
  const bytes = [];
  let x = len;
  do {
    let encodedByte = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) encodedByte |= 0x80;
    bytes.push(encodedByte);
  } while (x > 0);
  return bytes;
}

function encodeUtf8String(str) {
  const utf8 = textEncoder.encode(str);
  const out = new Uint8Array(2 + utf8.length);
  out[0] = (utf8.length >>> 8) & 0xff;
  out[1] = utf8.length & 0xff;
  out.set(utf8, 2);
  return out;
}

export function buildMqttConnectPacket(clientId) {
  const protoName = encodeUtf8String('MQTT');
  const protoLevel = 0x04; // MQTT 3.1.1
  const connectFlags = 0x02; // Clean session
  const keepAliveHi = 0x00;
  const keepAliveLo = 0x2d; // 45s
  const clientField = encodeUtf8String(clientId);

  const remLen = protoName.length + 4 + clientField.length;
  const remBytes = encodeRemainingLength(remLen);
  const packet = new Uint8Array(1 + remBytes.length + remLen);

  let idx = 0;
  packet[idx++] = 0x10; // CONNECT
  for (const b of remBytes) packet[idx++] = b;
  packet.set(protoName, idx);
  idx += protoName.length;
  packet[idx++] = protoLevel;
  packet[idx++] = connectFlags;
  packet[idx++] = keepAliveHi;
  packet[idx++] = keepAliveLo;
  packet.set(clientField, idx);
  return packet;
}

export function buildMqttSubscribePacket(packetId, topicFilter) {
  const topicField = encodeUtf8String(topicFilter);
  const remLen = 2 + topicField.length + 1;
  const remBytes = encodeRemainingLength(remLen);
  const packet = new Uint8Array(1 + remBytes.length + remLen);

  let idx = 0;
  packet[idx++] = 0x82; // SUBSCRIBE (QoS 1 en cabecera fija según estándar)
  for (const b of remBytes) packet[idx++] = b;
  packet[idx++] = (packetId >>> 8) & 0xff;
  packet[idx++] = packetId & 0xff;
  packet.set(topicField, idx);
  idx += topicField.length;
  packet[idx++] = 0x00; // Requested QoS 0
  return packet;
}

export function buildMqttPublishPacket(topic, payloadStrOrBytes, { retain = false } = {}) {
  const topicField = encodeUtf8String(topic);
  const payloadBytes =
    typeof payloadStrOrBytes === 'string'
      ? textEncoder.encode(payloadStrOrBytes)
      : payloadStrOrBytes instanceof Uint8Array
        ? payloadStrOrBytes
        : new Uint8Array(0);

  const remLen = topicField.length + payloadBytes.length;
  const remBytes = encodeRemainingLength(remLen);
  const packet = new Uint8Array(1 + remBytes.length + remLen);

  let idx = 0;
  packet[idx++] = 0x30 | (retain ? 0x01 : 0x00); // PUBLISH QoS 0
  for (const b of remBytes) packet[idx++] = b;
  packet.set(topicField, idx);
  idx += topicField.length;
  packet.set(payloadBytes, idx);
  return packet;
}

export function parseMqttPackets(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const packets = [];
  let offset = 0;

  while (offset < bytes.length) {
    const headerByte = bytes[offset++];
    const packetType = headerByte >>> 4;
    const flags = headerByte & 0x0f;

    let multiplier = 1;
    let remLen = 0;
    let encodedByte = 0;
    do {
      if (offset >= bytes.length) return packets;
      encodedByte = bytes[offset++];
      remLen += (encodedByte & 0x7f) * multiplier;
      multiplier *= 128;
    } while ((encodedByte & 0x80) !== 0);

    const endOffset = offset + remLen;
    if (endOffset > bytes.length) break;

    if (packetType === 2) {
      // CONNACK
      packets.push({ type: 'connack', returnCode: bytes[offset + 1] });
    } else if (packetType === 3) {
      // PUBLISH
      const qos = (flags >>> 1) & 0x03;
      const retain = (flags & 0x01) !== 0;
      const topicLen = (bytes[offset] << 8) | bytes[offset + 1];
      const topicStart = offset + 2;
      const topic = textDecoder.decode(bytes.subarray(topicStart, topicStart + topicLen));
      let payloadStart = topicStart + topicLen;
      if (qos > 0) payloadStart += 2; // Packet ID si QoS > 0
      const payloadBytes = bytes.subarray(payloadStart, endOffset);
      const payloadText = payloadBytes.length > 0 ? textDecoder.decode(payloadBytes) : '';
      packets.push({ type: 'publish', topic, payloadText, retain });
    } else if (packetType === 9) {
      packets.push({ type: 'suback' });
    } else if (packetType === 13) {
      packets.push({ type: 'pingresp' });
    }

    offset = endOffset;
  }

  return packets;
}

// MARK: - Clase principal LiveClassroomSync

export class LiveClassroomSync {
  constructor(store, options = {}) {
    this.store = store;
    this.fetchImpl = options.fetchImpl !== undefined ? options.fetchImpl : (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    this.WebSocketImpl = options.WebSocketImpl !== undefined ? options.WebSocketImpl : (typeof WebSocket !== 'undefined' ? WebSocket : null);
    this.storage = options.storage !== undefined ? options.storage : (typeof window !== 'undefined' ? window.localStorage : null);
    this.brokerUrls = options.brokerUrls || DEFAULT_WSS_BROKERS;

    this.clientId = this._loadOrCreateClientId();
    this.roomCode = normalizeRoomCode(options.initialRoom || this._detectInitialRoom());
    this.resetAtIso = this._loadResetAt(this.roomCode);

    this.connectionState = 'connecting'; // 'connecting' | 'live' | 'local'
    this.activePlayers = new Map();
    this.liveEvents = [];
    this.processedEventIds = new Set();
    this.knownRunTopics = new Set();
    this.listeners = new Set();
    this.runToastListeners = new Set();

    this._sockets = new Map(); // brokerUrl -> { ws, ready, pingTimer, reconnectTimer }
    this._cleanupTimer = null;
    this._broadcastChannel = null;
    this._stopped = false;
  }

  _loadOrCreateClientId() {
    if (this.storage) {
      try {
        const saved = this.storage.getItem(CLIENT_ID_KEY);
        if (saved) return saved;
        const created = `pd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        this.storage.setItem(CLIENT_ID_KEY, created);
        return created;
      } catch {
        // Ignorar
      }
    }
    return `pd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
    this.knownRunTopics.clear();
    this.reconnect();
    this.notify();
  }

  start() {
    this._stopped = false;
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
    this._stopped = true;
    this._closeAllSockets();
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

  _closeAllSockets() {
    for (const entry of this._sockets.values()) {
      if (entry.pingTimer) clearInterval(entry.pingTimer);
      if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
      try {
        entry.ws.close();
      } catch {
        // Ignorar
      }
    }
    this._sockets.clear();
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
        // Ignorar
      }
    }
  }

  reconnect() {
    this._closeAllSockets();
    this.connectionState = 'connecting';
    this.notify();

    if (this.WebSocketImpl) {
      for (const brokerUrl of this.brokerUrls) {
        this._connectMqttBroker(brokerUrl);
      }
    } else {
      this.connectionState = 'local';
      this.notify();
    }
  }

  _roomTopicPrefix() {
    return `${buildTopicForRoom(this.roomCode)}`;
  }

  _connectMqttBroker(brokerUrl) {
    if (this._stopped || !this.WebSocketImpl) return;

    let ws;
    try {
      ws = new this.WebSocketImpl(brokerUrl, 'mqtt');
      ws.binaryType = 'arraybuffer';
    } catch {
      return;
    }

    const entry = { ws, ready: false, pingTimer: null, reconnectTimer: null };
    this._sockets.set(brokerUrl, entry);

    ws.onopen = () => {
      try {
        const uniqueMqttClientId = `${this.clientId}_${Math.random().toString(36).slice(2, 6)}`;
        ws.send(buildMqttConnectPacket(uniqueMqttClientId));
      } catch {
        // Ignorar
      }
    };

    ws.onmessage = async (event) => {
      try {
        let buf = event.data;
        if (typeof Blob !== 'undefined' && buf instanceof Blob) {
          buf = await buf.arrayBuffer();
        }
        const packets = parseMqttPackets(buf);
        for (const pkt of packets) {
          if (pkt.type === 'connack' && pkt.returnCode === 0) {
            entry.ready = true;
            this.connectionState = 'live';
            // Suscribirse a todos los sub-tópicos de la sala (incluye mensajes retenidos de partidas y reset)
            const subFilter = `${this._roomTopicPrefix()}/#`;
            ws.send(buildMqttSubscribePacket(1, subFilter));

            // Keep-alive PINGREQ cada 25 segundos
            if (entry.pingTimer) clearInterval(entry.pingTimer);
            entry.pingTimer = setInterval(() => {
              if (ws.readyState === 1) {
                ws.send(new Uint8Array([0xc0, 0x00]));
              }
            }, 25000);

            // Auto-sincronizar las partidas locales que este dispositivo ya haya jugado
            this._syncLocalRecordsToBroker(ws);
            this.notify();
          } else if (pkt.type === 'publish') {
            if (pkt.topic.includes('/run/')) {
              this.knownRunTopics.add(pkt.topic);
            }
            if (!pkt.payloadText) continue;
            try {
              const parsed = JSON.parse(pkt.payloadText);
              // Si no es retenido, es un evento en vivo recién emitido (<100ms)
              this.ingestPayload(parsed, { isRealtime: !pkt.retain });
            } catch {
              // Ignorar JSON malformado
            }
          }
        }
      } catch {
        // Ignorar error de paquete
      }
    };

    const handleDisconnect = () => {
      entry.ready = false;
      if (entry.pingTimer) {
        clearInterval(entry.pingTimer);
        entry.pingTimer = null;
      }
      const anyReady = Array.from(this._sockets.values()).some((s) => s.ready);
      if (!anyReady && !this._stopped) {
        this.connectionState = 'local';
        this.notify();
      }
      if (!this._stopped && !entry.reconnectTimer) {
        entry.reconnectTimer = setTimeout(() => {
          entry.reconnectTimer = null;
          this._connectMqttBroker(brokerUrl);
        }, 3500);
      }
    };

    ws.onerror = handleDisconnect;
    ws.onclose = handleDisconnect;
  }

  _syncLocalRecordsToBroker(ws) {
    if (!ws || ws.readyState !== 1) return;
    const prefix = this._roomTopicPrefix();
    const resetTime = this.resetAtIso ? new Date(this.resetAtIso).getTime() : 0;

    // Publicar las últimas 25 partidas guardadas en este móvil/navegador con retain: true
    const localRuns = this.store.records.slice(0, 25);
    for (const rec of localRuns) {
      const playedTime = new Date(rec.playedAt || 0).getTime();
      if (resetTime && playedTime < resetTime) continue;

      const payload = {
        v: 1,
        eventId: `finish_${rec.id}`,
        type: 'run_finish',
        room: this.roomCode,
        clientId: this.clientId,
        record: rec
      };
      const topic = `${prefix}/run/${rec.id}`;
      this.knownRunTopics.add(topic);
      try {
        ws.send(buildMqttPublishPacket(topic, JSON.stringify(payload), { retain: true }));
      } catch {
        // Ignorar
      }
    }
  }

  _publishMqtt(subTopic, payloadObj, { retain = false } = {}) {
    const fullTopic = `${this._roomTopicPrefix()}/${subTopic}`;
    if (subTopic.startsWith('run/')) {
      this.knownRunTopics.add(fullTopic);
    }
    const packet = buildMqttPublishPacket(fullTopic, JSON.stringify(payloadObj), { retain });
    let sentCount = 0;
    for (const entry of this._sockets.values()) {
      if (entry.ready && entry.ws.readyState === 1) {
        try {
          entry.ws.send(packet);
          sentCount++;
        } catch {
          // Ignorar
        }
      }
    }
    return sentCount > 0;
  }

  ingestPayload(payload, { isRealtime = false } = {}) {
    if (!payload || typeof payload !== 'object') return false;
    if (payload.room && normalizeRoomCode(payload.room) !== this.roomCode) return false;

    if (payload.type === 'room_reset' && payload.resetAt) {
      if (!this.resetAtIso || new Date(payload.resetAt) > new Date(this.resetAtIso)) {
        this._saveResetAt(this.roomCode, payload.resetAt);
        this.store.clearAll();
        this.activePlayers.clear();
        this.liveEvents = [];
        this.processedEventIds.clear();
        this.notify();
        return true;
      }
      return false;
    }

    const eventKey = payload.eventId || (payload.record && payload.record.id) || null;
    if (eventKey && this.processedEventIds.has(eventKey)) {
      return false;
    }
    if (eventKey) {
      this.processedEventIds.add(eventKey);
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
    this._publishMqtt(`live/${this.clientId}`, payload, { retain: false });
    await this._postToCloudFallback(payload);
  }

  async publishRunFinish(record) {
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
    // 1. Publicar con retain: true para que persista en el broker de la sala
    this._publishMqtt(`run/${record.id}`, payload, { retain: true });
    // 2. Publicar también sin retain como evento instantáneo para disparar el Toast en vivo
    this._publishMqtt('events', payload, { retain: false });
    await this._postToCloudFallback(payload);
    this.notify();
  }

  async publishRoomReset() {
    const resetAt = new Date().toISOString();
    this._saveResetAt(this.roomCode, resetAt);
    this.store.clearAll();
    this.activePlayers.clear();
    this.liveEvents = [];
    this.processedEventIds.clear();

    const payload = {
      v: 1,
      eventId: `reset_${this.clientId}_${Date.now()}`,
      type: 'room_reset',
      room: this.roomCode,
      clientId: this.clientId,
      resetAt
    };
    this._broadcastLocal(payload);

    // Guardar marca de reset retenida en los brokers
    this._publishMqtt('meta/reset', payload, { retain: true });

    // Limpiar mensajes retenidos conocidos de partidas anteriores
    for (const topic of this.knownRunTopics) {
      const clearPkt = buildMqttPublishPacket(topic, new Uint8Array(0), { retain: true });
      for (const entry of this._sockets.values()) {
        if (entry.ready && entry.ws.readyState === 1) {
          try {
            entry.ws.send(clearPkt);
          } catch {
            // Ignorar
          }
        }
      }
    }
    this.knownRunTopics.clear();

    await this._postToCloudFallback(payload);
    this.notify();
  }

  async publishRoomSnapshot() {
    for (const entry of this._sockets.values()) {
      if (entry.ready && entry.ws.readyState === 1) {
        this._syncLocalRecordsToBroker(entry.ws);
      }
    }
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

  async _postToCloudFallback(payload) {
    if (!this.fetchImpl) return false;
    const topic = buildTopicForRoom(this.roomCode);
    try {
      const res = await this.fetchImpl(`https://ntfy.sh/${topic}`, {
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
      // Ignorar si ntfy está bloqueado o con límite; MQTT WSS ya se encarga
    }
    return false;
  }
}
