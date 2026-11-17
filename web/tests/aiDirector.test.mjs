// Pruebas unitarias exactas para paridad 1:1 de los 3 motores de IA, estrés, avatares y telemetría

import test from 'node:test';
import assert from 'node:assert/strict';

import { GAME_MODES, PLAYER_AVATARS, stressTierFromIndex } from '../src/engine/constants.js';
import {
  Adaptive2026Director,
  Classic1985Engine,
  HybridMixDirector,
  StressMetricsTracker,
  createWaveDirector
} from '../src/engine/aiDirector.js';
import { TelemetryStore, normalizeInitials } from '../src/engine/telemetryStore.js';
import { renderAvatarSVG } from '../src/scene/avatarSVGs.js';

test('Catálogo completo de 3 modos y 12 avatares con SVG válido', () => {
  assert.equal(GAME_MODES.length, 3);
  assert.deepEqual(
    GAME_MODES.map((m) => m.id),
    ['classic1985', 'director2026', 'hybrid1985x2026']
  );

  assert.equal(PLAYER_AVATARS.length, 12);
  for (const av of PLAYER_AVATARS) {
    const svg = renderAvatarSVG(av.id, 40, true);
    assert.ok(svg.startsWith('<svg '), `SVG inválido para ${av.id}`);
    assert.ok(svg.includes('</svg>'));
  }
});

test('StressMetricsTracker reacciona al peligro, trauma, giros bruscos y mantiene promedio acotado', () => {
  const tracker = new StressMetricsTracker();
  assert.equal(tracker.currentStress, 18.0);

  // Peligro intenso + daño + cambio brusco de dirección
  for (let i = 0; i < 20; i++) {
    tracker.update({
      dt: 0.05,
      moveVector: { dx: i % 2 === 0 ? 1 : -1, dy: 0 },
      playerHPNormalized: 0.25,
      nearestEnemyDistance: 25,
      enemiesInsideDangerRing: 5,
      enemiesInsidePanicRing: 3,
      justTookDamage: i === 2
    });
  }

  assert.ok(tracker.currentStress > 75, `Estrés esperado > 75, obtenido ${tracker.currentStress}`);
  assert.ok(tracker.peakStress >= tracker.currentStress);
  assert.ok(tracker.averageStress > 0 && tracker.averageStress <= 100);
  assert.ok(stressTierFromIndex(tracker.currentStress).rawValue >= 2);

  // Calma prolongada reduce gradualmente el estrés hacia la zona baja
  for (let i = 0; i < 80; i++) {
    tracker.update({
      dt: 0.05,
      moveVector: { dx: 0.5, dy: 0.5 },
      playerHPNormalized: 1.0,
      nearestEnemyDistance: 500,
      enemiesInsideDangerRing: 0,
      enemiesInsidePanicRing: 0,
      justTookDamage: false
    });
  }

  assert.ok(tracker.currentStress < 35, `El estrés debería bajar a BAJO (<35), obtenido ${tracker.currentStress}`);
});

test('Invariante monotónico: ninguno de los 3 motores reduce dificultad aunque suba el estrés al máximo', () => {
  for (const modeId of ['classic1985', 'director2026', 'hybrid1985x2026']) {
    const director = createWaveDirector(modeId);

    let prevInterval = Infinity;
    let prevMaxEnemies = 0;
    let prevSpeed = 0;

    for (let step = 0; step <= 600; step++) {
      const t = step * 0.1;
      // Simulamos transición brusca: baja tensión al inicio, estrés crítico en el medio y calma al final
      const stress = t >= 15 && t <= 38 ? 94 : t >= 45 ? 15 : 50;
      const hp = t >= 18 && t <= 30 ? 0.22 : 0.90;

      const d = director.evaluate({
        dt: 0.1,
        elapsedTime: t,
        stressIndex: stress,
        stressTier: stressTierFromIndex(stress),
        playerHPNormalized: hp,
        playerVelocity: { dx: 180, dy: 0 },
        activeEnemyCount: 25,
        activeMedkitCount: 1
      });

      assert.ok(
        d.spawnInterval <= prevInterval + 1e-9,
        `[${modeId}] spawnInterval subió en t=${t.toFixed(1)}s: ${d.spawnInterval} > ${prevInterval}`
      );
      assert.ok(
        d.maxActiveEnemies >= prevMaxEnemies,
        `[${modeId}] maxActiveEnemies bajó en t=${t.toFixed(1)}s: ${d.maxActiveEnemies} < ${prevMaxEnemies}`
      );
      assert.ok(
        d.enemySpeedMultiplier >= prevSpeed - 1e-9,
        `[${modeId}] enemySpeedMultiplier bajó en t=${t.toFixed(1)}s: ${d.enemySpeedMultiplier} < ${prevSpeed}`
      );

      prevInterval = d.spawnInterval;
      prevMaxEnemies = d.maxActiveEnemies;
      prevSpeed = d.enemySpeedMultiplier;
    }
  }
});

