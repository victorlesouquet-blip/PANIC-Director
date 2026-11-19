import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createWaveDirector, StressMetricsTracker } from '../src/engine/aiDirector.js';

test('InstancedArenaPools y SharedThreeAssets inicializan todas las propiedades y mallas usadas', () => {
  const meshesPath = fileURLToPath(new URL('../src/scene/meshes3d.js', import.meta.url));
  const meshesSrc = readFileSync(meshesPath, 'utf8');

  const sharedSrc = meshesSrc.slice(0, meshesSrc.indexOf('export class PlayerXPBar3D'));
  const assetRefs = new Set([...meshesSrc.matchAll(/\bassets\.([a-zA-Z0-9_]+)/g)].map((m) => m[1]));
  const sharedDefs = new Set([
    ...[...sharedSrc.matchAll(/\bthis\.([a-zA-Z0-9_]+)\s*=/g)].map((m) => m[1]),
    ...[...sharedSrc.matchAll(/^\s*([a-zA-Z0-9_]+)\s*\(/gm)].map((m) => m[1])
  ]);
  const missingAssets = [...assetRefs].filter((a) => !sharedDefs.has(a));
  assert.deepEqual(missingAssets, [], `Propiedades faltantes en SharedThreeAssets: ${missingAssets.join(', ')}`);

  const poolSrc = meshesSrc.slice(meshesSrc.indexOf('export class InstancedArenaPools'));
  const ctorSrc = poolSrc.slice(0, poolSrc.indexOf('\n  #makeInstanced'));
  const resetSrc = poolSrc.slice(poolSrc.indexOf('resetFrameCounts()'), poolSrc.indexOf('\n  addGlow('));
  const usedProps = new Set([...poolSrc.matchAll(/\bthis\.([a-zA-Z0-9_]+)/g)].map((m) => m[1]));
  const assignedProps = new Set([
    ...[...ctorSrc.matchAll(/\bthis\.([a-zA-Z0-9_]+)\s*=/g)].map((m) => m[1]),
    ...[...resetSrc.matchAll(/\bthis\.([a-zA-Z0-9_]+)\s*=/g)].map((m) => m[1])
  ]);
  const missingPoolProps = [...usedProps].filter(
    (p) => !assignedProps.has(p) && !['resetFrameCounts', 'addGlow', 'addRing'].includes(p)
  );
  assert.deepEqual(
    missingPoolProps,
    [],
    `Propiedades no inicializadas en InstancedArenaPools: ${missingPoolProps.join(', ')}`
  );
});

test('PanicArena3D tiene definidos todos sus métodos privados y propiedades de instancia', () => {
  const arenaPath = fileURLToPath(new URL('../src/scene/PanicArena3D.js', import.meta.url));
  const arenaSrc = readFileSync(arenaPath, 'utf8');

  const privateCalls = new Set([...arenaSrc.matchAll(/\bthis\.(#[a-zA-Z0-9_]+)\s*\(/g)].map((m) => m[1]));
  const privateDefs = new Set([...arenaSrc.matchAll(/^\s*(#[a-zA-Z0-9_]+)\s*\(/gm)].map((m) => m[1]));
  const missingMethods = [...privateCalls].filter((m) => !privateDefs.has(m));
  assert.deepEqual(missingMethods, [], `Métodos privados inexistentes: ${missingMethods.join(', ')}`);

  const propRefs = new Set([...arenaSrc.matchAll(/\bthis\.([a-zA-Z0-9_]+)(?![\w?]*\()/g)].map((m) => m[1]));
  const propDefs = new Set([
    ...[...arenaSrc.matchAll(/\bthis\.([a-zA-Z0-9_]+)\s*=/g)].map((m) => m[1]),
    ...[...arenaSrc.matchAll(/^\s*([a-zA-Z0-9_]+)\s*\(/gm)].map((m) => m[1])
  ]);
  const missingProps = [...propRefs].filter((p) => !propDefs.has(p));
  assert.deepEqual(missingProps, [], `Propiedades sin asignar en PanicArena3D: ${missingProps.join(', ')}`);
});

test('UnifiedProgressiveDirector simula 120s completos sin errores en las 3 fases', () => {
  const tracker = new StressMetricsTracker();
  const director = createWaveDirector('unified');
  for (let sec = 0; sec <= 120; sec += 2) {
    const stress = tracker.update({
      dt: 0.1,
      moveVector: { dx: 1, dy: 0 },
      playerHPNormalized: 0.85,
      nearestEnemyDistance: sec % 6 === 0 ? 70 : 180,
      enemiesInsideDangerRing: sec % 6 === 0 ? 2 : 0,
      enemiesInsidePanicRing: 0,
      justTookDamage: false
    });
    const d = director.evaluate({
      dt: 0.1,
      elapsedTime: sec,
      stressIndex: stress,
      playerHPNormalized: 0.85,
      playerVelocity: { dx: 150, dy: 0 },
      activeEnemyCount: 12,
      activeMedkitCount: 0
    });
    assert.ok(Number.isFinite(d.spawnInterval) && d.spawnInterval > 0);
    assert.ok(Number.isFinite(d.maxActiveEnemies) && d.maxActiveEnemies >= 8);
    assert.ok(Number.isFinite(d.enemySpeedMultiplier) && d.enemySpeedMultiplier > 0);
  }
});

test('InstancedArenaPools ejecuta constructor, los 14 proyectiles, bestiario, constructos y commit() con Three.js', async (t) => {
  let THREE;
  try {
    THREE = await import('three');
  } catch {
    t.skip('three no instalado en este entorno local (se verifica automáticamente en CI)');
    return;
  }

  const prevDocument = globalThis.document;
  const fakeCtx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    fillRect() {},
    clearRect() {},
    beginPath() {},
    roundRect() {},
    fill() {},
    stroke() {},
    fillText() {},
    createRadialGradient() {
      return { addColorStop() {} };
    }
  };
  globalThis.document = {
    createElement() {
      return {
        width: 128,
        height: 128,
        getContext() {
          return fakeCtx;
        }
      };
    }
  };

  try {
    const { SharedThreeAssets, InstancedArenaPools } = await import('../src/scene/meshes3d.js');
    const assets = new SharedThreeAssets();
    const worldGroup = new THREE.Group();
    const pools = new InstancedArenaPools(worldGroup, assets);

    assert.ok(pools.projStoneMesh, 'projStoneMesh debe existir');
    assert.ok(pools.projSphereMesh, 'projSphereMesh debe existir');

    pools.resetFrameCounts();
    const dummyEnemy = {
      pos: { x: 10, y: 20 },
      facingAngle: 0.5,
      age: 1.2,
      flashTimer: 0,
      renderScale: 1,
      attachedRibs: 4,
      ribSpinAngle: 0.3,
      haloSpin: 0.2,
      telegraphActive: false,
      telegraphDist: 80,
      isPouncing: false,
      isFrenzied: false,
      spitPulse: 0,
      isIgniting: false,
      isSpitTelegraphing: false
    };

    pools.addDesollado(dummyEnemy);
    pools.addJaula(dummyEnemy);
    pools.addMartir(dummyEnemy);
    pools.addIncensario(dummyEnemy);
    pools.addTejedor(dummyEnemy);
    pools.addColosoMenor(dummyEnemy);
    pools.addSombra(dummyEnemy);
    pools.addOphan(dummyEnemy);
    pools.addFlagelante(dummyEnemy);
    pools.addEclipseHerald(dummyEnemy);

    for (const cKind of ['seraph_mirage', 'abyss_obelisk', 'forge_totem', 'relic_sentinel']) {
      pools.addBossConstruct({ kind: cKind, x: 15, y: -15, age: 0.5, facingAngle: 1.0 });
    }

    const kinds = [
      'fireball',
      'stone',
      'arrow',
      'dagger',
      'flail_orb',
      'solar_bolt',
      'pyro_singularity',
      'anvil_prism',
      'astral_helix',
      'seraph_eye',
      'void_hourglass',
      'abyss_sigil',
      'chronos_crown',
      'eclipse_star',
      'unknown_fallback'
    ];
    for (const kind of kinds) {
      pools.addEnemyProjectile({ x: 5, y: -5, angle: 0.7, kind, age: 0.4, scale: 1.1 });
    }

    pools.commit();
    pools.dispose();
    assets.dispose();
  } finally {
    globalThis.document = prevDocument;
  }
});
