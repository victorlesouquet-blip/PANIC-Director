import test from 'node:test';
import assert from 'node:assert/strict';

import { generateQrMatrix, renderQrCodeSvg } from '../src/engine/qrCodeSvg.js';
import {
  LiveClassroomSync,
  normalizeRoomCode,
  buildTopicForRoom,
  getPublicGameUrl,
  buildMqttConnectPacket,
  buildMqttSubscribePacket,
  buildMqttPublishPacket,
  parseMqttPackets
} from '../src/engine/liveSync.js';
import { TelemetryStore } from '../src/engine/telemetryStore.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k)
  };
}

test('QR Code SVG generator produce matriz cuadrada válida con patrones de búsqueda ISO 18004', () => {
  const url = 'https://victorlesouquet-blip.github.io/PANIC-Director/?room=CLASE';
  const matrix = generateQrMatrix(url);
  assert.ok(Array.isArray(matrix));
  assert.ok(matrix.length >= 21 && matrix.length <= 57);
  assert.equal(matrix.length, matrix[0].length);

  // Esquinas de los 3 buscadores (7x7) deben tener borde oscuro
  const n = matrix.length;
  for (let i = 0; i < 7; i++) {
    assert.equal(matrix[0][i], true);
    assert.equal(matrix[6][i], true);
    assert.equal(matrix[0][n - 7 + i], true);
    assert.equal(matrix[n - 7][i], true);
  }
  assert.equal(matrix[3][3], true);

  const svg = renderQrCodeSvg(url, { sizePx: 220 });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('<path d="M'));
});

test('Codificador y decodificador binario MQTT 3.1.1 sobre WebSockets', () => {
  const conn = buildMqttConnectPacket('pd_test_client');
  assert.equal(conn[0], 0x10);

  const sub = buildMqttSubscribePacket(1, 'panic_director_live_v3_clase/#');
  assert.equal(sub[0], 0x82);

  const samplePayload = JSON.stringify({ type: 'run_finish', room: 'CLASE', record: { id: 'r1', initials: 'VLF' } });
  const pubRetained = buildMqttPublishPacket('panic_director_live_v3_clase/run/r1', samplePayload, { retain: true });
  assert.equal(pubRetained[0], 0x31);

  const decoded = parseMqttPackets(pubRetained);
  assert.equal(decoded.length, 1);
  assert.equal(decoded[0].type, 'publish');
  assert.equal(decoded[0].retain, true);
  assert.equal(decoded[0].topic, 'panic_director_live_v3_clase/run/r1');
  assert.equal(decoded[0].payloadText, samplePayload);
});

test('LiveClassroomSync sincroniza en tiempo real run_start, run_finish y room_reset sin duplicados', async () => {
  const memStorage = createMemoryStorage();
  const store = new TelemetryStore(memStorage);
  const postedPayloads = [];

  const mockFetch = async (_url, opts) => {
    if (opts?.method === 'POST') {
      postedPayloads.push(JSON.parse(opts.body));
      return { ok: true, text: async () => '{}' };
    }
    return { ok: true, text: async () => '' };
  };

  const sync = new LiveClassroomSync(store, {
    initialRoom: 'aula-2026',
    storage: memStorage,
    fetchImpl: mockFetch,
    WebSocketImpl: null
  });

  assert.equal(sync.roomCode, 'AULA-2026');
  assert.equal(normalizeRoomCode('  clase #1 '), 'CLASE1');
  assert.ok(buildTopicForRoom('CLASE').includes('panic_director_live_v3_clase'));
  assert.ok(getPublicGameUrl('CLASE').includes('room=CLASE'));

  // 1. Alumno inicia partida en su móvil
  sync.ingestPayload(
    {
      v: 1,
      eventId: 'ev_start_1',
      type: 'run_start',
      room: 'AULA-2026',
      clientId: 'phone_1',
      initials: 'mar',
      avatar: 'serafin',
      mode: 'director2026',
      startedAt: Date.now()
    },
    { isRealtime: true }
  );

  assert.equal(sync.getState().activePlayers.length, 1);
  assert.equal(sync.getState().activePlayers[0].initials, 'MAR');

  // 2. Alumno termina partida y llega en tiempo real al Dashboard
  let toastReceived = null;
  sync.onRealtimeRun((rec) => {
    toastReceived = rec;
  });

  const finishedRecord = {
    id: 'run_mar_001',
    initials: 'MAR',
    avatar: 'serafin',
    mode: 'director2026',
    survivedSeconds: 60,
    didSurvive: true,
    kills: 41,
    averageStress: 66,
    peakStress: 84,
    medkitsCollected: 2,
    playedAt: new Date().toISOString()
  };

  const added = sync.ingestPayload(
    {
      v: 1,
      eventId: 'ev_finish_1',
      type: 'run_finish',
      room: 'AULA-2026',
      clientId: 'phone_1',
      record: finishedRecord
    },
    { isRealtime: true }
  );

  assert.equal(added, true);
  assert.equal(sync.getState().activePlayers.length, 0);
  assert.equal(store.records.length, 1);
  assert.equal(store.records[0].initials, 'MAR');
  assert.ok(toastReceived);
  assert.equal(toastReceived.kills, 41);

  // Duplicado no se vuelve a insertar
  const dup = sync.ingestPayload(
    {
      v: 1,
      eventId: 'ev_finish_1',
      type: 'run_finish',
      room: 'AULA-2026',
      clientId: 'phone_1',
      record: finishedRecord
    },
    { isRealtime: true }
  );
  assert.equal(dup, false);
  assert.equal(store.records.length, 1);

  // 3. Reiniciar sala limpia marcador y descarta partidas previas al reset
  await sync.publishRoomReset();
  assert.equal(store.records.length, 0);
  assert.equal(postedPayloads.at(-1).type, 'room_reset');
});