test('Comportamiento específico: 1985 botiquín fijo, 2026 corredor de escape, Híbrido ráfagas de reloj', () => {
  const engine85 = new Classic1985Engine();
  let fixedDrops = 0;
  for (let step = 0; step <= 600; step++) {
    const t = step * 0.1;
    const d = engine85.evaluate({
      dt: 0.1,
      elapsedTime: t,
      stressIndex: 95,
      stressTier: stressTierFromIndex(95),
      playerHPNormalized: 0.15,
      playerVelocity: { dx: 120, dy: 50 },
      activeEnemyCount: 20,
      activeMedkitCount: 0
    });
    assert.equal(d.safeEscapeCenterAngle, null);
    assert.equal(d.suppressSimultaneousLunges, false);
    if (d.spawnEmergencyMedkit) fixedDrops += 1;
  }
  assert.equal(fixedDrops, 6); // 9s, 18s, 27s, 36s, 45s, 54s

  const dir26 = new Adaptive2026Director();
  let crisisDrops = 0;
  let crisisDirective = null;
  for (let i = 0; i < 15; i++) {
    crisisDirective = dir26.evaluate({
      dt: 0.1,
      elapsedTime: 22 + i * 0.1,
      stressIndex: 92,
      stressTier: stressTierFromIndex(92),
      playerHPNormalized: 0.25,
      playerVelocity: { dx: 200, dy: 0 },
      activeEnemyCount: 30,
      activeMedkitCount: 0
    });
    if (crisisDirective.spawnEmergencyMedkit) crisisDrops += 1;
  }
  assert.notEqual(crisisDirective.safeEscapeCenterAngle, null);
  assert.equal(crisisDirective.suppressSimultaneousLunges, true);
  assert.equal(crisisDrops, 1);

  const dirHyb = new HybridMixDirector();
  const surgeDirective = dirHyb.evaluate({
    dt: 0.1,
    elapsedTime: 15.0,
    stressIndex: 82,
    stressTier: stressTierFromIndex(82),
    playerHPNormalized: 0.70,
    playerVelocity: { dx: 150, dy: 0 },
    activeEnemyCount: 35,
    activeMedkitCount: 1
  });
  assert.ok(surgeDirective.microMessage.includes('RÁFAGA FIJA 1985'));
  assert.equal(surgeDirective.isInterventionActive, true);
});

test('TelemetryStore: medias exactas, ránking por 6 criterios, perfiles y fusión JSON sin duplicados', () => {
  class MemoryStorage {
    constructor() { this.map = new Map(); }
    getItem(k) { return this.map.get(k) ?? null; }
    setItem(k, v) { this.map.set(k, v); }
    removeItem(k) { this.map.delete(k); }
  }

  assert.equal(normalizeInitials('vlf'), 'VLF');
  assert.equal(normalizeInitials(' a '), 'AAA');
  assert.equal(normalizeInitials(''), '---');

  const store = new TelemetryStore(new MemoryStorage());
  store.recordRun({
    id: 'run-1',
    initials: 'VLF',
    avatar: 'serafin',
    mode: 'director2026',
    survivedSeconds: 60,
    didSurvive: true,
    kills: 40,
    averageStress: 55,
    peakStress: 88,
    medkitsCollected: 3,
    playedAt: '2026-11-17T10:00:00Z'
  });
  store.recordRun({
    id: 'run-2',
    initials: 'ana',
    avatar: 'cuervo',
    mode: 'classic1985',
    survivedSeconds: 30,
    didSurvive: false,
    kills: 15,
    averageStress: 78,
    peakStress: 96,
    medkitsCollected: 1,
    playedAt: '2026-11-17T10:02:00Z'
  });

  const vlf = store.profile('VLF');
  assert.ok(vlf);
  assert.equal(vlf.favoriteAvatar, 'serafin');
  // 60*10 + 40*12 + 100*2.5 = 600 + 480 + 250 = 1330
  assert.equal(Math.round(vlf.rankingScore), 1330);
  assert.equal(store.globalRank('VLF'), 1);
  assert.equal(store.globalRank('ANA'), 2);

  const byStress = store.playerProfiles({ sortBy: 'avgStress' });
  assert.equal(byStress[0].initials, 'ANA');

  const exported = store.exportJSON();
  const secondStore = new TelemetryStore(new MemoryStorage());
  secondStore.recordRun({
    id: 'run-2', // duplicado intencionado
    initials: 'ANA',
    avatar: 'cuervo',
    mode: 'classic1985',
    survivedSeconds: 30,
    didSurvive: false,
    kills: 15,
    averageStress: 78,
    peakStress: 96,
    medkitsCollected: 1,
    playedAt: '2026-11-17T10:02:00Z'
  });

  const added = secondStore.importAndMergeJSON(exported);
  assert.equal(added, 1);
  assert.equal(secondStore.records.length, 2);
});
