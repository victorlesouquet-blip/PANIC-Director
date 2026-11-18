// Motor de Sincronización en Tiempo Real Multi-Canal (MQTT sobre WebSockets con Mensajes Retenidos + Cloud Fallback + BroadcastChannel)
// Permite que todos los móviles que escaneen el QR envíen sus partidas en <100ms al Proyector, Telemetría y Ránking.

import { normalizeInitials } from './telemetryStore.js';

const ROOM_STORAGE_KEY = 'panic_director_room_code_v1';
const CLIENT_ID_KEY = 'panic_director_client_id_v1';
const RESET_AT_KEY_PREFIX = 'panic_director_reset_at_';
const ACTIVE_RUN_TTL_MS = 165000; // 120s de juego + 10s de pausas entre fases + margen
const NTFY_BASE_URL = 'https://ntfy.sh';

// Brokers públicos globales MQTT 3.1.1 sobre WebSockets (incluye puerto 443 estándar + puertos alternativos)
const DEFAULT_WSS_BROKERS = [
  'wss://mqtt.eclipseprojects.io:443/mqtt',
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
    this.EventSourceImpl = options.EventSourceImpl !== undefined ? options.EventSourceImpl : (typeof EventSource !== 'undefined' ? EventSource : null);
    this.storage = options.storage !== undefined ? options.storage : (typeof window !== 'undefined' ? window.localStorage : null);
    this.brokerUrls = options.brokerUrls || DEFAULT_WSS_BROKERS;

    this.clientId = this._loadOrCreateClientId();
    this.roomCode = normalizeRoomCode(options.initialRoom || this._detectInitialRoom());
    this.resetAtIso = this._loadResetAt(this.roomCode);

    this.connectionState = 'connecting'; // 'connecting' | 'live' | 'local'
    this.activePlayers = new Map();
    this.myActiveRun = null;
    this.finishedRunIds = new Set();
    this.finishedAfterByClient = new Map();
    this.finishedAfterByPlayer = new Map();
    this.liveEvents = [];
    this.processedEventIds = new Set();
    this.knownRunTopics = new Set();
    this.listeners = new Set();
    this.runToastListeners = new Set();

    this._sockets = new Map(); // brokerUrl -> { ws, ready, pingTimer, reconnectTimer }
    this._eventSource = null;
    this._pollTimer = null;
    this._heartbeatTimer = null;
    this._heartbeatCount = 0;
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
    this.finishedRunIds.clear();
    this.finishedAfterByClient.clear();
    this.finishedAfterByPlayer.clear();
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

    // Respaldo HTTPS periódico ligero (puerto 443) cada 10s por si la red bloquea WebSockets o corta SSE
    if (typeof setInterval !== 'undefined' && this.fetchImpl && !this._pollTimer) {
      this._pollTimer = setInterval(() => {
        if (!this._stopped) {
          this.fetchHistory('45s', { isRealtime: true });
        }
      }, 10000);
    }
  }

  stop() {
    this._stopped = true;
    this._stopHeartbeatTimer();
    this._closeAllSockets();
    this._closeHttpStream();
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
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

  _closeHttpStream() {
    if (this._eventSource) {
      try {
        this._eventSource.close();
      } catch {
        // Ignorar
      }
      this._eventSource = null;
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
        // Ignorar
      }
    }
  }

  reconnect() {
    this._closeAllSockets();
    this._closeHttpStream();
    this.connectionState = 'connecting';
    this.notify();

    let anyTransport = false;

    if (this.WebSocketImpl) {
      anyTransport = true;
      for (const brokerUrl of this.brokerUrls) {
        this._connectMqttBroker(brokerUrl);
      }
    }

    if (this.EventSourceImpl) {
      anyTransport = true;
      this._connectHttpStream();
    }

    if (this.fetchImpl) {
      anyTransport = true;
      this.fetchHistory('2h', { isRealtime: false });
    }

    if (!anyTransport) {
      this.connectionState = 'local';
      this.notify();
    }
  }

  async forceSyncNow() {
    await this.publishRoomSnapshot();
    if (this.fetchImpl) {
      await this.fetchHistory('2h', { isRealtime: true });
    }
    this.notify();
  }

  _connectHttpStream() {
    if (this._stopped || !this.EventSourceImpl) return;
    const topic = buildTopicForRoom(this.roomCode);
    try {
      const es = new this.EventSourceImpl(`${NTFY_BASE_URL}/${topic}/sse?since=2h`);
      this._eventSource = es;
      es.onopen = () => {
        this.connectionState = 'live';
        this.notify();
      };
      es.onmessage = (ev) => {
        if (ev?.data) {
          this._handleNtfyEnvelope(ev.data, { isRealtime: true });
        }
      };
      es.onerror = () => {
        // EventSource reintenta automáticamente; el poll HTTPS y MQTT cubren el resto
      };
    } catch {
      // Ignorar si EventSource no está disponible
    }
  }

  async fetchHistory(since = '2h', { isRealtime = false } = {}) {
    if (!this.fetchImpl) return;
    const topic = buildTopicForRoom(this.roomCode);
    try {
      const res = await this.fetchImpl(`${NTFY_BASE_URL}/${topic}/json?poll=1&since=${encodeURIComponent(since)}`);
      if (!res || !res.ok) return;
      this.connectionState = 'live';
      const text = await res.text();
      if (!text) return;
      const lines = text.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines) {
        this._handleNtfyEnvelope(line, { isRealtime });
      }
      this.notify();
    } catch {
      const anyWsReady = Array.from(this._sockets.values()).some((s) => s.ready);
      if (!anyWsReady && this.connectionState === 'connecting') {
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
      // Si el sobre de ntfy fue emitido hace menos de 18 segundos, tratarlo como evento en vivo
      const envAgeMs = env.time ? Date.now() - env.time * 1000 : 0;
      const effectiveRealtime = isRealtime || (env.time && envAgeMs < 18000);
      this.ingestPayload(payload, { isRealtime: Boolean(effectiveRealtime) });
    } catch {
      // Ignorar líneas que no sean JSON válido
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
            // Suscribirse a todos los sub-tópicos de la sala (incluye mensajes retenidos de jugadores activos, partidas y reset)
            const subFilter = `${this._roomTopicPrefix()}/#`;
            ws.send(buildMqttSubscribePacket(1, subFilter));

            // Keep-alive PINGREQ cada 25 segundos
            if (entry.pingTimer) clearInterval(entry.pingTimer);
            entry.pingTimer = setInterval(() => {
              if (ws.readyState === 1) {
                ws.send(new Uint8Array([0xc0, 0x00]));
              }
            }, 25000);

            // Auto-sincronizar partida en curso (si está jugando ahora mismo) y partidas locales guardadas
            this._syncLocalRecordsToBroker(ws);
            this.notify();
          } else if (pkt.type === 'publish') {
            if (pkt.topic.includes('/run/') || pkt.topic.includes('/live/')) {
              this.knownRunTopics.add(pkt.topic);
            }
            if (!pkt.payloadText) {
              // Mensaje retenido vacío sobre /live/<clientId> significa que ese jugador terminó/salió de la arena
              if (pkt.topic.includes('/live/')) {
                const parts = pkt.topic.split('/live/');
                const clearedClient = parts[1];
                if (clearedClient && this.activePlayers.has(clearedClient)) {
                  this.activePlayers.delete(clearedClient);
                  this.notify();
                }
              }
              continue;
            }
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
      if (!anyReady && !this._eventSource && !this._stopped) {
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

    // 1. Si este jugador está en mitad de una partida ahora mismo, publicar su presencia activa retenida inmediatamente
    if (this.myActiveRun && Date.now() - this.myActiveRun.startedAt < ACTIVE_RUN_TTL_MS) {
      const liveTopic = `${prefix}/live/${this.clientId}`;
      this.knownRunTopics.add(liveTopic);
      try {
        ws.send(buildMqttPublishPacket(liveTopic, JSON.stringify(this.myActiveRun), { retain: true }));
      } catch {
        // Ignorar
      }
    }

    // 2. Publicar las últimas 25 partidas guardadas en este móvil/navegador con retain: true
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
    if (subTopic.startsWith('run/') || subTopic.startsWith('live/')) {
      this.knownRunTopics.add(fullTopic);
    }
    const payloadData =
      payloadObj instanceof Uint8Array
        ? payloadObj
        : payloadObj === null
          ? new Uint8Array(0)
          : JSON.stringify(payloadObj);
    const packet = buildMqttPublishPacket(fullTopic, payloadData, { retain });
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
        this.finishedRunIds.clear();
        this.finishedAfterByClient.clear();
        this.finishedAfterByPlayer.clear();
        this.liveEvents = [];
        this.processedEventIds.clear();
        this.notify();
        return true;
      }
      return false;
    }

    if (payload.type === 'run_cancel') {
      const key = payload.clientId || normalizeInitials(payload.initials);
      if (payload.runId) this.finishedRunIds.add(payload.runId);
      if (key && this.activePlayers.has(key)) {
        this.activePlayers.delete(key);
        this.notify();
        return true;
      }
      return false;
    }

    // Para run_start y latidos en vivo (heartbeats), permitir actualizaciones de progreso del mismo jugador
    if (payload.type === 'run_start') {
      if (payload.runId && this.finishedRunIds.has(payload.runId)) {
        return false;
      }

      const rawStartedAt = Number(payload.startedAt) || Date.now();
      const normInit = normalizeInitials(payload.initials);
      const key = payload.clientId || normInit;

      // Si ya recibimos un run_finish de este jugador posterior al inicio de esta partida, ignorar run_start antiguo
      const finishedClientAt = this.finishedAfterByClient.get(key) || 0;
      const finishedPlayerAt = this.finishedAfterByPlayer.get(normInit) || 0;
      if (rawStartedAt <= Math.max(finishedClientAt, finishedPlayerAt)) {
        return false;
      }

      // Solo filtrar por resetAtIso o TTL estricto cuando es un mensaje histórico retenido, no cuando llega en vivo
      if (!isRealtime) {
        if (this.resetAtIso && rawStartedAt < new Date(this.resetAtIso).getTime() - 15000) {
          return false;
        }
        if (Date.now() - rawStartedAt > ACTIVE_RUN_TTL_MS) {
          return false;
        }
      }

      const hasExplicitElapsed = payload.elapsedSeconds !== undefined && payload.elapsedSeconds !== null;
      const elapsedSeconds = Math.max(0, Number(payload.elapsedSeconds) || 0);
      if (elapsedSeconds >= 125) {
        return false;
      }

      // Anclar al reloj local del Dashboard si llega con elapsedSeconds o si hay desfase de reloj entre móvil y PC
      const clockSkewMs = Math.abs(Date.now() - rawStartedAt);
      const effectiveStartedAt =
        hasExplicitElapsed || (isRealtime && clockSkewMs > 5000)
          ? Date.now() - elapsedSeconds * 1000
          : rawStartedAt;

      const existing = this.activePlayers.get(key);
      const isNewOrChanged =
        !existing ||
        existing.initials !== normInit ||
        existing.avatar !== (payload.avatar || 'penitente') ||
        existing.runId !== (payload.runId || null);

      this.activePlayers.set(key, {
        clientId: key,
        runId: payload.runId || existing?.runId || null,
        initials: normInit,
        avatar: payload.avatar || 'penitente',
        mode: payload.mode || 'unified',
        startedAt: effectiveStartedAt,
        rawStartedAt,
        lastSeenAt: Date.now(),
        elapsedSeconds: hasExplicitElapsed ? elapsedSeconds : existing?.elapsedSeconds || 0,
        kills: payload.kills !== undefined ? Number(payload.kills) : existing?.kills || 0,
        stress: payload.stress !== undefined ? Number(payload.stress) : existing?.stress || 0
      });

      if (isNewOrChanged) {
        this.notify();
      }
      return true;
    }

    const eventKey = payload.eventId || (payload.record && payload.record.id) || null;
    if (eventKey && this.processedEventIds.has(eventKey)) {
      return false;
    }
    if (eventKey) {
      this.processedEventIds.add(eventKey);
    }

    if (payload.type === 'run_finish' && payload.record) {
      const rec = payload.record;
      const playedTime = new Date(rec.playedAt || Date.now()).getTime();
      if (!isRealtime && this.resetAtIso && playedTime < new Date(this.resetAtIso).getTime() - 15000) {
        return false;
      }

      const normInit = normalizeInitials(rec.initials);
      if (payload.runId) this.finishedRunIds.add(payload.runId);
      const finishStamp = Math.max(playedTime, Number(payload.startedAt) || 0, Date.now());
      if (payload.clientId) {
        this.finishedAfterByClient.set(payload.clientId, finishStamp);
        this.activePlayers.delete(payload.clientId);
      }
      this.finishedAfterByPlayer.set(normInit, finishStamp);
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
        ? payload.records.filter((r) => new Date(r.playedAt || 0).getTime() >= new Date(this.resetAtIso).getTime() - 15000)
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
      mode: rec.mode || 'unified',
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

  _startHeartbeatTimer() {
    this._stopHeartbeatTimer();
    this._heartbeatCount = 0;
    if (typeof setInterval === 'undefined') return;

    this._heartbeatTimer = setInterval(() => {
      if (!this.myActiveRun || this._stopped) {
        this._stopHeartbeatTimer();
        return;
      }
      if (Date.now() - this.myActiveRun.startedAt > ACTIVE_RUN_TTL_MS) {
        this._stopHeartbeatTimer();
        return;
      }
      this._heartbeatCount++;
      const fallbackElapsed = Math.min(120, Math.max(0, (Date.now() - this.myActiveRun.startedAt) / 1000));
      const payload = {
        ...this.myActiveRun,
        eventId: `hb_${this.clientId}_${Date.now()}`,
        elapsedSeconds:
          this.myActiveRun.elapsedSeconds > 0
            ? Number(this.myActiveRun.elapsedSeconds.toFixed(1))
            : Number(fallbackElapsed.toFixed(1))
      };
      this.myActiveRun = payload;
      this._broadcastLocal(payload);
      this._publishMqtt(`live/${this.clientId}`, payload, { retain: true });
      // Publicar en HTTPS puerto 443 en el primer latido (4s) y luego cada 8s para máxima visibilidad sin saturar ntfy
      if (this._heartbeatCount === 1 || this._heartbeatCount % 2 === 0) {
        this._postToCloudFallback(payload);
      }
    }, 4000);
  }

  _stopHeartbeatTimer() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  updateRunProgress({ elapsedSeconds, kills, stress }) {
    if (!this.myActiveRun) return;
    if (typeof elapsedSeconds === 'number' && !Number.isNaN(elapsedSeconds)) {
      this.myActiveRun.elapsedSeconds = Number(elapsedSeconds.toFixed(1));
    }
    if (typeof kills === 'number' && !Number.isNaN(kills)) {
      this.myActiveRun.kills = kills;
    }
    if (typeof stress === 'number' && !Number.isNaN(stress)) {
      this.myActiveRun.stress = Math.round(stress);
    }
    const existing = this.activePlayers.get(this.clientId);
    if (existing) {
      existing.elapsedSeconds = this.myActiveRun.elapsedSeconds;
      existing.kills = this.myActiveRun.kills;
      existing.stress = this.myActiveRun.stress;
      existing.startedAt = Date.now() - this.myActiveRun.elapsedSeconds * 1000;
    }
  }

  async publishRunStart({ initials, avatar, mode }) {
    const now = Date.now();
    const runId = `run_${this.clientId}_${now}`;
    const payload = {
      v: 1,
      eventId: `start_${this.clientId}_${now}`,
      runId,
      type: 'run_start',
      room: this.roomCode,
      clientId: this.clientId,
      initials: normalizeInitials(initials),
      avatar: avatar || 'penitente',
      mode: mode || 'unified',
      startedAt: now,
      elapsedSeconds: 0,
      kills: 0,
      stress: 18
    };
    this.myActiveRun = payload;
    this.ingestPayload(payload, { isRealtime: true });
    this._broadcastLocal(payload);
    // Publicar con retain: true para que cualquier Dashboard que se conecte o refresque vea al jugador en la arena
    this._publishMqtt(`live/${this.clientId}`, payload, { retain: true });
    this._publishMqtt('events', payload, { retain: false });
    this._startHeartbeatTimer();
    await this._postToCloudFallback(payload);
  }

  async publishRunFinish(record) {
    const finishedRunId = this.myActiveRun?.runId || null;
    const finishedStartedAt = this.myActiveRun?.startedAt || Date.now();
    this._stopHeartbeatTimer();
    this.myActiveRun = null;
    this.activePlayers.delete(this.clientId);
    if (finishedRunId) this.finishedRunIds.add(finishedRunId);
    this.finishedAfterByClient.set(this.clientId, Date.now());
    this.finishedAfterByPlayer.set(normalizeInitials(record.initials), Date.now());
    this._pushLiveEvent(record);

    // Limpiar el mensaje retenido de presencia activa en la arena
    this._publishMqtt(`live/${this.clientId}`, null, { retain: true });

    const payload = {
      v: 1,
      eventId: `finish_${record.id}`,
      runId: finishedRunId,
      startedAt: finishedStartedAt,
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
    this._stopHeartbeatTimer();
    this.myActiveRun = null;
    this.store.clearAll();
    this.activePlayers.clear();
    this.finishedRunIds.clear();
    this.finishedAfterByClient.clear();
    this.finishedAfterByPlayer.clear();
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

    // Limpiar mensajes retenidos conocidos de partidas anteriores y jugadores activos
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
    if (this.store.records.length > 0) {
      const payload = {
        v: 1,
        eventId: `snap_${this.clientId}_${Date.now()}`,
        type: 'room_snapshot',
        room: this.roomCode,
        clientId: this.clientId,
        records: this.store.records.slice(0, 40)
      };
      this._broadcastLocal(payload);
      await this._postToCloudFallback(payload);
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
      // Ignorar si ntfy está bloqueado o con límite; MQTT WSS ya se encarga
    }
    return false;
  }
}
