// Arena 3D completa en Three.js replicando exactamente PanicGameScene.swift (simulación 2D lógica -> mundo 3D Y-up)
// Optimizada con InstancedMesh, pools sin GC, DPR adaptativo y compilación anticipada de shaders.

import * as THREE from 'three';
import {
  CAMPAIGN_PHASES,
  GAME_MODE_MAP,
  LEVEL_UPGRADES,
  LEVEL_UPGRADE_MAP,
  PHASE_TRANSITION_DURATION,
  PLAYER_AVATAR_MAP,
  RELICARIO_PALETTE,
  stressTierFromIndex,
  TOTAL_RUN_DURATION,
  UPGRADE_RARITIES,
  UPGRADE_RARITY_MAP
} from '../engine/constants.js';
import { createWaveDirector, StressMetricsTracker } from '../engine/aiDirector.js';
import {
  buildPlayerAvatar3D,
  InstancedArenaPools,
  PlayerXPBar3D,
  POOL_CAPS,
  SharedThreeAssets
} from './meshes3d.js';

const PLAYER_MAX_HP = 100;
const BASE_PLAYER_SPEED = 208.0;

// Límites lógicos justos y consistentes entre móvil vertical y ordenador horizontal
const ARENA_BOUNDS = {
  minX: -190,
  maxX: 190,
  minY: -300,
  maxY: 300,
  midX: 0,
  midY: 0,
  width: 380,
  height: 600
};

const POPUP_POOL_SIZE = 8;

function xpRequiredForLevel(level) {
  const step = Math.max(0, level - 1);
  return 25 + level * 15 + step * step * 4;
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function createEmptyPhaseStat(entered = false) {
  return {
    entered,
    survivedSeconds: 0,
    didSurvive: false,
    kills: 0,
    medkitsCollected: 0,
    stressIntegral: 0,
    sampleTime: 0,
    peakStress: 18
  };
}

export class PanicArena3D {
  constructor({
    container,
    modeId = 'unified',
    initials,
    avatarId,
    audio,
    onSnapshotUpdate,
    onRunCompleted,
    onJoystickChange,
    onPauseShortcut,
    onUpgradeDraftChange
  }) {
    this.container = container;
    this.modeId = 'unified';
    this.currentPhaseIndex = 0;
    this.modeDef = CAMPAIGN_PHASES[0];
    this.initials = initials;
    this.avatarId = avatarId;
    this.avatarDef = PLAYER_AVATAR_MAP[avatarId] || PLAYER_AVATAR_MAP.penitente;
    this.audio = audio;
    this.onSnapshotUpdate = onSnapshotUpdate;
    this.onRunCompleted = onRunCompleted;
    this.onJoystickChange = onJoystickChange;
    this.onPauseShortcut = onPauseShortcut;
    this.onUpgradeDraftChange = onUpgradeDraftChange;

    this.hasEnded = false;
    this.isUserPaused = false;
    this.isDisposed = false;
    this.contextLost = false;
    this.needsPausedRender = false;
    this.rafId = null;
    this.lastFrameTime = null;
    this.phaseTransition = null;

    // Telemetría desglosada por cada uno de los 3 tramos de 40s
    this.phaseStats = {
      classic1985: createEmptyPhaseStat(true),
      hybrid1985x2026: createEmptyPhaseStat(false),
      director2026: createEmptyPhaseStat(false)
    };

    // Estado del jugador, mejoras (upgrades) y progresión
    this.playerPos = { x: 0, y: 0 };
    this.playerVelocity = { dx: 0, dy: 0 };
    const sb = this.avatarDef.startingBonuses || {};
    this.playerMaxHP = PLAYER_MAX_HP + (sb.maxHpBonus || 0);
    this.playerHP = this.playerMaxHP;
    this.invulnerabilityTimer = 0;
    this.fireTimer = 0;
    this.playerLevel = 1;
    this.currentXP = 0;
    this.xpToNextLevel = xpRequiredForLevel(1);
    this.upgradeRanks = {
      damage: 0,
      fireRate: 0,
      multishot: 0,
      pierce: 0,
      moveSpeed: 0,
      vitality: 0,
      magnet: 0,
      nova: 0
    };
    this.upgradeBestRarity = {
      damage: null,
      fireRate: null,
      multishot: null,
      pierce: null,
      moveSpeed: null,
      vitality: null,
      magnet: null,
      nova: null
    };
    this.upgradeStats = {
      dmgBonus: sb.dmgBonus || 0,
      knockBonus: sb.knockBonus || 0,
      rateBonus: sb.rateBonus || 0,
      projSpeedBonus: sb.projSpeedBonus || 0,
      extraShots: sb.extraShots || 0,
      pierceBonus: sb.pierceBonus || 0,
      scaleBonus: sb.scaleBonus || 0,
      speedBonus: sb.speedBonus || 0,
      iframeBonus: sb.iframeBonus || 0,
      radiusBonus: sb.radiusBonus || 0,
      medkitHealBonus: sb.medkitHealBonus || 0,
      novaDmg: sb.novaDmg || 0,
      novaRadius: sb.novaRadius || 0,
      xpMultiplier: sb.xpMultiplier || 1.0,
      lifeStealEveryKills: sb.lifeStealEveryKills || 0,
      lifeStealAmount: sb.lifeStealAmount || 0
    };
    this.pendingLevelUps = 0;
    this.activeUpgradeDraft = null;
    this.activeBoss = null;
    this.bossSchedule = [30.0, 60.0, 90.0, 119.0];
    this.bossesSpawned = 0;
    this.bossZones = [];

    // Motores de IA (Campaña unificada de 3 fases: 1985 -> Híbrido -> IA Directora 2026)
    this.stressTracker = new StressMetricsTracker();
    this.waveDirector = createWaveDirector('unified');
    this.previousStressTier = this.stressTracker.currentTier;
    this.lastDirective = null;
    this.aiRescueMedkitTimer = 0;
    this.currentAiState = {
      mode: 'balanced',
      badge: '⚖️ NORMAL',
      text: 'Ritmo equilibrado',
      color: RELICARIO_PALETTE.liturgicalGold,
      spawnMult: 1.0
    };

    // Entidades y VFX en pools ligeros (sin allocations Three.js por frame)
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.medkits = [];
    this.particles = [];
    this.shockRings = [];
    this.detachedRibs = [];
    this.ghostTrails = [];
    this.staticGlows = [];
    this.activePopups = [];
    this.popupPool = [];

    // Contadores y temporizadores
    this.elapsedTime = 0;
    this.spawnTimer = 0.45;
    this.hudPublishTimer = 0;
    this.kills = 0;
    this.medkitsCollected = 0;
    this.justTookDamageFlag = false;
    this.shakeTimer = 0;
    this.shakeAmplitude = 0;

    // Métricas de DPR adaptativo
    this.dprSteps = [0.75, 0.9, 1.0, 1.25, 1.5];
    this.nativeDpr = window.devicePixelRatio || 1;
    this.maxPixelRatio = Math.min(this.nativeDpr, 1.5);
    this.currentPixelRatio = this.maxPixelRatio;
    this.perfFrames = 0;
    this.perfDeltaSum = 0;

    // Scratch sin allocaciones
    this._desiredTarget = new THREE.Vector3();
    this._desiredCamPos = new THREE.Vector3();
    this._colIvory = new THREE.Color(RELICARIO_PALETTE.ivory);
    this._colColdSilver = new THREE.Color(RELICARIO_PALETTE.coldSilver);
    this._colGold = new THREE.Color(RELICARIO_PALETTE.liturgicalGold);
    this._colScratch = new THREE.Color();

    // Entrada híbrida: teclado WASD/Flechas + joystick flotante táctil/ratón
    this.keysDown = new Set();
    this.activePointerId = null;
    this.joystickOrigin = { x: 0, y: 0 };
    this.pointerMoveInput = { dx: 0, dy: 0 };
    this.moveInput = { dx: 0, dy: 0 };

    // Inicializar Three.js + Escenario + Pools + Entidad jugador
    this.assets = new SharedThreeAssets();
    this.#initThreeScene();
    this.#bindInputs();
    this.#publishHUDNow(null);
    this.#startLoop();
  }

  #computeCameraFov(aspect) {
    if (aspect < 0.85) {
      return Math.min(62, 48 + (0.85 - aspect) * 36);
    }
    return 48;
  }

  #initThreeScene() {
    const width = Math.max(320, this.container.clientWidth || window.innerWidth);
    const height = Math.max(320, this.container.clientHeight || window.innerHeight);
    const aspect = width / height;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0B0809');
    this.scene.fog = new THREE.Fog('#0B0809', 260, 1100);

    this.camera = new THREE.PerspectiveCamera(this.#computeCameraFov(aspect), aspect, 20, 1800);
    this.cameraLookTarget = new THREE.Vector3(0, 12, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.nativeDpr < 1.5,
      powerPreference: 'high-performance',
      stencil: false
    });
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.setSize(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'arena-canvas';
    this.container.appendChild(this.renderer.domElement);

    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    this.#buildLights();
    this.#buildSanctuaryArena();
    this.#buildAmbientEmbers();
    this.#buildPlayer();
    this.#buildBossVisual();
    this.pools = new InstancedArenaPools(this.worldGroup, this.assets);
    this.#buildPopupPool();

    this.#updateCamera(1.0);
    // Compilar todos los shaders (incluyendo InstancedMesh) antes del primer frame
    this.renderer.compile(this.scene, this.camera);
    this.pools.resetFrameCounts();
    this.#syncPools();
  }

  #buildLights() {
    const hemi = new THREE.HemisphereLight('#685258', '#0C0909', 1.35);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#F5EFE6', 1.48);
    keyLight.position.set(160, 360, 210);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(RELICARIO_PALETTE.coldSilver, 0.62);
    rimLight.position.set(-180, 190, -250);
    this.scene.add(rimLight);

    this.playerLight = new THREE.PointLight(this.avatarDef.auraColor, 2.2, 235, 1.35);
    this.playerLight.position.set(0, 46, 0);
    this.scene.add(this.playerLight);
  }

  #buildSanctuaryArena() {
    // Textura procedural de losas basálticas oscuras + juntas de piedra
    const texCanvas = document.createElement('canvas');
    texCanvas.width = 256;
    texCanvas.height = 256;
    const ctx = texCanvas.getContext('2d');
    ctx.fillStyle = '#151011';
    ctx.fillRect(0, 0, 256, 256);

    const tile = 32;
    for (let y = 0; y < 256; y += tile) {
      for (let x = 0; x < 256; x += tile) {
        const shade = ((x * 7 + y * 13) % 11) - 5;
        const r = 24 + shade;
        const g = 18 + Math.round(shade * 0.7);
        const b = 19 + Math.round(shade * 0.7);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      }
    }
    ctx.strokeStyle = '#0B0809';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 256; i += tile) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }

    this.floorTex = new THREE.CanvasTexture(texCanvas);
    this.floorTex.wrapS = THREE.RepeatWrapping;
    this.floorTex.wrapT = THREE.RepeatWrapping;
    this.floorTex.repeat.set(4, 6.2);
    this.floorTex.colorSpace = THREE.SRGBColorSpace;
    this.assets.textures.push(this.floorTex);

    // Suelo principal jugable (Lambert rápido; Three.js ordena opacos front-to-back para Early-Z)
    const floorGeo = new THREE.PlaneGeometry(ARENA_BOUNDS.width, ARENA_BOUNDS.height);
    floorGeo.rotateX(-Math.PI / 2);
    this.assets.trackGeometry(floorGeo);

    const floorMat = new THREE.MeshLambertMaterial({
      map: this.floorTex
    });
    this.assets.trackMaterial(floorMat);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = 0;
    this.worldGroup.add(floor);

    // Sello ritual geométrico central del Relicario (anillos y rombo sin DoubleSide ni niebla)
    const outerSealGeo = new THREE.RingGeometry(118, 122, 48);
    outerSealGeo.rotateX(-Math.PI / 2);
    this.assets.trackGeometry(outerSealGeo);
    const sealMat = new THREE.MeshBasicMaterial({
      color: '#3D2326',
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false
    });
    this.assets.trackMaterial(sealMat);
    const outerSeal = new THREE.Mesh(outerSealGeo, sealMat);
    outerSeal.position.y = 0.4;
    this.worldGroup.add(outerSeal);

    const innerSealGeo = new THREE.RingGeometry(82, 85, 4);
    innerSealGeo.rotateX(-Math.PI / 2);
    this.assets.trackGeometry(innerSealGeo);
    const diamondSeal = new THREE.Mesh(innerSealGeo, sealMat);
    diamondSeal.position.y = 0.45;
    this.worldGroup.add(diamondSeal);

    const accentSealGeo = new THREE.RingGeometry(42, 44, 28);
    accentSealGeo.rotateX(-Math.PI / 2);
    this.assets.trackGeometry(accentSealGeo);
    const goldSealMat = new THREE.MeshBasicMaterial({
      color: RELICARIO_PALETTE.liturgicalGold,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      fog: false
    });
    this.assets.trackMaterial(goldSealMat);
    const coreSeal = new THREE.Mesh(accentSealGeo, goldSealMat);
    coreSeal.position.y = 0.5;
    this.worldGroup.add(coreSeal);

    // Resplandor carmesí central en el altar (sin PointLight extra por fragmento)
    this.staticGlows.push({
      x: 0,
      y: 0.25,
      z: 0,
      size: 240,
      color: new THREE.Color(RELICARIO_PALETTE.visceralCore),
      opacity: 0.24
    });

    // Bordillo perimetral de obsidiana y línea sutil de límite arena
    const halfW = ARENA_BOUNDS.width * 0.5;
    const halfH = ARENA_BOUNDS.height * 0.5;
    const borderGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-halfW, 1.2, -halfH),
      new THREE.Vector3(halfW, 1.2, -halfH),
      new THREE.Vector3(halfW, 1.2, halfH),
      new THREE.Vector3(-halfW, 1.2, halfH)
    ]);
    this.assets.trackGeometry(borderGeo);
    const borderMat = new THREE.LineBasicMaterial({
      color: RELICARIO_PALETTE.vermilion,
      transparent: true,
      opacity: 0.42,
      fog: false
    });
    this.assets.trackMaterial(borderMat);
    const borderLoop = new THREE.LineLoop(borderGeo, borderMat);
    this.worldGroup.add(borderLoop);

    const wallThick = 14;
    const wallH = 12;
    const wallMat = new THREE.MeshLambertMaterial({
      color: '#1E1517'
    });
    this.assets.trackMaterial(wallMat);

    // Muros perimetrales instanciados (1 draw call)
    const wallConfigs = [
      { w: ARENA_BOUNDS.width + wallThick * 2, d: wallThick, x: 0, z: -(halfH + wallThick * 0.5) },
      { w: ARENA_BOUNDS.width + wallThick * 2, d: wallThick, x: 0, z: halfH + wallThick * 0.5 },
      { w: wallThick, d: ARENA_BOUNDS.height, x: -(halfW + wallThick * 0.5), z: 0 },
      { w: wallThick, d: ARENA_BOUNDS.height, x: halfW + wallThick * 0.5, z: 0 }
    ];
    const wallsInstanced = new THREE.InstancedMesh(this.assets.boxUnit, wallMat, wallConfigs.length);
    const dummy = new THREE.Object3D();
    wallConfigs.forEach((cfg, idx) => {
      dummy.position.set(cfg.x, wallH * 0.5 - 1, cfg.z);
      dummy.scale.set(cfg.w, wallH, cfg.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      wallsInstanced.setMatrixAt(idx, dummy.matrix);
    });
    wallsInstanced.instanceMatrix.needsUpdate = true;
    this.worldGroup.add(wallsInstanced);

    // Pilares góticos perimetrales + capiteles instanciados (2 draw calls en total)
    const pillarPositions = [
      [-halfW - 10, -halfH - 10],
      [halfW + 10, -halfH - 10],
      [-halfW - 10, halfH + 10],
      [halfW + 10, halfH + 10],
      [-halfW - 10, 0],
      [halfW + 10, 0],
      [0, -halfH - 10],
      [0, halfH + 10]
    ];

    const pillarsInstanced = new THREE.InstancedMesh(this.assets.cylUnit, wallMat, pillarPositions.length);
    const capsInstanced = new THREE.InstancedMesh(this.assets.octaUnit, this.assets.matGold, pillarPositions.length);
    const emberColor = new THREE.Color(RELICARIO_PALETTE.emberOrange);

    pillarPositions.forEach(([px, pz], idx) => {
      dummy.position.set(px, 28, pz);
      dummy.scale.set(11, 56, 11);
      dummy.updateMatrix();
      pillarsInstanced.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(px, 59, pz);
      dummy.scale.set(6, 7, 6);
      dummy.updateMatrix();
      capsInstanced.setMatrixAt(idx, dummy.matrix);

      this.staticGlows.push({
        x: px,
        y: 60,
        z: pz,
        size: 34,
        color: emberColor,
        opacity: 0.52
      });
    });
    pillarsInstanced.instanceMatrix.needsUpdate = true;
    capsInstanced.instanceMatrix.needsUpdate = true;
    this.staticInstancedMeshes = [wallsInstanced, pillarsInstanced, capsInstanced];
    this.worldGroup.add(wallsInstanced, pillarsInstanced, capsInstanced);
  }

  #buildAmbientEmbers() {
    const count = 42;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = randomRange(-ARENA_BOUNDS.width * 0.55, ARENA_BOUNDS.width * 0.55);
      positions[i * 3 + 1] = randomRange(4, 130);
      positions[i * 3 + 2] = randomRange(-ARENA_BOUNDS.height * 0.55, ARENA_BOUNDS.height * 0.55);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.assets.trackGeometry(geo);

    const mat = new THREE.PointsMaterial({
      color: RELICARIO_PALETTE.emberOrange,
      size: 3.2,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    this.assets.trackMaterial(mat);
    this.emberPoints = new THREE.Points(geo, mat);
    this.worldGroup.add(this.emberPoints);
  }

  #buildPlayer() {
    this.playerVisual = buildPlayerAvatar3D(this.avatarId, this.assets);
    this.playerVisual.root.position.set(0, 0, 0);
    this.worldGroup.add(this.playerVisual.root);

    this.playerXPBar = new PlayerXPBar3D(this.assets);
    this.playerXPBar.sprite.position.set(0, 44, -8);
    this.worldGroup.add(this.playerXPBar.sprite);
    this.playerXPBar.updateXP(0, 1, false);
  }

  #buildBossVisual() {
    const root = new THREE.Group();
    root.visible = false;

    const body = new THREE.Group();
    root.add(body);

    // Doble sello ritual gigante en el suelo bajo el Boss (cambia de color según el Boss)
    const auraMat = new THREE.MeshBasicMaterial({
      color: RELICARIO_PALETTE.vermilion,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      fog: false
    });
    this.assets.trackMaterial(auraMat);
    const auraRing = new THREE.Mesh(this.assets.ringGround, auraMat);
    auraRing.scale.setScalar(46);
    auraRing.position.y = 0.75;
    root.add(auraRing);

    const innerAuraRing = new THREE.Mesh(this.assets.ringGround, auraMat);
    innerAuraRing.scale.setScalar(28);
    innerAuraRing.position.y = 0.82;
    root.add(innerAuraRing);

    // =========================================================================
    // BOSS 1 (30s): COLOSO DE CENIZA (Titán de Forja, Costillas, 4 Cuernos y 2 Martillos de Guerra)
    // =========================================================================
    const model1 = new THREE.Group();
    const mat1Core = new THREE.MeshPhongMaterial({
      color: '#2C160E',
      emissive: '#B8330A',
      emissiveIntensity: 0.78,
      shininess: 45
    });
    this.assets.trackMaterial(mat1Core);

    // Torso acorazado + costillar de hueso exterior
    const b1Torso = new THREE.Mesh(this.assets.icosaUnit, mat1Core);
    b1Torso.scale.set(22, 26, 18);
    b1Torso.position.y = 22;
    model1.add(b1Torso);

    for (let r = 0; r < 3; r++) {
      const ribBar = new THREE.Mesh(this.assets.torusUnit, this.assets.matOldBone);
      ribBar.scale.set(19 - r * 1.5, 14 - r, 10);
      ribBar.position.set(0, 14 + r * 6, 3);
      ribBar.rotation.x = Math.PI * 0.5;
      model1.add(ribBar);
    }

    // Corazón de magma incandescente
    const b1Furnace = new THREE.Mesh(this.assets.octaUnit, this.assets.matOrange);
    b1Furnace.scale.set(11, 14, 11);
    b1Furnace.position.set(0, 21, 9);
    model1.add(b1Furnace);

    // Cráneo demoníaco esculpido + mandíbula
    const b1Skull = new THREE.Mesh(this.assets.icosaUnit, this.assets.matIvory);
    b1Skull.scale.set(12, 13, 12);
    b1Skull.position.set(0, 41, 3);
    model1.add(b1Skull);

    const b1Jaw = new THREE.Mesh(this.assets.boxUnit, this.assets.matOldBone);
    b1Jaw.scale.set(11, 5, 10);
    b1Jaw.position.set(0, 32, 5);
    model1.add(b1Jaw);

    // Brazos articulados con 2 Martillos de Guerra de Lava
    const b1ArmsGroup = new THREE.Group();
    b1ArmsGroup.position.set(0, 30, 0);
    for (const side of [-1, 1]) {
      // Hombreras dobles con espinas
      const pauldron = new THREE.Mesh(this.assets.octaUnit, this.assets.matOldBone);
      pauldron.scale.set(13, 14, 13);
      pauldron.position.set(side * 22, 2, 0);
      pauldron.rotation.z = -side * 0.4;
      b1ArmsGroup.add(pauldron);

      const spike = new THREE.Mesh(this.assets.coneUnit, this.assets.matOrange);
      spike.scale.set(4.5, 11, 4.5);
      spike.position.set(side * 26, 12, 0);
      spike.rotation.z = -side * 0.55;
      b1ArmsGroup.add(spike);

      // Martillo de guerra gigante en cada mano
      const shaft = new THREE.Mesh(this.assets.cylUnit, this.assets.matVoid);
      shaft.scale.set(2.2, 26, 2.2);
      shaft.position.set(side * 25, -8, 10);
      shaft.rotation.x = 0.55;
      b1ArmsGroup.add(shaft);

      const hammerHead = new THREE.Mesh(this.assets.boxUnit, this.assets.matOrange);
      hammerHead.scale.set(11, 11, 16);
      hammerHead.position.set(side * 25, -16, 18);
      b1ArmsGroup.add(hammerHead);

      // 4 Cuernos curvados (2 superiores + 2 laterales)
      const hornTop = new THREE.Mesh(this.assets.coneUnit, this.assets.matOrange);
      hornTop.scale.set(4.5, 15, 4.5);
      hornTop.position.set(side * 12, 49, 2);
      hornTop.rotation.z = -side * 0.72;
      hornTop.rotation.x = 0.35;
      model1.add(hornTop);

      const hornSide = new THREE.Mesh(this.assets.coneUnit, this.assets.matOldBone);
      hornSide.scale.set(3.5, 11, 3.5);
      hornSide.position.set(side * 15, 40, 4);
      hornSide.rotation.z = -side * 1.15;
      model1.add(hornSide);

      // Ojos de brasa
      const eye = new THREE.Mesh(this.assets.octaUnit, this.assets.matGold);
      eye.scale.set(3.2, 2.5, 3.2);
      eye.position.set(side * 5, 41, 13);
      model1.add(eye);
    }
    model1.add(b1ArmsGroup);

    // Anillo orbital de 8 cristales de magma
    const b1Hammers = new THREE.Group();
    b1Hammers.position.y = 14;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const crystal = new THREE.Mesh(this.assets.octaUnit, i % 2 === 0 ? this.assets.matOrange : this.assets.matGold);
      crystal.scale.set(5.5, 10, 5.5);
      crystal.position.set(Math.cos(a) * 30, 0, Math.sin(a) * 30);
      b1Hammers.add(crystal);
    }
    model1.add(b1Hammers);
    body.add(model1);

    // =========================================================================
    // BOSS 2 (60s): SERAFÍN CORRUPTO (Arcángel de Cristal, 6 Alas Tricolor y Orbes Astrales)
    // =========================================================================
    const model2 = new THREE.Group();
    const mat2Core = new THREE.MeshPhongMaterial({
      color: '#0D292C',
      emissive: '#198A85',
      emissiveIntensity: 0.78,
      shininess: 75
    });
    this.assets.trackMaterial(mat2Core);

    const b2Spire = new THREE.Mesh(this.assets.coneUnit, mat2Core);
    b2Spire.scale.set(13, 25, 13);
    b2Spire.position.y = 24;
    b2Spire.rotation.x = Math.PI;
    model2.add(b2Spire);

    const b2Armor = new THREE.Mesh(this.assets.octaUnit, this.assets.matIvory);
    b2Armor.scale.set(11, 16, 9);
    b2Armor.position.y = 29;
    model2.add(b2Armor);

    const b2Crown = new THREE.Mesh(this.assets.octaUnit, this.assets.matColdSilver);
    b2Crown.scale.set(10, 18, 10);
    b2Crown.position.y = 46;
    model2.add(b2Crown);

    // Halo solar radiante detrás de la cabeza
    const b2SunHalo = new THREE.Mesh(this.assets.torusUnit, this.assets.matGold);
    b2SunHalo.scale.setScalar(16);
    b2SunHalo.position.set(0, 44, -4);
    model2.add(b2SunHalo);

    // 3 Ojos verticales de jade consagrado
    for (let e = 0; e < 3; e++) {
      const eye = new THREE.Mesh(this.assets.octaUnit, this.assets.matGraceJade);
      eye.scale.set(3.4, 4.8, 3.4);
      eye.position.set(0, 22 + e * 9, 12);
      model2.add(eye);
    }

    // 6 Grandes Alas Articuladas en 3 pisos (Oro arriba, Plata en medio, Jade abajo)
    const b2LeftWings = new THREE.Group();
    const b2RightWings = new THREE.Group();
    b2LeftWings.position.set(-10, 30, -3);
    b2RightWings.position.set(10, 30, -3);
    const wingMats = [this.assets.matGold, this.assets.matColdSilver, this.assets.matGraceJade];
    for (let w = 0; w < 3; w++) {
      const s = 2.25 - w * 0.28;
      const lw = new THREE.Mesh(this.assets.desolladoWingGeo, wingMats[w]);
      lw.scale.setScalar(s);
      lw.position.set(-5 - w * 3.5, (1 - w) * 9.5, -w * 2);
      lw.rotation.z = (1 - w) * 0.36;
      b2LeftWings.add(lw);

      const rw = new THREE.Mesh(this.assets.desolladoWingGeo, wingMats[w]);
      rw.scale.setScalar(s);
      rw.position.set(5 + w * 3.5, (1 - w) * 9.5, -w * 2);
      rw.rotation.y = Math.PI;
      rw.rotation.z = (1 - w) * 0.36;
      b2RightWings.add(rw);
    }
    model2.add(b2LeftWings, b2RightWings);

    // Astrolabio cruzado + 4 Orbes de cristal flotantes
    const b2Ring1 = new THREE.Mesh(this.assets.torusUnit, this.assets.matColdSilver);
    b2Ring1.scale.setScalar(29);
    b2Ring1.position.y = 28;
    const b2Ring2 = new THREE.Mesh(this.assets.torusUnit, this.assets.matGraceJade);
    b2Ring2.scale.setScalar(23);
    b2Ring2.position.y = 28;
    for (let o = 0; o < 4; o++) {
      const a = (o / 4) * Math.PI * 2;
      const orb = new THREE.Mesh(this.assets.octaUnit, o % 2 === 0 ? this.assets.matColdSilver : this.assets.matGold);
      orb.scale.setScalar(0.18);
      orb.position.set(Math.cos(a) * 1.15, Math.sin(a) * 1.15, 0);
      b2Ring1.add(orb);
    }
    model2.add(b2Ring1, b2Ring2);
    body.add(model2);

    // =========================================================================
    // BOSS 3 (90s): INQUISIDOR ABISAL (Señor de las Guadañas y Trono de 6 Espadas)
    // =========================================================================
    const model3 = new THREE.Group();
    const mat3Core = new THREE.MeshPhongMaterial({
      color: '#1C0826',
      emissive: '#7E18BF',
      emissiveIntensity: 0.8,
      shininess: 55
    });
    this.assets.trackMaterial(mat3Core);

    const b3Cloak = new THREE.Mesh(this.assets.coneUnit, mat3Core);
    b3Cloak.scale.set(21, 24, 21);
    b3Cloak.position.y = 21;
    model3.add(b3Cloak);

    const b3Shoulders = new THREE.Mesh(this.assets.octaUnit, this.assets.matVoid);
    b3Shoulders.scale.set(22, 8, 14);
    b3Shoulders.position.y = 30;
    model3.add(b3Shoulders);

    // Sombrero de ala ancha de Inquisidor + corona de espinas doradas
    const b3Brim = new THREE.Mesh(this.assets.cylUnit, this.assets.matVoid);
    b3Brim.scale.set(27, 2.2, 27);
    b3Brim.position.y = 38;
    model3.add(b3Brim);

    const b3CrownRing = new THREE.Mesh(this.assets.torusUnit, this.assets.matGold);
    b3CrownRing.scale.setScalar(14);
    b3CrownRing.position.y = 40;
    b3CrownRing.rotation.x = Math.PI * 0.5;
    model3.add(b3CrownRing);

    const b3Hat = new THREE.Mesh(this.assets.coneUnit, mat3Core);
    b3Hat.scale.set(12.5, 16, 12.5);
    b3Hat.position.y = 50;
    model3.add(b3Hat);

    const b3Visor = new THREE.Mesh(this.assets.boxUnit, this.assets.matVermilion);
    b3Visor.scale.set(14, 3.5, 5);
    b3Visor.position.set(0, 34, 11.5);
    model3.add(b3Visor);

    // Abanico de 6 Espadas Espectrales flotando tras su espalda
    const b3SwordsFan = new THREE.Group();
    b3SwordsFan.position.set(0, 36, -10);
    for (let s = 0; s < 6; s++) {
      const ang = -0.85 + (s / 5) * 1.7;
      const sword = new THREE.Mesh(this.assets.octaUnit, s % 2 === 0 ? this.assets.matVermilion : this.assets.matGold);
      sword.scale.set(2.8, 18, 1.5);
      sword.position.set(Math.sin(ang) * 24, Math.cos(ang) * 14, 0);
      sword.rotation.z = -ang;
      b3SwordsFan.add(sword);
    }
    model3.add(b3SwordsFan);

    // 4 Guadañas gigantes giratorias + 4 obeliscos flotantes
    const b3Scythes = new THREE.Group();
    b3Scythes.position.y = 22;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const scythe = new THREE.Mesh(this.assets.jaulaRibGeo, this.assets.matVermilion);
      scythe.position.set(Math.cos(a) * 20, 0, Math.sin(a) * 20);
      scythe.rotation.set(Math.PI * 0.45, -a, 0, 'YXZ');
      scythe.scale.setScalar(2.4);
      b3Scythes.add(scythe);

      const obelisk = new THREE.Mesh(this.assets.octaUnit, this.assets.matGold);
      obelisk.scale.set(5, 13, 5);
      obelisk.position.set(Math.cos(a + Math.PI * 0.25) * 31, 7, Math.sin(a + Math.PI * 0.25) * 31);
      b3Scythes.add(obelisk);
    }
    model3.add(b3Scythes);
    body.add(model3);

    // =========================================================================
    // BOSS 4 (1:59 — JEFE FINAL): EL RELICARIO ETERNO (Trono Catedralicio y Esfera Armilar)
    // =========================================================================
    const model4 = new THREE.Group();
    const mat4Core = new THREE.MeshPhongMaterial({
      color: '#3D0714',
      emissive: '#CC0A30',
      emissiveIntensity: 0.9,
      shininess: 80
    });
    this.assets.trackMaterial(mat4Core);

    // Corazón monolítico gigante + armadura dorada
    const b4Heart = new THREE.Mesh(this.assets.octaUnit, mat4Core);
    b4Heart.scale.set(24, 36, 24);
    b4Heart.position.y = 34;
    model4.add(b4Heart);

    const b4Armor = new THREE.Mesh(this.assets.icosaUnit, this.assets.matGold);
    b4Armor.scale.set(18, 27, 18);
    b4Armor.position.y = 34;
    model4.add(b4Armor);

    // Corona superior de 8 Lanzas Sagradas flotantes
    const b4CrownSpears = new THREE.Group();
    b4CrownSpears.position.y = 62;
    for (let s = 0; s < 8; s++) {
      const a = (s / 8) * Math.PI * 2;
      const spear = new THREE.Mesh(this.assets.octaUnit, this.assets.matGold);
      spear.scale.set(2.6, 11, 2.6);
      spear.position.set(Math.cos(a) * 14, 0, Math.sin(a) * 14);
      b4CrownSpears.add(spear);
    }
    model4.add(b4CrownSpears);

    // 4 Alas de Serafín doradas escoltando el núcleo
    for (const side of [-1, 1]) {
      const wTop = new THREE.Mesh(this.assets.desolladoWingGeo, this.assets.matGold);
      wTop.scale.setScalar(2.4);
      wTop.position.set(side * 22, 42, -4);
      if (side === 1) wTop.rotation.y = Math.PI;
      wTop.rotation.z = 0.35;
      model4.add(wTop);

      const wBot = new THREE.Mesh(this.assets.desolladoWingGeo, this.assets.matVermilion);
      wBot.scale.setScalar(2.0);
      wBot.position.set(side * 20, 24, -4);
      if (side === 1) wBot.rotation.y = Math.PI;
      wBot.rotation.z = -0.25;
      model4.add(wBot);
    }

    // Ojo omnisciente central
    const b4Eye = new THREE.Mesh(this.assets.octaUnit, this.assets.matIvory);
    b4Eye.scale.set(9, 14, 9);
    b4Eye.position.set(0, 34, 22);
    model4.add(b4Eye);

    // Triple giroscopio sagrado (3 grandes anillos concéntricos)
    const b4Gyro1 = new THREE.Mesh(this.assets.torusUnit, this.assets.matGold);
    b4Gyro1.scale.setScalar(40);
    b4Gyro1.position.y = 34;

    const b4Gyro2 = new THREE.Mesh(this.assets.torusUnit, this.assets.matVermilion);
    b4Gyro2.scale.setScalar(32);
    b4Gyro2.position.y = 34;

    const b4Gyro3 = new THREE.Mesh(this.assets.torusUnit, this.assets.matColdSilver);
    b4Gyro3.scale.setScalar(25);
    b4Gyro3.position.y = 34;
    model4.add(b4Gyro1, b4Gyro2, b4Gyro3);

    // 8 Torres góticas flotantes que orbitan alrededor del Jefe Final
    const b4Pillars = new THREE.Group();
    b4Pillars.position.y = 24;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const pGroup = new THREE.Group();
      pGroup.position.set(Math.cos(a) * 38, 0, Math.sin(a) * 38);
      pGroup.rotation.y = -a;

      const col = new THREE.Mesh(this.assets.boxUnit, i % 2 === 0 ? this.assets.matGold : this.assets.matVermilion);
      col.scale.set(6, 24, 6);
      pGroup.add(col);

      const cap = new THREE.Mesh(this.assets.octaUnit, this.assets.matIvory);
      cap.scale.set(5, 8, 5);
      cap.position.y = 16;
      pGroup.add(cap);

      b4Pillars.add(pGroup);
    }
    model4.add(b4Pillars);
    body.add(model4);

    this.worldGroup.add(root);
    this.bossVisual = {
      root,
      body,
      auraRing,
      innerAuraRing,
      auraMat,
      models: {
        1: model1,
        2: model2,
        3: model3,
        4: model4
      },
      mats: {
        1: { mat: mat1Core, baseHex: '#B8330A' },
        2: { mat: mat2Core, baseHex: '#198A85' },
        3: { mat: mat3Core, baseHex: '#7E18BF' },
        4: { mat: mat4Core, baseHex: '#CC0A30' }
      },
      parts: {
        b1Hammers,
        b1Furnace,
        b1ArmsGroup,
        b2LeftWings,
        b2RightWings,
        b2Ring1,
        b2Ring2,
        b2SunHalo,
        b3Scythes,
        b3SwordsFan,
        b4Heart,
        b4CrownSpears,
        b4Gyro1,
        b4Gyro2,
        b4Gyro3,
        b4Pillars
      }
    };
  }

  #buildPopupPool() {
    for (let i = 0; i < POPUP_POOL_SIZE; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.assets.white1x1Tex,
        transparent: true,
        depthTest: false,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(92, 20, 1);
      sprite.renderOrder = 25;
      sprite.visible = false;
      this.worldGroup.add(sprite);
      this.popupPool.push({
        sprite,
        material: mat,
        inUse: false,
        life: 0,
        maxLife: 0.72
      });
    }
  }

  // MARK: - Control de Entrada Híbrido (Touch + Ratón + Teclado)

  #bindInputs() {
    this._onResize = () => this.#handleResize();
    window.addEventListener('resize', this._onResize);

    this._onKeyDown = (e) => {
      if (this.activeUpgradeDraft && this.activeUpgradeDraft.options) {
        if (e.code === 'Digit1' || e.code === 'Numpad1') {
          e.preventDefault();
          const opt = this.activeUpgradeDraft.options[0];
          if (opt) this.selectUpgrade(opt.id);
          return;
        }
        if (e.code === 'Digit2' || e.code === 'Numpad2') {
          e.preventDefault();
          const opt = this.activeUpgradeDraft.options[1];
          if (opt) this.selectUpgrade(opt.id);
          return;
        }
        if (e.code === 'Digit3' || e.code === 'Numpad3') {
          e.preventDefault();
          const opt = this.activeUpgradeDraft.options[2];
          if (opt) this.selectUpgrade(opt.id);
          return;
        }
      }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (!this.hasEnded && !this.activeUpgradeDraft && typeof this.onPauseShortcut === 'function') {
          e.preventDefault();
          this.onPauseShortcut();
        }
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      this.keysDown.add(e.code);
      this.audio?.unlock();
    };

    this._onKeyUp = (e) => {
      this.keysDown.delete(e.code);
    };

    this._onWindowBlur = () => {
      this.keysDown.clear();
      this.#releaseJoystick();
    };

    this._onVisibilityChange = () => {
      if (document.hidden) {
        this.keysDown.clear();
        this.#releaseJoystick();
      } else {
        this.lastFrameTime = null;
      }
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onWindowBlur);
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    const dom = this.renderer.domElement;
    this._onContextMenu = (e) => e.preventDefault();
    this._onWebGLContextLost = (e) => {
      e.preventDefault();
      this.contextLost = true;
    };
    this._onWebGLContextRestored = () => {
      this.contextLost = false;
      this.needsPausedRender = true;
    };

    this._onPointerDown = (e) => {
      if (this.hasEnded || this.isUserPaused || this.activeUpgradeDraft || this.activePointerId !== null) return;
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      this.audio?.unlock();
      this.activePointerId = e.pointerId;
      try {
        dom.setPointerCapture(e.pointerId);
      } catch {
        // Ignorar si no soporta capture
      }
      this.joystickOrigin.x = e.clientX;
      this.joystickOrigin.y = e.clientY;
      this.pointerMoveInput.dx = 0;
      this.pointerMoveInput.dy = 0;
      this.onJoystickChange?.({
        active: true,
        originX: e.clientX,
        originY: e.clientY,
        knobX: e.clientX,
        knobY: e.clientY
      });
    };

    this._onPointerMove = (e) => {
      if (this.activePointerId !== e.pointerId) return;
      const dx = e.clientX - this.joystickOrigin.x;
      const dyScreen = e.clientY - this.joystickOrigin.y;
      const distSq = dx * dx + dyScreen * dyScreen;
      const maxR = 46.0;

      if (distSq < 20.25) {
        this.pointerMoveInput.dx = 0;
        this.pointerMoveInput.dy = 0;
        this.onJoystickChange?.({
          active: true,
          originX: this.joystickOrigin.x,
          originY: this.joystickOrigin.y,
          knobX: this.joystickOrigin.x,
          knobY: this.joystickOrigin.y
        });
        return;
      }

      const dist = Math.sqrt(distSq);
      const clamped = Math.min(dist, maxR);
      const nx = dx / dist;
      const nyScreen = dyScreen / dist;
      const throttle = clamped / maxR;

      // En pantalla, arrastrar arriba (dyScreen < 0) equivale a +simY
      this.pointerMoveInput.dx = nx * throttle;
      this.pointerMoveInput.dy = -nyScreen * throttle;

      this.onJoystickChange?.({
        active: true,
        originX: this.joystickOrigin.x,
        originY: this.joystickOrigin.y,
        knobX: this.joystickOrigin.x + nx * clamped,
        knobY: this.joystickOrigin.y + nyScreen * clamped
      });
    };

    this._onPointerEnd = (e) => {
      if (this.activePointerId !== e.pointerId) return;
      this.#releaseJoystick();
    };

    dom.addEventListener('contextmenu', this._onContextMenu);
    dom.addEventListener('webglcontextlost', this._onWebGLContextLost);
    dom.addEventListener('webglcontextrestored', this._onWebGLContextRestored);
    dom.addEventListener('pointerdown', this._onPointerDown);
    dom.addEventListener('pointermove', this._onPointerMove);
    dom.addEventListener('pointerup', this._onPointerEnd);
    dom.addEventListener('pointercancel', this._onPointerEnd);
  }

  #releaseJoystick() {
    if (this.activePointerId !== null) {
      try {
        this.renderer?.domElement?.releasePointerCapture(this.activePointerId);
      } catch {
        // Ignorar
      }
    }
    this.activePointerId = null;
    this.pointerMoveInput.dx = 0;
    this.pointerMoveInput.dy = 0;
    this.onJoystickChange?.({ active: false, originX: 0, originY: 0, knobX: 0, knobY: 0 });
  }

  #resolveMoveInput() {
    if (this.activePointerId !== null) {
      this.moveInput.dx = this.pointerMoveInput.dx;
      this.moveInput.dy = this.pointerMoveInput.dy;
      return this.moveInput;
    }

    let kx = 0;
    let ky = 0;
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) kx -= 1;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) kx += 1;
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) ky += 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) ky -= 1;

    if (kx !== 0 || ky !== 0) {
      const mag = Math.hypot(kx, ky);
      this.moveInput.dx = kx / mag;
      this.moveInput.dy = ky / mag;
    } else {
      this.moveInput.dx = 0;
      this.moveInput.dy = 0;
    }
    return this.moveInput;
  }

  #handleResize() {
    if (this.isDisposed || !this.container) return;
    const width = Math.max(320, this.container.clientWidth || window.innerWidth);
    const height = Math.max(320, this.container.clientHeight || window.innerHeight);
    const aspect = width / height;
    this.camera.aspect = aspect;
    this.camera.fov = this.#computeCameraFov(aspect);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (this.isUserPaused) {
      this.needsPausedRender = true;
    }
  }

  setUserPaused(paused) {
    this.isUserPaused = Boolean(paused);
    if (this.isUserPaused) {
      this.#releaseJoystick();
      this.keysDown.clear();
      this.needsPausedRender = true;
    } else {
      this.lastFrameTime = null;
    }
  }

  forceAbort() {
    if (this.hasEnded) return;
    this.#finishRun(false);
  }

  // MARK: - Bucle Principal (60/120 Hz) + DPR Adaptativo

  #startLoop() {
    let prevVisualMs = null;
    const tick = (nowMs) => {
      if (this.isDisposed) return;
      this.rafId = requestAnimationFrame(tick);

      if (this.contextLost) return;

      const rawVisualMs = prevVisualMs !== null ? Math.max(0, nowMs - prevVisualMs) : 16.67;
      const visualDt = Math.min(0.05, rawVisualMs * 0.001);
      prevVisualMs = nowMs;

      if (this.isUserPaused) {
        if (this.needsPausedRender) {
          this.needsPausedRender = false;
          this.renderer.render(this.scene, this.camera);
        }
        return;
      }

      if (!this.hasEnded) {
        const nowSec = nowMs * 0.001;
        const rawDt = this.lastFrameTime !== null ? nowSec - this.lastFrameTime : 1 / 60;
        this.lastFrameTime = nowSec;
        const dt = Math.min(Math.max(rawDt, 0), 1 / 24);
        this.#stepSimulation(dt);
      }

      this.#updateVisualFX(visualDt);
      this.#syncPools();
      this.renderer.render(this.scene, this.camera);

      this.#adaptPixelRatio(rawVisualMs);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  #adaptPixelRatio(frameMs) {
    // Sólo medimos frames razonables (ignoramos saltos de cambio de pestaña)
    if (frameMs > 180) return;
    this.perfFrames += 1;
    this.perfDeltaSum += frameMs;
    if (this.perfFrames < 20) return;

    const avgMs = this.perfDeltaSum / this.perfFrames;
    if (avgMs <= 22.5 && this.perfFrames < 48) return;

    this.perfFrames = 0;
    this.perfDeltaSum = 0;

    let nextDpr = this.currentPixelRatio;
    if (avgMs > 22.5) {
      for (let i = this.dprSteps.length - 1; i >= 0; i--) {
        if (this.dprSteps[i] < this.currentPixelRatio - 0.05) {
          nextDpr = this.dprSteps[i];
          break;
        }
      }
    } else if (avgMs < 13.5 && this.currentPixelRatio < this.maxPixelRatio - 0.05) {
      for (let i = 0; i < this.dprSteps.length; i++) {
        if (this.dprSteps[i] > this.currentPixelRatio + 0.05 && this.dprSteps[i] <= this.maxPixelRatio + 0.01) {
          nextDpr = Math.min(this.maxPixelRatio, this.dprSteps[i]);
          break;
        }
      }
    }

    if (Math.abs(nextDpr - this.currentPixelRatio) > 0.04) {
      this.currentPixelRatio = nextDpr;
      this.renderer.setPixelRatio(nextDpr);
    }
  }

  #triggerPhaseTransition(nextPhaseIdx) {
    this.currentPhaseIndex = nextPhaseIdx;
    this.modeDef = CAMPAIGN_PHASES[nextPhaseIdx] || CAMPAIGN_PHASES[2];
    const phaseStat = this.phaseStats[this.modeDef.id];
    if (phaseStat) {
      phaseStat.entered = true;
    }

    // Desarmar todos los ataques y proyectiles enemigos durante la pausa de 5s
    this.enemyProjectiles.length = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      e.isSpitTelegraphing = false;
      e.isPouncing = false;
      e.abilityActiveTimer = 0;
      e.telegraphActive = false;
      if (e.stalkerPhase && e.stalkerPhase.type !== 'stalking') {
        e.stalkerPhase = { type: 'stalking', cooldown: 1.4 };
      }
    }

    this.playerVelocity.dx = 0;
    this.playerVelocity.dy = 0;
    this.#releaseJoystick();
    this.#spawnShockRing(this.playerPos.x, this.playerPos.y, this.modeDef.accentColor, 58);
    this.audio?.triggerLevelUp();

    this.phaseTransition = {
      active: true,
      remainingSec: PHASE_TRANSITION_DURATION,
      totalSec: PHASE_TRANSITION_DURATION,
      phaseNumber: this.modeDef.phaseNumber,
      phaseId: this.modeDef.id,
      kicker: this.modeDef.transitionKicker,
      headline: this.modeDef.transitionHeadline,
      description: this.modeDef.transitionDescription,
      rangeLabel: this.modeDef.rangeLabel,
      accentColor: this.modeDef.accentColor
    };

    this.#publishHUDNow(this.lastDirective);
  }

  #stepSimulation(dt) {
    // Pausa táctica mientras el jugador elige una mejora de subida de nivel
    if (this.activeUpgradeDraft) {
      this.playerVisual.body.visible = true;
      this.#animateAmbientEmbers(dt);
      this.#updateCamera(dt * 4.5);
      return;
    }

    // Pausa automática de 5 segundos al cambiar de fase (sin ataques ni daño, con cuenta atrás)
    if (this.phaseTransition && this.phaseTransition.active) {
      this.phaseTransition.remainingSec = Math.max(0, this.phaseTransition.remainingSec - dt);
      this.playerVisual.body.visible = true;
      this.#animateAmbientEmbers(dt);
      this.#updateCamera(dt * 5.0);

      if (this.phaseTransition.remainingSec <= 0) {
        this.phaseTransition = null;
        this.invulnerabilityTimer = Math.max(this.invulnerabilityTimer, 1.5);
        this.#spawnShockRing(this.playerPos.x, this.playerPos.y, this.modeDef.accentColor, 52);
        this.audio?.triggerLevelUp();
      }

      this.#publishHUDNow(this.lastDirective);
      return;
    }

    // El reloj de supervivencia avanza mientras no haya un Boss activo bloqueando el paso
    if (!this.activeBoss) {
      this.elapsedTime += dt;
    }

    // Progresión continua de 2 minutos sin cortes ni pausas entre tramos
    if (this.currentPhaseIndex === 0 && this.elapsedTime >= 40.0) {
      this.phaseStats.classic1985.survivedSeconds = 40.0;
      this.phaseStats.classic1985.didSurvive = true;
      this.currentPhaseIndex = 1;
      this.modeDef = CAMPAIGN_PHASES[1];
      this.phaseStats.hybrid1985x2026.entered = true;
    }

    if (this.currentPhaseIndex === 1 && this.elapsedTime >= 80.0) {
      this.phaseStats.hybrid1985x2026.survivedSeconds = 40.0;
      this.phaseStats.hybrid1985x2026.didSurvive = true;
      this.currentPhaseIndex = 2;
      this.modeDef = CAMPAIGN_PHASES[2];
      this.phaseStats.director2026.entered = true;
    }

    // Jefes a los 30s, 60s, 90s y Jefe Final en 1:59 (119s)
    if (!this.activeBoss && this.bossesSpawned < this.bossSchedule.length) {
      const targetBossTime = this.bossSchedule[this.bossesSpawned];
      if (this.elapsedTime >= targetBossTime) {
        this.elapsedTime = targetBossTime;
        this.#spawnBoss(this.bossesSpawned + 1);
      }
    }

    // Fin de la partida sólo cuando se ha derrotado también al Jefe Final de 1:59
    if (!this.activeBoss && this.bossesSpawned >= 4 && this.elapsedTime >= TOTAL_RUN_DURATION) {
      this.elapsedTime = TOTAL_RUN_DURATION;
      this.phaseStats.director2026.survivedSeconds = 40.0;
      this.phaseStats.director2026.didSurvive = true;
      this.#finishRun(true);
      return;
    }

    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - dt);
      this.playerVisual.body.visible = Math.floor(this.invulnerabilityTimer * 22) % 2 !== 0;
    } else {
      this.playerVisual.body.visible = true;
    }

    // 1. Movimiento del jugador (la velocidad depende de la mejora Paso Fantasma según su rareza)
    const move = this.#resolveMoveInput();
    const speedBonus = 1.0 + this.upgradeStats.speedBonus;
    const effectiveSpeed = BASE_PLAYER_SPEED * speedBonus;
    this.playerVelocity.dx = move.dx * effectiveSpeed;
    this.playerVelocity.dy = move.dy * effectiveSpeed;

    this.playerPos.x = Math.min(
      Math.max(this.playerPos.x + this.playerVelocity.dx * dt, ARENA_BOUNDS.minX),
      ARENA_BOUNDS.maxX
    );
    this.playerPos.y = Math.min(
      Math.max(this.playerPos.y + this.playerVelocity.dy * dt, ARENA_BOUNDS.minY),
      ARENA_BOUNDS.maxY
    );

    this.playerVisual.root.position.set(this.playerPos.x, 0, -this.playerPos.y);
    this.playerXPBar.sprite.position.set(this.playerPos.x, 44, -this.playerPos.y - 8);
    this.playerXPBar.tick(dt);
    this.playerLight.position.set(this.playerPos.x, 48, -this.playerPos.y);

    // 2. Medición espacial sin sqrt innecesarios y actualización del Índice de Estrés en vivo
    let nearestDistSq = 999 * 999;
    let dangerCount = 0;
    let panicCount = 0;
    const dangerSq = 120 * 120;
    const panicSq = 68 * 68;
    const px = this.playerPos.x;
    const py = this.playerPos.y;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      const dx = e.pos.x - px;
      const dy = e.pos.y - py;
      const dSq = dx * dx + dy * dy;
      if (dSq < nearestDistSq) nearestDistSq = dSq;
      if (dSq < dangerSq) dangerCount += 1;
      if (dSq < panicSq) panicCount += 1;
    }
    const nearestDist = Math.sqrt(nearestDistSq);

    const stressValue = this.stressTracker.update({
      dt,
      moveVector: move,
      playerHPNormalized: this.playerHP / this.playerMaxHP,
      nearestEnemyDistance: nearestDist,
      enemiesInsideDangerRing: dangerCount,
      enemiesInsidePanicRing: panicCount,
      justTookDamage: this.justTookDamageFlag
    });
    this.justTookDamageFlag = false;

    // Registrar métricas en el tramo temporal activo
    const activePhaseDef = CAMPAIGN_PHASES[this.currentPhaseIndex] || CAMPAIGN_PHASES[0];
    const pStat = this.phaseStats[activePhaseDef.id];
    if (pStat) {
      pStat.entered = true;
      pStat.survivedSeconds = Math.min(40.0, Math.max(0, this.elapsedTime - activePhaseDef.startSec));
      pStat.stressIntegral += stressValue * dt;
      pStat.sampleTime += dt;
      pStat.peakStress = Math.max(pStat.peakStress, stressValue);
    }

    const newTier = stressTierFromIndex(stressValue);
    if (newTier.rawValue > this.previousStressTier.rawValue) {
      this.audio?.triggerStressTierUp(newTier.rawValue);
    }
    this.previousStressTier = newTier;

    // 3. Evaluación del motor de IA + Adaptación Bidireccional en Vivo (+Enemigos si vas muy bien, -Enemigos si vas mal)
    const rawDirective = this.waveDirector.evaluate({
      dt,
      elapsedTime: this.elapsedTime,
      stressIndex: stressValue,
      stressTier: newTier,
      playerHPNormalized: this.playerHP / this.playerMaxHP,
      playerVelocity: this.playerVelocity,
      activeEnemyCount: this.enemies.length,
      activeMedkitCount: this.medkits.length
    });

    this.aiRescueMedkitTimer = Math.max(0, this.aiRescueMedkitTimer - dt);
    const hpRatio = this.playerHP / Math.max(1, this.playerMaxHP);
    const moveMag = Math.hypot(this.playerVelocity.dx, this.playerVelocity.dy);
    const escapeAngle = moveMag > 12.0 ? Math.atan2(this.playerVelocity.dy, this.playerVelocity.dx) : null;

    let spawnIntervalMult = 1.0;
    let maxEnemiesMult = 1.0;
    let speedMult = 1.0;
    let extraDoubleSpawn = false;
    let forceRescueMedkit = false;
    let safeAngle = rawDirective.safeEscapeCenterAngle;
    let safeCone = rawDirective.safeEscapeHalfConeRadians;
    let suppressLunges = rawDirective.suppressSimultaneousLunges;

    if (this.activeBoss) {
      if (hpRatio <= 0.35 || stressValue >= 78) {
        speedMult = 0.86;
        if (this.medkits.length < 2 && this.aiRescueMedkitTimer <= 0) {
          forceRescueMedkit = true;
          this.aiRescueMedkitTimer = 7.5;
        }
        this.currentAiState = {
          mode: 'rescue',
          badge: '❤️ AYUDA IA',
          text: 'Jefe frenado + Botiquín de ayuda',
          color: RELICARIO_PALETTE.graceJade,
          spawnMult: 0
        };
      } else {
        this.currentAiState = {
          mode: 'boss',
          badge: '💀 DUELO JEFE',
          text: 'Horda pausada hasta derrotar al Jefe',
          color: this.activeBoss.color || RELICARIO_PALETTE.vermilion,
          spawnMult: 0
        };
      }
    } else if (hpRatio <= 0.34 || stressValue >= 74 || panicCount >= 3) {
      // VAS MAL / EN APUROS -> La IA frena drásticamente la llegada de enemigos y te ayuda
      spawnIntervalMult = 2.15;
      maxEnemiesMult = 0.54;
      speedMult = 0.82;
      safeAngle = escapeAngle;
      safeCone = Math.PI * 0.28;
      suppressLunges = true;
      if (this.medkits.length < 3 && this.aiRescueMedkitTimer <= 0) {
        forceRescueMedkit = true;
        this.aiRescueMedkitTimer = 6.5;
      }
      this.currentAiState = {
        mode: 'rescue',
        badge: '▼▼ MUY POCOS ENEMIGOS',
        text: 'En apuros · La IA frena la horda y envía curas',
        color: RELICARIO_PALETTE.graceJade,
        spawnMult: 0.45
      };
    } else if (hpRatio <= 0.52 || stressValue >= 56 || dangerCount >= 4) {
      // MUCHA PRESIÓN -> La IA reduce enemigos para darte aire
      spawnIntervalMult = 1.48;
      maxEnemiesMult = 0.74;
      speedMult = 0.90;
      safeAngle = escapeAngle;
      safeCone = Math.PI * 0.22;
      suppressLunges = true;
      this.currentAiState = {
        mode: 'relief',
        badge: '▼ MENOS ENEMIGOS',
        text: 'Mucha presión · La IA reduce enemigos',
        color: RELICARIO_PALETTE.coldSilver,
        spawnMult: 0.7
      };
    } else if (stressValue < 36 && hpRatio >= 0.74 && panicCount === 0) {
      // VAS MUY BIEN / SOBRADO -> La IA envía más enemigos para mantener la emoción
      spawnIntervalMult = 0.62;
      maxEnemiesMult = 1.28;
      speedMult = 1.12;
      extraDoubleSpawn = this.enemies.length < 14;
      this.currentAiState = {
        mode: 'push',
        badge: '▲ +ENEMIGOS',
        text: 'Vas muy bien · La IA envía más enemigos',
        color: RELICARIO_PALETTE.emberOrange,
        spawnMult: 1.5
      };
    } else {
      // RITMO EQUILIBRADO
      this.currentAiState = {
        mode: 'balanced',
        badge: '● EQUILIBRADO',
        text: 'Ritmo ideal · Horda estable',
        color: RELICARIO_PALETTE.liturgicalGold,
        spawnMult: 1.0
      };
    }

    const directive = {
      ...rawDirective,
      spawnInterval: Math.max(0.09, rawDirective.spawnInterval * spawnIntervalMult),
      maxActiveEnemies: Math.max(10, Math.round(rawDirective.maxActiveEnemies * maxEnemiesMult)),
      enemySpeedMultiplier: rawDirective.enemySpeedMultiplier * speedMult,
      safeEscapeCenterAngle: safeAngle,
      safeEscapeHalfConeRadians: safeCone,
      suppressSimultaneousLunges: suppressLunges,
      spawnEmergencyMedkit: rawDirective.spawnEmergencyMedkit || forceRescueMedkit,
      medkitBiasAhead: rawDirective.medkitBiasAhead || forceRescueMedkit
    };
    this.lastDirective = directive;

    if (directive.spawnEmergencyMedkit) {
      this.#spawnMedkit(directive.medkitBiasAhead);
    }

    // 4. Mientras haya un Boss activo NO salen enemigos normales
    if (!this.activeBoss) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.enemies.length < directive.maxActiveEnemies) {
        this.#spawnEnemy(directive);
        if (extraDoubleSpawn && this.enemies.length < directive.maxActiveEnemies) {
          this.#spawnEnemy(directive);
        }
        this.spawnTimer = directive.spawnInterval;
      }
    }

    // 5. Auto-disparo y animación 3D del avatar
    const aimAngle = this.#updateAutoFire(dt);
    this.playerVisual.updateMotionAndAim(
      this.playerVelocity.dx,
      this.playerVelocity.dy,
      aimAngle,
      dt,
      this.elapsedTime
    );

    // 6. Proyectiles, Jefe, criaturas, proyectiles hostiles y curas
    this.#updateProjectiles(dt);
    this.#updateBoss(dt, directive);
    if (this.hasEnded) return;
    this.#updateEnemies(dt, directive);
    if (this.hasEnded) return;
    this.#updateEnemyProjectiles(dt);
    if (this.hasEnded) return;
    this.#updateMedkits(dt);

    // 7. Animación de cenizas y seguimiento suave de cámara
    this.#animateAmbientEmbers(dt);
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    }
    this.#updateCamera(dt * 7.5);

    // 8. Publicar telemetría HUD a ~20 Hz
    this.hudPublishTimer -= dt;
    if (this.hudPublishTimer <= 0) {
      this.hudPublishTimer = 0.05;
      this.#publishHUDNow(directive);
    }
  }

  #updateCamera(lerpFactor) {
    const aspect = this.camera.aspect || 1;
    const isPortrait = aspect < 0.92;
    const camHeight = isPortrait ? 375 : 375;
    const camBackZ = isPortrait ? 235 : 235;
    const lookBiasZ = isPortrait ? -22 : -10;

    let shakeX = 0;
    let shakeZ = 0;
    if (this.shakeTimer > 0) {
      const strength = this.shakeAmplitude * (this.shakeTimer / 0.16);
      shakeX = (Math.random() * 2 - 1) * strength;
      shakeZ = (Math.random() * 2 - 1) * strength;
    }

    this._desiredTarget.set(
      this.playerPos.x * 0.58 + shakeX,
      12,
      -this.playerPos.y * 0.62 + lookBiasZ + shakeZ
    );
    this._desiredCamPos.set(
      this.playerPos.x * 0.58 + shakeX,
      camHeight,
      -this.playerPos.y * 0.62 + camBackZ + shakeZ
    );

    const alpha = Math.min(1, Math.max(0.08, lerpFactor));
    this.cameraLookTarget.lerp(this._desiredTarget, alpha);
    this.camera.position.lerp(this._desiredCamPos, alpha);
    this.camera.lookAt(this.cameraLookTarget);
  }

  #animateAmbientEmbers(dt) {
    if (!this.emberPoints) return;
    const attr = this.emberPoints.geometry.getAttribute('position');
    const arr = attr.array;
    const rise = dt * 18;
    for (let i = 1; i < arr.length; i += 3) {
      let y = arr[i] + rise;
      if (y > 140) y = 4;
      arr[i] = y;
    }
    attr.needsUpdate = true;
  }

  // MARK: - Auto-Disparo y Proyectiles

  #updateAutoFire(dt) {
    this.fireTimer -= dt;
    const target = this.#closestEnemy(440);
    if (!target) return null;

    const angle = Math.atan2(target.pos.y - this.playerPos.y, target.pos.x - this.playerPos.x);
    if (this.fireTimer > 0) return angle;

    const rateDivisor = 1.0 + this.upgradeStats.rateBonus;
    this.fireTimer = Math.max(0.068, 0.22 / rateDivisor);

    const damage = Number((1.15 * (1.0 + this.upgradeStats.dmgBonus)).toFixed(2));

    const guaranteedExtra = Math.floor(this.upgradeStats.extraShots);
    const fractionalExtra = this.upgradeStats.extraShots - guaranteedExtra;
    const bonusShot = Math.random() < fractionalExtra ? 1 : 0;
    const totalShots = Math.min(7, 1 + guaranteedExtra + bonusShot);

    const spreadOffsets = [];
    if (totalShots === 1) {
      spreadOffsets.push(0.0);
    } else {
      const totalArc = Math.min(0.48, (totalShots - 1) * 0.095);
      const startArc = -totalArc * 0.5;
      const stepArc = totalArc / (totalShots - 1);
      for (let s = 0; s < totalShots; s++) {
        spreadOffsets.push(startArc + s * stepArc);
      }
    }

    const shardScale =
      3.8 *
      (1.0 + Math.min(0.45, this.upgradeStats.dmgBonus * 0.14) + this.upgradeStats.scaleBonus);
    const speed = 580.0 + this.upgradeStats.projSpeedBonus;
    const color =
      this.upgradeStats.dmgBonus >= 0.70
        ? this._colGold
        : this.upgradeStats.rateBonus >= 0.22 || this.upgradeStats.extraShots >= 0.5
          ? this._colColdSilver
          : this._colIvory;

    const guaranteedPierce = Math.floor(this.upgradeStats.pierceBonus);
    const fracPierce = this.upgradeStats.pierceBonus - guaranteedPierce;
    const pierceLeft = guaranteedPierce + (Math.random() < fracPierce ? 1 : 0);

    for (let i = 0; i < spreadOffsets.length; i++) {
      if (this.projectiles.length >= POOL_CAPS.PLAYER_PROJ) break;
      const shotAngle = angle + spreadOffsets[i];
      const cosA = Math.cos(shotAngle);
      const sinA = Math.sin(shotAngle);
      this.projectiles.push({
        x: this.playerPos.x + cosA * 14,
        y: this.playerPos.y + sinA * 14,
        dx: cosA * speed,
        dy: sinA * speed,
        angle: shotAngle,
        scale: shardScale,
        color,
        remainingLife: 1.08,
        damage,
        pierceLeft,
        lastHitEnemy: null
      });
    }

    this.audio?.triggerShoot();
    return angle;
  }

  #closestEnemy(maxRange) {
    let best = null;
    let bestDistSq = maxRange * maxRange;
    const px = this.playerPos.x;
    const py = this.playerPos.y;
    if (this.activeBoss) {
      const bdx = this.activeBoss.pos.x - px;
      const bdy = this.activeBoss.pos.y - py;
      const bdSq = bdx * bdx + bdy * bdy;
      if (bdSq < bestDistSq) {
        bestDistSq = bdSq;
        best = this.activeBoss;
      }
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      const dx = e.pos.x - px;
      const dy = e.pos.y - py;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = e;
      }
    }
    return best;
  }

  #updateProjectiles(dt) {
    const minX = ARENA_BOUNDS.minX - 40;
    const maxX = ARENA_BOUNDS.maxX + 40;
    const minY = ARENA_BOUNDS.minY - 40;
    const maxY = ARENA_BOUNDS.maxY + 40;

    let writeIdx = 0;
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      p.remainingLife -= dt;
      p.x += p.dx * dt;
      p.y += p.dy * dt;

      if (p.remainingLife <= 0 || p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) {
        continue;
      }

      const hitPadding = 6.5 + (p.damage - 1) * 1.1 + this.upgradeRanks.pierce * 1.2;

      // Impacto contra el Boss activo
      if (this.activeBoss && p.lastHitEnemy !== this.activeBoss) {
        const bdx = this.activeBoss.pos.x - p.x;
        const bdy = this.activeBoss.pos.y - p.y;
        const bRad = this.activeBoss.hitRadius + hitPadding;
        if (bdx * bdx + bdy * bdy <= bRad * bRad) {
          const bossRef = this.activeBoss;
          this.#applyHitToBoss(p.damage, p.dx, p.dy, p.x, p.y);
          if (p.pierceLeft > 0 && this.activeBoss) {
            p.pierceLeft -= 1;
            p.lastHitEnemy = bossRef;
            this.projectiles[writeIdx++] = p;
          }
          continue;
        }
      }

      let hitIdx = -1;
      for (let j = 0; j < this.enemies.length; j++) {
        const e = this.enemies[j];
        if (p.lastHitEnemy === e) continue;
        const dx = e.pos.x - p.x;
        const dy = e.pos.y - p.y;
        const rad = e.hitRadius + hitPadding;
        if (dx * dx + dy * dy <= rad * rad) {
          hitIdx = j;
          break;
        }
      }

      if (hitIdx >= 0) {
        const hitEnemyRef = this.enemies[hitIdx];
        this.#applyHitToEnemy(hitIdx, p.damage, p.dx, p.dy, p.x, p.y);
        if (p.pierceLeft > 0) {
          p.pierceLeft -= 1;
          p.lastHitEnemy = hitEnemyRef;
          this.projectiles[writeIdx++] = p;
        }
      } else {
        this.projectiles[writeIdx++] = p;
      }
    }
    this.projectiles.length = writeIdx;
  }

  #spawnBoss(bossNumber) {
    this.bossesSpawned = bossNumber;
    this.bossZones.length = 0;

    const BOSS_CATALOG = [
      {
        // 30s — Boss 1: Gólem Óseo de Fuego (Doble Salto Sísmico + Muro de Lava + Géiseres de Magma)
        title: 'COLOSO DE CENIZA',
        subtitle: 'Salto Sísmico, Muro de Lava y Géiseres',
        isFinal: false,
        baseHP: 260,
        speed: 70,
        hitRadius: 34,
        contactDamage: 18,
        xpReward: 95,
        color: RELICARIO_PALETTE.emberOrange
      },
      {
        // 60s — Boss 2: Ángel Caído de Cristal (Galaxia de 4 Aspas + Abanico de Plumas + Vuelo con Sellos)
        title: 'SERAFÍN CORRUPTO',
        subtitle: 'Galaxia Astral, Abanico y Sellos de Luz',
        isFinal: false,
        baseHP: 420,
        speed: 82,
        hitRadius: 33,
        contactDamage: 19,
        xpReward: 130,
        color: RELICARIO_PALETTE.coldSilver
      },
      {
        // 90s — Boss 3: Verdugo Abisal (Reloj de Espadas + Jaula Octogonal + Vórtice Segador)
        title: 'INQUISIDOR ABISAL',
        subtitle: 'Reloj de Espadas, Jaula y Vórtice',
        isFinal: false,
        baseHP: 600,
        speed: 86,
        hitRadius: 35,
        contactDamage: 20,
        xpReward: 175,
        color: '#A855F7'
      },
      {
        // 1:59 (119s) — JEFE FINAL: Catedral Viviente (Galaxia Inversa + Cruz Catedralicia + Sellos + Carga)
        title: 'EL RELICARIO ETERNO',
        subtitle: 'JEFE FINAL · DERRÓTALO PARA GANAR',
        isFinal: true,
        baseHP: 960,
        speed: 92,
        hitRadius: 42,
        contactDamage: 22,
        xpReward: 350,
        color: '#FACC15'
      }
    ];
    const cfg = BOSS_CATALOG[Math.min(BOSS_CATALOG.length - 1, bossNumber - 1)];

    // Despejar la arena de enemigos menores para que sea un duelo puro contra el Boss
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      this.#spawnBurst(e.pos.x, e.pos.y, RELICARIO_PALETTE.oldBone, 5, 90);
    }
    this.enemies.length = 0;
    this.enemyProjectiles.length = 0;

    // Aparecer en el extremo opuesto al jugador dentro de la arena
    const spawnX = this.playerPos.x > 0 ? -105 : 105;
    const spawnY = this.playerPos.y > 0 ? -155 : 155;
    const lvlBonus = Math.max(0, this.playerLevel - 1) * (cfg.isFinal ? 55 : 32);
    const maxHP = Math.round(cfg.baseHP + lvlBonus);

    this.activeBoss = {
      bossNumber,
      title: cfg.title,
      subtitle: cfg.subtitle,
      isFinal: cfg.isFinal,
      enraged: false,
      pos: { x: spawnX, y: spawnY },
      hp: maxHP,
      maxHP,
      baseSpeed: cfg.speed,
      hitRadius: cfg.hitRadius,
      contactDamage: cfg.contactDamage,
      xpReward: cfg.xpReward,
      color: cfg.color,
      age: 0,
      flashTimer: 0,
      attackTimer: 1.6,
      attackIndex: 0,
      subTimer: 0,
      subStep: 0,
      spiralAngle: 0,
      state: 'chasing',
      stateTimer: 0,
      dashVel: { dx: 0, dy: 0 },
      facingAngle: Math.atan2(this.playerPos.y - spawnY, this.playerPos.x - spawnX)
    };

    if (this.bossVisual) {
      this.bossVisual.root.visible = true;
      this.bossVisual.root.position.set(spawnX, 0, -spawnY);
      this.bossVisual.auraMat.color.set(cfg.color);
      for (const k of [1, 2, 3, 4]) {
        if (this.bossVisual.models[k]) {
          this.bossVisual.models[k].visible = k === bossNumber;
        }
      }
    }

    this.#spawnShockRing(spawnX, spawnY, cfg.color, cfg.isFinal ? 130 : 95);
    this.#spawnBurst(spawnX, spawnY, cfg.color, cfg.isFinal ? 32 : 22, 160);
    this.#spawnPopupText(
      cfg.isFinal ? `👑 ¡JEFE FINAL: ${cfg.title}!` : `💀 ¡${cfg.title}!`,
      spawnX,
      spawnY + 42,
      cfg.color
    );
    this.#triggerShake(cfg.isFinal ? 9.0 : 6.5);
    this.audio?.triggerLevelUp?.();
    this.#publishHUDNow(null);
  }

  #updateBoss(dt, directive) {
    const boss = this.activeBoss;
    if (!boss) {
      if (this.bossVisual && this.bossVisual.root.visible) {
        this.bossVisual.root.visible = false;
      }
      this.bossZones.length = 0;
      return;
    }

    boss.age += dt;
    if (boss.flashTimer > 0) {
      boss.flashTimer = Math.max(0, boss.flashTimer - dt);
    }

    // Fase 2 de Ira para el Jefe Final al bajar del 50% de vida
    if (boss.isFinal && !boss.enraged && boss.hp <= boss.maxHP * 0.5) {
      boss.enraged = true;
      boss.color = RELICARIO_PALETTE.vermilion;
      if (this.bossVisual) {
        this.bossVisual.auraMat.color.set(RELICARIO_PALETTE.vermilion);
      }
      this.#spawnShockRing(boss.pos.x, boss.pos.y, RELICARIO_PALETTE.vermilion, 135);
      this.#spawnBurst(boss.pos.x, boss.pos.y, RELICARIO_PALETTE.liturgicalGold, 28, 175);
      this.#spawnPopupText('🔥 ¡IRA DEL RELICARIO!', boss.pos.x, boss.pos.y + 48, RELICARIO_PALETTE.vermilion);
      this.#triggerShake(8.5);
    }

    // Actualizar zonas/sellos explosivos en el suelo (Boss 1 Géiseres, Boss 2 Sellos de Luz, Boss 4 Pilares)
    let zw = 0;
    for (let i = 0; i < this.bossZones.length; i++) {
      const z = this.bossZones[i];
      z.remaining -= dt;
      if (z.remaining <= 0) {
        const zColor = z.color || RELICARIO_PALETTE.vermilion;
        this.#spawnShockRing(z.x, z.y, zColor, z.radius * 1.18);
        this.#spawnBurst(z.x, z.y, RELICARIO_PALETTE.liturgicalGold, 15, 135);
        const pdx = this.playerPos.x - z.x;
        const pdy = this.playerPos.y - z.y;
        if (pdx * pdx + pdy * pdy <= z.radius * z.radius && this.invulnerabilityTimer <= 0 && !this.hasEnded) {
          this.#applyDamageToPlayer(18);
        }
        const shardCount = z.shards || 6;
        for (let k = 0; k < shardCount; k++) {
          if (this.enemyProjectiles.length >= POOL_CAPS.ENEMY_PROJ) break;
          const a = (k / shardCount) * Math.PI * 2 + z.angleOffset;
          this.enemyProjectiles.push({
            x: z.x + Math.cos(a) * 10,
            y: z.y + Math.sin(a) * 10,
            dx: Math.cos(a) * 215,
            dy: Math.sin(a) * 215,
            angle: a,
            remainingLife: 1.85,
            damage: 14
          });
        }
      } else {
        this.bossZones[zw++] = z;
      }
    }
    this.bossZones.length = zw;

    const toX = this.playerPos.x - boss.pos.x;
    const toY = this.playerPos.y - boss.pos.y;
    const dist = Math.max(0.001, Math.hypot(toX, toY));
    const dirX = toX / dist;
    const dirY = toY / dist;
    const angleToPlayer = Math.atan2(dirY, dirX);
    const enrageMult = boss.enraged ? 1.24 : 1.0;

    // -------------------------------------------------------------------------
    // PATRONES ÚNICOS MEJORADOS POR CADA UNO DE LOS 4 BOSSES
    // -------------------------------------------------------------------------
    if (boss.state === 'chasing') {
      boss.facingAngle = angleToPlayer;
      const moveSpeed = boss.baseSpeed * enrageMult * Math.min(1.2, directive?.enemySpeedMultiplier || 1.0);
      boss.pos.x += dirX * moveSpeed * dt;
      boss.pos.y += dirY * moveSpeed * dt;

      boss.attackTimer -= dt * enrageMult;
      if (boss.attackTimer <= 0) {
        if (boss.bossNumber === 1) {
          // BOSS 1: Coloso de Ceniza -> 3 patrones: (0) Salto Sísmico Doble Onda, (1) Muro de Lava con Hueco, (2) 3 Géiseres de Magma
          const pick = boss.attackIndex % 3;
          if (pick === 0) {
            boss.state = 'b1_quake_prep';
            boss.stateTimer = 0.62;
            boss.subStep = 0;
            boss.facingAngle = angleToPlayer;
            this.#spawnShockRing(boss.pos.x, boss.pos.y, RELICARIO_PALETTE.emberOrange, 68);
          } else if (pick === 1) {
            boss.state = 'b1_lava_wall';
            boss.stateTimer = 0.65;
            boss.subStep = 0;
            boss.facingAngle = angleToPlayer;
            this.#spawnShockRing(boss.pos.x, boss.pos.y, RELICARIO_PALETTE.liturgicalGold, 60);
          } else {
            boss.state = 'b1_geysers';
            boss.stateTimer = 0.55;
            for (let g = 0; g < 3; g++) {
              const a = angleToPlayer + (g - 1) * 0.65;
              const d = g === 1 ? Math.min(145, dist) : 85;
              const gx = Math.min(Math.max(boss.pos.x + Math.cos(a) * d, ARENA_BOUNDS.minX + 34), ARENA_BOUNDS.maxX - 34);
              const gy = Math.min(Math.max(boss.pos.y + Math.sin(a) * d, ARENA_BOUNDS.minY + 34), ARENA_BOUNDS.maxY - 34);
              this.bossZones.push({
                x: gx,
                y: gy,
                radius: 40,
                remaining: 0.85 + g * 0.14,
                maxTime: 0.85 + g * 0.14,
                angleOffset: g * 0.5,
                shards: 6,
                color: RELICARIO_PALETTE.emberOrange
              });
            }
            this.#spawnShockRing(boss.pos.x, boss.pos.y, RELICARIO_PALETTE.emberOrange, 72);
          }
        } else if (boss.bossNumber === 2) {
          // BOSS 2: Serafín Corrupto -> 3 patrones: (0) Galaxia Molinete 4 Aspas, (1) Péndulo de Plumas, (2) Vuelo Valquiria con Sellos
          const pick = boss.attackIndex % 3;
          if (pick === 0) {
            boss.state = 'b2_spiral';
            boss.stateTimer = 1.28;
            boss.subTimer = 0;
            boss.spiralAngle = angleToPlayer;
            this.#spawnShockRing(boss.pos.x, boss.pos.y, RELICARIO_PALETTE.coldSilver, 68);
          } else if (pick === 1) {
            boss.state = 'b2_pendulum';
            boss.stateTimer = 0.90;
            boss.subTimer = 0;
            boss.subStep = 0;
            boss.facingAngle = angleToPlayer;
            this.#spawnShockRing(boss.pos.x, boss.pos.y, RELICARIO_PALETTE.liturgicalGold, 64);
          } else {
            boss.state = 'b2_dash_prep';
            boss.stateTimer = 0.48;
            boss.subStep = 0;
            boss.facingAngle = angleToPlayer;
            this.#spawnShockRing(boss.pos.x, boss.pos.y, RELICARIO_PALETTE.graceJade, 62);
          }
        } else if (boss.bossNumber === 3) {
          // BOSS 3: Inquisidor Abisal -> 3 patrones: (0) Reloj de 8 Espadas Espectrales, (1) Doble Jaula Octogonal, (2) Vórtice Segador
          const pick = boss.attackIndex % 3;
          if (pick === 0) {
            boss.state = 'b3_sword_clock';
            boss.stateTimer = 0.96;
            boss.subTimer = 0;
            boss.subStep = 0;
            this.#spawnShockRing(boss.pos.x, boss.pos.y, '#A855F7', 72);
          } else if (pick === 1) {
            boss.state = 'b3_cross_waves';
            boss.stateTimer = 0.78;
            boss.subStep = 0;
            this.#spawnShockRing(boss.pos.x, boss.pos.y, '#A855F7', 68);
          } else {
            boss.state = 'b3_whirlwind';
            boss.stateTimer = 1.40;
            boss.subTimer = 0;
            this.#spawnShockRing(boss.pos.x, boss.pos.y, RELICARIO_PALETTE.vermilion, 74);
          }
        } else {
          // BOSS 4 (JEFE FINAL): El Relicario Eterno -> 4 patrones épicos
          const pick = boss.attackIndex % 4;
          if (pick === 0) {
            boss.state = 'b4_judgment';
            boss.stateTimer = 1.35;
            boss.subTimer = 0;
            boss.spiralAngle = angleToPlayer;
            this.#spawnShockRing(boss.pos.x, boss.pos.y, '#FACC15', 90);
          } else if (pick === 1) {
            boss.state = 'b4_pillars';
            boss.stateTimer = 0.58;
            const count = boss.enraged ? 5 : 4;
            for (let z = 0; z < count; z++) {
              const a = (z / count) * Math.PI * 2 + boss.age;
              const distZ = z === 0 ? 16 : 82;
              const zx = Math.min(Math.max(this.playerPos.x + Math.cos(a) * distZ, ARENA_BOUNDS.minX + 34), ARENA_BOUNDS.maxX - 34);
              const zy = Math.min(Math.max(this.playerPos.y + Math.sin(a) * distZ, ARENA_BOUNDS.minY + 34), ARENA_BOUNDS.maxY - 34);
              this.bossZones.push({
                x: zx,
                y: zy,
                radius: 44,
                remaining: 0.85 + z * 0.08,
                maxTime: 0.85 + z * 0.08,
                angleOffset: z * 0.4,
                shards: 6,
                color: '#FACC15'
              });
            }
            this.#spawnShockRing(boss.pos.x, boss.pos.y, RELICARIO_PALETTE.vermilion, 84);
          } else if (pick === 2) {
            boss.state = 'b4_cross_laser';
            boss.stateTimer = 1.15;
            boss.subTimer = 0;
            boss.spiralAngle = angleToPlayer;
            this.#spawnShockRing(boss.pos.x, boss.pos.y, '#FACC15', 86);
          } else {
            boss.state = 'b4_apocalypse_prep';
            boss.stateTimer = 0.55;
            boss.subTimer = 0;
            boss.facingAngle = angleToPlayer;
            this.#spawnShockRing(boss.pos.x, boss.pos.y, '#FACC15', 84);
          }
        }
        boss.attackIndex += 1;
      }
    }
    // --- ATAQUES BOSS 1 (COLOSO DE CENIZA) ---
    else if (boss.state === 'b1_quake_prep') {
      if (boss.stateTimer > 0.18) boss.facingAngle = angleToPlayer;
      boss.stateTimer -= dt;
      if (boss.stateTimer <= 0) {
        boss.dashVel.dx = Math.cos(boss.facingAngle) * 375;
        boss.dashVel.dy = Math.sin(boss.facingAngle) * 375;
        boss.state = 'b1_quake_leap';
        boss.stateTimer = 0.38;
      }
    } else if (boss.state === 'b1_quake_leap') {
      boss.pos.x += boss.dashVel.dx * dt;
      boss.pos.y += boss.dashVel.dy * dt;
      boss.stateTimer -= dt;
      if (boss.stateTimer <= 0) {
        // Impacto sísmico doble onda: corona interior rápida (8 rocas) + corona exterior desplazada (8 rocas)
        this.#spawnShockRing(boss.pos.x, boss.pos.y, RELICARIO_PALETTE.emberOrange, 102);
        this.#spawnShockRing(boss.pos.x, boss.pos.y, RELICARIO_PALETTE.liturgicalGold, 66);
        this.#triggerShake(6.5);
        for (let ring = 0; ring < 2; ring++) {
          const spd = ring === 0 ? 225 : 155;
          const rotOffset = ring * (Math.PI / 8);
          for (let i = 0; i < 8; i++) {
            if (this.enemyProjectiles.length >= POOL_CAPS.ENEMY_PROJ) break;
            const a = (i / 8) * Math.PI * 2 + boss.facingAngle + rotOffset;
            this.enemyProjectiles.push({
              x: boss.pos.x + Math.cos(a) * 24,
              y: boss.pos.y + Math.sin(a) * 24,
              dx: Math.cos(a) * spd,
              dy: Math.sin(a) * spd,
              angle: a,
              remainingLife: 2.2,
              damage: 15
            });
          }
        }
        boss.state = 'chasing';
        boss.attackTimer = 1.95;
      }
    } else if (boss.state === 'b1_lava_wall') {
      boss.facingAngle = angleToPlayer;
      boss.stateTimer -= dt;
      if (boss.subStep === 0 && boss.stateTimer <= 0.35) {
        boss.subStep = 1;
        // Muro ancho de 9 rocas de lava con un hueco de 2 posiciones para esquivar
        const count = 9;
        const arc = 1.55;
        const gapCenter = 2 + Math.floor(Math.random() * 5);
        for (let i = 0; i < count; i++) {
          if (Math.abs(i - gapCenter) <= 0) continue;
          if (this.enemyProjectiles.length >= POOL_CAPS.ENEMY_PROJ) break;
          const a = angleToPlayer - arc * 0.5 + (i / (count - 1)) * arc;
          this.enemyProjectiles.push({
            x: boss.pos.x + Math.cos(a) * 26,
            y: boss.pos.y + Math.sin(a) * 26,
            dx: Math.cos(a) * 235,
            dy: Math.sin(a) * 235,
            angle: a,
            remainingLife: 2.3,
            damage: 14
          });
        }
      }
      if (boss.stateTimer <= 0) {
        // Segunda minifila central de 3 brasas
        for (let i = -1; i <= 1; i++) {
          if (this.enemyProjectiles.length >= POOL_CAPS.ENEMY_PROJ) break;
          const a = angleToPlayer + i * 0.24;
          this.enemyProjectiles.push({
            x: boss.pos.x + Math.cos(a) * 26,
            y: boss.pos.y + Math.sin(a) * 26,
            dx: Math.cos(a) * 260,
            dy: Math.sin(a) * 260,
            angle: a,
            remainingLife: 2.1,
            damage: 14
          });
        }
        boss.state = 'chasing';
        boss.attackTimer = 1.85;
      }
    } else if (boss.state === 'b1_geysers') {
      boss.facingAngle = angleToPlayer;
      boss.stateTimer -= dt;
      if (boss.stateTimer <= 0) {
        boss.state = 'chasing';
        boss.attackTimer = 1.85;
      }
    }
    // --- ATAQUES BOSS 2 (SERAFÍN CORRUPTO) ---
    else if (boss.state === 'b2_spiral') {
      boss.stateTimer -= dt;
      boss.subTimer -= dt;
      if (boss.subTimer <= 0) {
        boss.subTimer = 0.11;
        boss.spiralAngle += 0.36;
        // Galaxia molinete de 4 brazos simétricos
        for (let arm = 0; arm < 4; arm++) {
          if (this.enemyProjectiles.length >= POOL_CAPS.ENEMY_PROJ) break;
          const a = boss.spiralAngle + arm * (Math.PI * 0.5);
          this.enemyProjectiles.push({
            x: boss.pos.x + Math.cos(a) * 22,
            y: boss.pos.y + Math.sin(a) * 22,
            dx: Math.cos(a) * 245,
            dy: Math.sin(a) * 245,
            angle: a,
            remainingLife: 2.2,
            damage: 14
          });
        }
      }
      if (boss.stateTimer <= 0) {
        boss.state = 'chasing';
        boss.attackTimer = 1.85;
      }
    } else if (boss.state === 'b2_pendulum') {
      boss.facingAngle = angleToPlayer;
      boss.stateTimer -= dt;
      boss.subTimer -= dt;
      if (boss.subTimer <= 0 && boss.subStep < 3) {
        boss.subTimer = 0.25;
        const shift = (boss.subStep - 1) * 0.14;
        const count = 6;
        const arc = 0.96;
        this.#spawnShockRing(boss.pos.x, boss.pos.y, RELICARIO_PALETTE.coldSilver, 54);
        for (let i = 0; i < count; i++) {
          if (this.enemyProjectiles.length >= POOL_CAPS.ENEMY_PROJ) break;
          const a = angleToPlayer + shift - arc * 0.5 + (i / (count - 1)) * arc;
          this.enemyProjectiles.push({
            x: boss.pos.x + Math.cos(a) * 24,
            y: boss.pos.y + Math.sin(a) * 24,
            dx: Math.cos(a) * 265,
            dy: Math.sin(a) * 265,
            angle: a,
            remainingLife: 2.1,
            damage: 14
          });
        }
        boss.subStep += 1;
      }
      if (boss.stateTimer <= 0) {
        boss.state = 'chasing';
        boss.attackTimer = 1.8;
      }
    } else if (boss.state === 'b2_dash_prep') {
      if (boss.stateTimer > 0.14) boss.facingAngle = angleToPlayer;
      boss.stateTimer -= dt;
      if (boss.stateTimer <= 0) {
        // Deja un sello de luz de jade explosivo donde despega
        this.bossZones.push({
          x: boss.pos.x,
          y: boss.pos.y,
          radius: 38,
          remaining: 0.78,
          maxTime: 0.78,
          angleOffset: boss.facingAngle,
          shards: 6,
          color: RELICARIO_PALETTE.graceJade
        });
        boss.dashVel.dx = Math.cos(boss.facingAngle) * 445;
        boss.dashVel.dy = Math.sin(boss.facingAngle) * 445;
        boss.state = 'b2_dashing';
        boss.stateTimer = 0.34;
      }
    } else if (boss.state === 'b2_dashing') {
      boss.pos.x += boss.dashVel.dx * dt;
      boss.pos.y += boss.dashVel.dy * dt;
      this.#spawnGhostTrail(boss.pos.x, boss.pos.y, boss.facingAngle);
      boss.stateTimer -= dt;
      if (boss.stateTimer <= 0) {
        if (boss.subStep === 0) {
          boss.subStep = 1;
          boss.state = 'b2_dash_prep';
          boss.stateTimer = 0.30;
          boss.facingAngle = angleToPlayer;
        } else {
          boss.state = 'chasing';
          boss.attackTimer = 1.85;
        }
      }
    }
    // --- ATAQUES BOSS 3 (INQUISIDOR ABISAL) ---
    else if (boss.state === 'b3_sword_clock') {
      boss.facingAngle = angleToPlayer;
      boss.stateTimer -= dt;
      boss.subTimer -= dt;
      // Invoca 8 espadas orbitales en círculo que disparan una tras otra hacia el jugador
      if (boss.subTimer <= 0 && boss.subStep < 8) {
        boss.subTimer = 0.10;
        const orbitAngle = (boss.subStep / 8) * Math.PI * 2;
        const sx = boss.pos.x + Math.cos(orbitAngle) * 34;
        const sy = boss.pos.y + Math.sin(orbitAngle) * 34;
        const aim = Math.atan2(this.playerPos.y - sy, this.playerPos.x - sx);
        this.#spawnBurst(sx, sy, '#A855F7', 5, 80);
        if (this.enemyProjectiles.length < POOL_CAPS.ENEMY_PROJ) {
          this.enemyProjectiles.push({
            x: sx,
            y: sy,
            dx: Math.cos(aim) * 295,
            dy: Math.sin(aim) * 295,
            angle: aim,
            remainingLife: 2.2,
            damage: 15
          });
        }
        boss.subStep += 1;
      }
      if (boss.stateTimer <= 0) {
        boss.state = 'chasing';
        boss.attackTimer = 1.85;
      }
    } else if (boss.state === 'b3_cross_waves') {
      boss.stateTimer -= dt;
      if (boss.subStep === 0 && boss.stateTimer <= 0.42) {
        boss.subStep = 1;
        this.#spawnShockRing(boss.pos.x, boss.pos.y, '#A855F7', 74);
        for (let i = 0; i < 10; i++) {
          if (this.enemyProjectiles.length >= POOL_CAPS.ENEMY_PROJ) break;
          const a = (i / 10) * Math.PI * 2;
          this.enemyProjectiles.push({
            x: boss.pos.x + Math.cos(a) * 24,
            y: boss.pos.y + Math.sin(a) * 24,
            dx: Math.cos(a) * 255,
            dy: Math.sin(a) * 255,
            angle: a,
            remainingLife: 2.1,
            damage: 15
          });
        }
      }
      if (boss.stateTimer <= 0) {
        this.#spawnShockRing(boss.pos.x, boss.pos.y, RELICARIO_PALETTE.vermilion, 80);
        for (let i = 0; i < 10; i++) {
          if (this.enemyProjectiles.length >= POOL_CAPS.ENEMY_PROJ) break;
          const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
          this.enemyProjectiles.push({
            x: boss.pos.x + Math.cos(a) * 24,
            y: boss.pos.y + Math.sin(a) * 24,
            dx: Math.cos(a) * 255,
            dy: Math.sin(a) * 255,
            angle: a,
            remainingLife: 2.1,
            damage: 15
          });
        }
        boss.state = 'chasing';
        boss.attackTimer = 1.85;
      }
    } else if (boss.state === 'b3_whirlwind') {
      boss.facingAngle = angleToPlayer;
      const rushSpeed = boss.baseSpeed * 1.68;
      boss.pos.x += dirX * rushSpeed * dt;
      boss.pos.y += dirY * rushSpeed * dt;
      boss.stateTimer -= dt;
      boss.subTimer -= dt;
      if (boss.subTimer <= 0) {
        boss.subTimer = 0.18;
        const a = boss.age * 7.8;
        for (const offset of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
          if (this.enemyProjectiles.length >= POOL_CAPS.ENEMY_PROJ) break;
          const ang = a + offset;
          this.enemyProjectiles.push({
            x: boss.pos.x + Math.cos(ang) * 24,
            y: boss.pos.y + Math.sin(ang) * 24,
            dx: Math.cos(ang) * 235,
            dy: Math.sin(ang) * 235,
            angle: ang,
            remainingLife: 1.9,
            damage: 14
          });
        }
      }
      if (boss.stateTimer <= 0) {
        boss.state = 'chasing';
        boss.attackTimer = 1.85;
      }
    }
    // --- ATAQUES BOSS 4: JEFE FINAL (EL RELICARIO ETERNO) ---
    else if (boss.state === 'b4_judgment') {
      boss.facingAngle = angleToPlayer;
      boss.stateTimer -= dt;
      boss.subTimer -= dt;
      // Galaxia de 6 brazos que invierte su sentido de giro a mitad del ataque
      if (boss.subTimer <= 0) {
        boss.subTimer = 0.13;
        const dirSign = boss.stateTimer > 0.65 ? 1 : -1;
        boss.spiralAngle += 0.28 * dirSign;
        const arms = 6;
        for (let i = 0; i < arms; i++) {
          if (this.enemyProjectiles.length >= POOL_CAPS.ENEMY_PROJ) break;
          const a = boss.spiralAngle + (i / arms) * Math.PI * 2;
          this.enemyProjectiles.push({
            x: boss.pos.x + Math.cos(a) * 28,
            y: boss.pos.y + Math.sin(a) * 28,
            dx: Math.cos(a) * 235,
            dy: Math.sin(a) * 235,
            angle: a,
            remainingLife: 2.3,
            damage: 16
          });
        }
      }
      if (boss.stateTimer <= 0) {
        boss.state = 'chasing';
        boss.attackTimer = boss.enraged ? 1.35 : 1.75;
      }
    } else if (boss.state === 'b4_pillars') {
      boss.facingAngle = angleToPlayer;
      boss.stateTimer -= dt;
      if (boss.stateTimer <= 0) {
        boss.state = 'chasing';
        boss.attackTimer = boss.enraged ? 1.4 : 1.8;
      }
    } else if (boss.state === 'b4_cross_laser') {
      // Cruz Catedralicia rotatoria de 4 haces + lanzas dirigidas
      boss.facingAngle = angleToPlayer;
      boss.stateTimer -= dt;
      boss.subTimer -= dt;
      if (boss.subTimer <= 0) {
        boss.subTimer = 0.12;
        boss.spiralAngle += 0.22;
        for (let c = 0; c < 4; c++) {
          if (this.enemyProjectiles.length >= POOL_CAPS.ENEMY_PROJ) break;
          const a = boss.spiralAngle + c * (Math.PI * 0.5);
          this.enemyProjectiles.push({
            x: boss.pos.x + Math.cos(a) * 26,
            y: boss.pos.y + Math.sin(a) * 26,
            dx: Math.cos(a) * 265,
            dy: Math.sin(a) * 265,
            angle: a,
            remainingLife: 2.1,
            damage: 15
          });
        }
      }
      if (boss.stateTimer <= 0) {
        for (let i = -1; i <= 1; i++) {
          if (this.enemyProjectiles.length >= POOL_CAPS.ENEMY_PROJ) break;
          const a = angleToPlayer + i * 0.22;
          this.enemyProjectiles.push({
            x: boss.pos.x + Math.cos(a) * 28,
            y: boss.pos.y + Math.sin(a) * 28,
            dx: Math.cos(a) * 295,
            dy: Math.sin(a) * 295,
            angle: a,
            remainingLife: 2.2,
            damage: 16
          });
        }
        boss.state = 'chasing';
        boss.attackTimer = boss.enraged ? 1.35 : 1.75;
      }
    } else if (boss.state === 'b4_apocalypse_prep') {
      if (boss.stateTimer > 0.18) boss.facingAngle = angleToPlayer;
      boss.stateTimer -= dt;
      if (boss.stateTimer <= 0) {
        const dashSpeed = boss.enraged ? 465 : 420;
        boss.dashVel.dx = Math.cos(boss.facingAngle) * dashSpeed;
        boss.dashVel.dy = Math.sin(boss.facingAngle) * dashSpeed;
        boss.state = 'b4_apocalypse_rush';
        boss.stateTimer = 0.44;
        boss.subTimer = 0;
      }
    } else if (boss.state === 'b4_apocalypse_rush') {
      boss.pos.x += boss.dashVel.dx * dt;
      boss.pos.y += boss.dashVel.dy * dt;
      boss.stateTimer -= dt;
      boss.subTimer -= dt;
      // Lanza proyectiles laterales perpendiculares mientras embiste
      if (boss.subTimer <= 0) {
        boss.subTimer = 0.13;
        for (const side of [-Math.PI * 0.5, Math.PI * 0.5]) {
          if (this.enemyProjectiles.length >= POOL_CAPS.ENEMY_PROJ) break;
          const a = boss.facingAngle + side;
          this.enemyProjectiles.push({
            x: boss.pos.x + Math.cos(a) * 22,
            y: boss.pos.y + Math.sin(a) * 22,
            dx: Math.cos(a) * 235,
            dy: Math.sin(a) * 235,
            angle: a,
            remainingLife: 1.9,
            damage: 15
          });
        }
      }
      if (boss.stateTimer <= 0) {
        this.#spawnShockRing(boss.pos.x, boss.pos.y, RELICARIO_PALETTE.vermilion, 98);
        this.#triggerShake(6.5);
        boss.state = 'chasing';
        boss.attackTimer = boss.enraged ? 1.35 : 1.75;
      }
    }

    boss.pos.x = Math.min(Math.max(boss.pos.x, ARENA_BOUNDS.minX + 30), ARENA_BOUNDS.maxX - 30);
    boss.pos.y = Math.min(Math.max(boss.pos.y, ARENA_BOUNDS.minY + 30), ARENA_BOUNDS.maxY - 30);

    // Colisión por contacto del Boss con el jugador
    const pdx = this.playerPos.x - boss.pos.x;
    const pdy = this.playerPos.y - boss.pos.y;
    const hitDist = boss.hitRadius + 13;
    if (pdx * pdx + pdy * pdy <= hitDist * hitDist && this.invulnerabilityTimer <= 0 && !this.hasEnded) {
      this.#applyDamageToPlayer(boss.contactDamage);
    }

    // Animar el modelo 3D específico de cada Boss
    if (this.bossVisual) {
      const v = this.bossVisual;
      v.root.visible = true;
      v.root.position.set(boss.pos.x, 0, -boss.pos.y);
      v.body.rotation.y = boss.facingAngle + Math.PI * 0.5;
      v.body.position.y = Math.sin(boss.age * 4.0) * 2.2;

      const matInfo = v.mats[boss.bossNumber];
      if (matInfo) {
        matInfo.mat.emissive.set(boss.flashTimer > 0 ? '#FFFFFF' : matInfo.baseHex);
        matInfo.mat.emissiveIntensity = boss.flashTimer > 0 ? 1.45 : 0.78;
      }

      if (boss.bossNumber === 1) {
        v.parts.b1Hammers.rotation.y = boss.age * (boss.state === 'b1_quake_leap' ? 9.5 : 3.2);
        v.parts.b1Furnace.rotation.y = boss.age * 4.0;
        if (v.parts.b1ArmsGroup) {
          v.parts.b1ArmsGroup.rotation.x =
            boss.state === 'b1_quake_prep'
              ? -0.95
              : boss.state === 'b1_quake_leap'
                ? 0.72
                : Math.sin(boss.age * 5.2) * 0.22;
        }
      } else if (boss.bossNumber === 2) {
        const flap = Math.sin(boss.age * 9.5) * 0.44;
        v.parts.b2LeftWings.rotation.y = flap;
        v.parts.b2RightWings.rotation.y = -flap;
        v.parts.b2Ring1.rotation.x = boss.age * 2.6;
        v.parts.b2Ring1.rotation.y = boss.age * 1.8;
        v.parts.b2Ring2.rotation.z = -boss.age * 3.1;
        v.parts.b2Ring2.rotation.x = 0.6;
        if (v.parts.b2SunHalo) {
          v.parts.b2SunHalo.rotation.z = boss.age * 1.9;
        }
      } else if (boss.bossNumber === 3) {
        const spinRate = boss.state === 'b3_whirlwind' ? 12.5 : 4.2;
        v.parts.b3Scythes.rotation.y = boss.age * spinRate;
        if (v.parts.b3SwordsFan) {
          v.parts.b3SwordsFan.rotation.z = Math.sin(boss.age * 4.0) * 0.18;
          v.parts.b3SwordsFan.position.y = Math.sin(boss.age * 6.0) * 1.8;
        }
      } else if (boss.bossNumber === 4) {
        const rate = boss.enraged ? 2.1 : 1.0;
        v.parts.b4Heart.rotation.y = boss.age * 2.5 * rate;
        v.parts.b4Gyro1.rotation.x = boss.age * 1.9 * rate;
        v.parts.b4Gyro1.rotation.y = boss.age * 1.3 * rate;
        v.parts.b4Gyro2.rotation.z = -boss.age * 2.4 * rate;
        v.parts.b4Gyro2.rotation.x = 0.55;
        v.parts.b4Gyro3.rotation.y = boss.age * 3.2 * rate;
        v.parts.b4Gyro3.rotation.z = 0.75;
        v.parts.b4Pillars.rotation.y = -boss.age * 1.6 * rate;
        if (v.parts.b4CrownSpears) {
          v.parts.b4CrownSpears.rotation.y = boss.age * 2.4 * rate;
          v.parts.b4CrownSpears.position.y = Math.sin(boss.age * 5.0) * 2.0;
        }
      }

      const baseAura = boss.isFinal ? 52 : 40;
      v.auraRing.scale.setScalar(baseAura + Math.sin(boss.age * 6.0) * 4);
      if (v.innerAuraRing) {
        v.innerAuraRing.scale.setScalar(baseAura * 0.68 - Math.sin(boss.age * 6.0) * 2.5);
        v.innerAuraRing.rotation.z = -boss.age * 2.2;
      }
    }
  }

  #applyHitToBoss(damage, velDx, velDy, impactX, impactY) {
    const boss = this.activeBoss;
    if (!boss) return;

    boss.hp = Math.max(0, boss.hp - damage);
    boss.flashTimer = 0.07;
    this.#spawnBurst(impactX, impactY, boss.color, 6, 95);

    const velMag = Math.max(1, Math.hypot(velDx, velDy));
    const knock = (boss.isFinal ? 0.25 : 0.55) * (1.0 + this.upgradeStats.knockBonus);
    boss.pos.x += (velDx / velMag) * knock;
    boss.pos.y += (velDy / velMag) * knock;

    if (boss.hp <= 0) {
      this.#defeatBoss();
    }
  }

  #defeatBoss() {
    const boss = this.activeBoss;
    if (!boss) return;

    const bx = boss.pos.x;
    const by = boss.pos.y;
    const xpReward = boss.xpReward;
    const title = boss.title;
    const wasFinalBoss = boss.isFinal;

    this.activeBoss = null;
    this.bossZones.length = 0;
    if (this.bossVisual) {
      this.bossVisual.root.visible = false;
    }

    this.enemyProjectiles.length = 0;

    // Gran explosión de derrota del Boss
    this.#spawnShockRing(bx, by, RELICARIO_PALETTE.liturgicalGold, 130);
    this.#spawnShockRing(bx, by, RELICARIO_PALETTE.vermilion, 95);
    this.#spawnBurst(bx, by, RELICARIO_PALETTE.liturgicalGold, 36, 180);
    this.#triggerShake(9.5);

    this.#registerKill();

    // Si era el Jefe Final de 1:59, ¡victoria inmediata de la partida!
    if (wasFinalBoss) {
      this.elapsedTime = TOTAL_RUN_DURATION;
      this.phaseStats.director2026.survivedSeconds = 40.0;
      this.phaseStats.director2026.didSurvive = true;
      this.#finishRun(true);
      return;
    }

    this.#spawnPopupText(`★ ¡${title} DERROTADO! ★`, bx, by + 38, RELICARIO_PALETTE.liturgicalGold);

    // Botiquín garantizado en la posición donde cayó el Boss
    this.medkits.push({ pos: { x: bx, y: by }, age: 0 });

    this.#grantXP(xpReward);
    this.#publishHUDNow(null);
  }

  #applyHitToEnemy(index, damage, velDx, velDy, impactX, impactY) {
    const enemy = this.enemies[index];
    enemy.hp -= damage;

    const sparkColor =
      enemy.archetype === 'jaula' || enemy.archetype === 'coloso_menor'
        ? RELICARIO_PALETTE.oldBone
        : enemy.archetype === 'tejedor'
          ? RELICARIO_PALETTE.coldSilver
          : enemy.archetype === 'sombra'
            ? '#A855F7'
            : RELICARIO_PALETTE.vermilion;
    this.#spawnBurst(impactX, impactY, sparkColor, 5, 85);

    const velMag = Math.max(1, Math.hypot(velDx, velDy));
    const knockBoost = 1.0 + this.upgradeStats.knockBonus;
    const baseKnock =
      enemy.archetype === 'desollado'
        ? 4.8
        : enemy.archetype === 'jaula' || enemy.archetype === 'coloso_menor'
          ? 1.0
          : 3.5;
    const knock = baseKnock * knockBoost;
    enemy.pos.x += (velDx / velMag) * knock;
    enemy.pos.y += (velDy / velMag) * knock;
    enemy.flashTimer = 0.08;

    if (enemy.archetype === 'jaula') {
      const ratio = enemy.hp / Math.max(1, enemy.maxHP);
      let targetRibs;
      if (ratio <= 0.30) targetRibs = 0;
      else if (ratio > 0.78) targetRibs = 4;
      else if (ratio > 0.62) targetRibs = 3;
      else if (ratio > 0.45) targetRibs = 2;
      else targetRibs = 1;

      while (enemy.attachedRibs > targetRibs) {
        enemy.attachedRibs -= 1;
        this.#spawnDetachedRib(enemy.pos.x, enemy.pos.y, enemy.ribSpinAngle);
      }
      const lostCount = 4 - enemy.attachedRibs;
      enemy.ribSpinSpeed = 1.25 * (1.0 + lostCount * 0.48);
      if (enemy.attachedRibs === 0 && !enemy.isFrenzied) {
        enemy.isFrenzied = true;
      }
    }

    if (enemy.hp <= 0) {
      const deadX = enemy.pos.x;
      const deadY = enemy.pos.y;
      const deadArch = enemy.archetype;
      let deathColor = RELICARIO_PALETTE.vermilion;
      let count = 11;
      let xpValue = 10;
      if (deadArch === 'jaula') {
        deathColor = RELICARIO_PALETTE.liturgicalGold;
        count = 20;
        xpValue = 65;
        this.#triggerShake(4.5);
      } else if (deadArch === 'martir') {
        deathColor = RELICARIO_PALETTE.liturgicalGold;
        count = 15;
        xpValue = 28;
      } else if (deadArch === 'incensario') {
        deathColor = RELICARIO_PALETTE.emberOrange;
        count = 18;
        xpValue = 22;
      } else if (deadArch === 'tejedor') {
        deathColor = '#38BDF8';
        count = 15;
        xpValue = 30;
      } else if (deadArch === 'coloso_menor') {
        deathColor = RELICARIO_PALETTE.graceJade;
        count = 18;
        xpValue = 38;
      } else if (deadArch === 'sombra') {
        deathColor = '#A855F7';
        count = 15;
        xpValue = 32;
      }

      this.#spawnBurst(deadX, deadY, deathColor, count, 130);
      // Swap-and-pop O(1)
      const lastIdx = this.enemies.length - 1;
      if (index !== lastIdx) {
        this.enemies[index] = this.enemies[lastIdx];
      }
      this.enemies.pop();
      this.#registerKill();

      // Mecánica única de Incensario: explota en área al morir dañando a enemigos cercanos y al jugador si está pegado
      if (deadArch === 'incensario') {
        this.#detonateIncensario(deadX, deadY);
      }

      // Mecánica única de Coloso Menor: al morir se divide en 2 mini-Desollados rápidos
      if (deadArch === 'coloso_menor') {
        this.#splitColosoMenor(deadX, deadY);
      }

      // Mejora Nova Explosiva según su grado acumulado
      if (this.upgradeStats.novaDmg > 0) {
        this.#triggerDeathNova(deadX, deadY);
      }

      this.#grantXP(xpValue);
    }
  }

  #detonateIncensario(cx, cy) {
    const blastRad = 52;
    const blastRadSq = blastRad * blastRad;
    this.#spawnShockRing(cx, cy, RELICARIO_PALETTE.emberOrange, blastRad);
    this.#spawnBurst(cx, cy, RELICARIO_PALETTE.liturgicalGold, 14, 135);
    this.#triggerShake(4.0);

    // Daña al jugador solo si está dentro del radio corto de la explosión
    const pdx = this.playerPos.x - cx;
    const pdy = this.playerPos.y - cy;
    if (pdx * pdx + pdy * pdy <= blastRadSq && this.invulnerabilityTimer <= 0 && !this.hasEnded) {
      this.#applyDamageToPlayer(15);
    }

    // Daña también a otros enemigos cercanos (reacción en cadena divertida para el jugador)
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const dx = e.pos.x - cx;
      const dy = e.pos.y - cy;
      if (dx * dx + dy * dy <= blastRadSq) {
        e.hp -= 3.5;
        e.flashTimer = 0.09;
      }
    }
  }

  #splitColosoMenor(cx, cy) {
    this.#spawnShockRing(cx, cy, RELICARIO_PALETTE.graceJade, 44);
    for (const offsetSign of [-1, 1]) {
      if (this.enemies.length >= POOL_CAPS.DESOLLADO + POOL_CAPS.JAULA + POOL_CAPS.MARTIR) break;
      const ang = randomRange(0, Math.PI * 2);
      const sx = Math.min(Math.max(cx + Math.cos(ang) * 14 * offsetSign, ARENA_BOUNDS.minX), ARENA_BOUNDS.maxX);
      const sy = Math.min(Math.max(cy + Math.sin(ang) * 14 * offsetSign, ARENA_BOUNDS.minY), ARENA_BOUNDS.maxY);
      this.enemies.push({
        archetype: 'desollado',
        renderScale: 0.66,
        pos: { x: sx, y: sy },
        hp: 1.5,
        maxHP: 1.5,
        baseSpeed: 142,
        hitRadius: 9.5,
        contactDamage: 10,
        age: 0,
        phaseOffset: randomRange(0, Math.PI * 2),
        abilityCooldown: 1.6,
        abilityActiveTimer: 0,
        isSpitTelegraphing: false,
        comboDashUsed: false,
        stalkerPhase: { type: 'stalking', cooldown: 1.6 },
        facingAngle: Math.atan2(this.playerPos.y - sy, this.playerPos.x - sx),
        flashTimer: 0.1,
        isPouncing: false,
        attachedRibs: 0,
        ribSpinAngle: 0,
        ribSpinSpeed: 1.0,
        isFrenzied: false,
        spitPulse: 0,
        telegraphActive: false,
        telegraphDist: 0,
        haloSpin: 0
      });
    }
  }

  #registerKill() {
    this.kills += 1;
    const activePhase = CAMPAIGN_PHASES[this.currentPhaseIndex] || CAMPAIGN_PHASES[0];
    if (this.phaseStats[activePhase.id]) {
      this.phaseStats[activePhase.id].kills += 1;
    }
    const lsEvery = this.upgradeStats.lifeStealEveryKills;
    if (lsEvery > 0 && this.kills % lsEvery === 0 && this.playerHP < this.playerMaxHP) {
      const heal = this.upgradeStats.lifeStealAmount || 2;
      this.playerHP = Math.min(this.playerMaxHP, this.playerHP + heal);
      this.#spawnPopupText(`+${heal} HP`, this.playerPos.x, this.playerPos.y + 30, RELICARIO_PALETTE.graceJade);
    }
  }

  #triggerDeathNova(cx, cy) {
    if (this.upgradeStats.novaDmg <= 0) return;
    const radius = Math.min(165, 48 + this.upgradeStats.novaRadius);
    const radiusSq = radius * radius;
    const aoeDmg = this.upgradeStats.novaDmg;
    const bestNovaRarity = this.upgradeBestRarity.nova
      ? UPGRADE_RARITY_MAP[this.upgradeBestRarity.nova]
      : null;
    const ringColor = bestNovaRarity ? bestNovaRarity.color : RELICARIO_PALETTE.liturgicalGold;
    this.#spawnShockRing(cx, cy, ringColor, radius * 0.88);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const dx = e.pos.x - cx;
      const dy = e.pos.y - cy;
      const dSq = dx * dx + dy * dy;
      if (dSq <= radiusSq) {
        e.hp -= aoeDmg;
        e.flashTimer = 0.08;
        const d = Math.max(1, Math.sqrt(dSq));
        e.pos.x += (dx / d) * 10;
        e.pos.y += (dy / d) * 10;
        if (e.hp <= 0) {
          this.#spawnBurst(e.pos.x, e.pos.y, RELICARIO_PALETTE.emberOrange, 8, 110);
          const lastIdx = this.enemies.length - 1;
          if (i !== lastIdx) {
            this.enemies[i] = this.enemies[lastIdx];
          }
          this.enemies.pop();
          this.#registerKill();
        }
      }
    }
  }

  #grantXP(amount) {
    const effectiveXP = amount * (this.upgradeStats.xpMultiplier || 1.0);
    this.currentXP += effectiveXP;
    let didLevelUp = false;
    while (this.currentXP >= this.xpToNextLevel) {
      this.currentXP -= this.xpToNextLevel;
      this.playerLevel += 1;
      this.xpToNextLevel = xpRequiredForLevel(this.playerLevel);
      this.pendingLevelUps += 1;
      didLevelUp = true;
    }

    const progress = this.currentXP / Math.max(1, this.xpToNextLevel);
    this.playerXPBar.updateXP(progress, this.playerLevel, didLevelUp);

    if (didLevelUp) {
      if (this.playerHP < this.playerMaxHP) {
        this.playerHP = Math.min(this.playerMaxHP, this.playerHP + 12);
      }
      this.#spawnShockRing(this.playerPos.x, this.playerPos.y, RELICARIO_PALETTE.liturgicalGold, 48);
      this.#spawnBurst(this.playerPos.x, this.playerPos.y, RELICARIO_PALETTE.liturgicalGold, 14, 135);
      this.audio?.triggerLevelUp();
      if (!this.activeUpgradeDraft) {
        this.#openNextUpgradeDraft();
      } else {
        this.#publishHUDNow(null);
      }
    }
  }

  #rollUpgradeRarity() {
    // A medida que avanza la partida y el nivel, sube ligeramente la probabilidad de grados altos
    const progress = Math.min(1, this.elapsedTime / TOTAL_RUN_DURATION);
    const lvlFactor = Math.min(1, Math.max(0, (this.playerLevel - 2) / 7));
    const luck = Math.min(1, progress * 0.55 + lvlFactor * 0.45);

    const weights = UPGRADE_RARITIES.map((r) => {
      if (r.id === 'common') return Math.max(18, r.baseWeight - luck * 22);
      if (r.id === 'uncommon') return r.baseWeight + luck * 3;
      if (r.id === 'rare') return r.baseWeight + luck * 9;
      if (r.id === 'epic') return r.baseWeight + luck * 6.5;
      if (r.id === 'legendary') return r.baseWeight + luck * 4.5;
      return r.baseWeight;
    });

    const totalW = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * totalW;
    for (let i = 0; i < UPGRADE_RARITIES.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return UPGRADE_RARITIES[i];
    }
    return UPGRADE_RARITIES[0];
  }

  #openNextUpgradeDraft() {
    if (this.hasEnded || this.pendingLevelUps <= 0) return;

    const available = LEVEL_UPGRADES.filter((u) => (this.upgradeRanks[u.id] || 0) < u.maxRank);
    if (available.length === 0) {
      this.pendingLevelUps = 0;
      this.activeUpgradeDraft = null;
      this.onUpgradeDraftChange?.(null);
      return;
    }

    const pool = [...available];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }

    if (this.playerHP / this.playerMaxHP <= 0.45) {
      const vitIdx = pool.findIndex((u) => u.id === 'vitality');
      if (vitIdx > 2) {
        const [vit] = pool.splice(vitIdx, 1);
        pool.unshift(vit);
      }
    }

    const picked = pool.slice(0, 3).map((u) => {
      const rarity = this.#rollUpgradeRarity();
      const tierDef = u.tiers[rarity.id] || u.tiers.common;
      return {
        id: u.id,
        title: u.title,
        icon: u.icon,
        rarityId: rarity.id,
        rarityLabel: rarity.label,
        rarityOrder: rarity.order,
        color: rarity.color,
        bgTint: rarity.bgTint,
        borderTint: rarity.borderTint,
        glowTint: rarity.glowTint,
        shortTag: tierDef.shortTag,
        description: tierDef.description,
        tierData: tierDef,
        currentRank: this.upgradeRanks[u.id] || 0,
        nextRank: (this.upgradeRanks[u.id] || 0) + 1
      };
    });

    this.playerVelocity.dx = 0;
    this.playerVelocity.dy = 0;
    this.keysDown.clear();
    this.#releaseJoystick();
    this.enemyProjectiles.length = 0;

    this.activeUpgradeDraft = {
      level: this.playerLevel,
      options: picked
    };

    this.onUpgradeDraftChange?.(this.activeUpgradeDraft);
    this.#publishHUDNow(null);
  }

  selectUpgrade(upgradeId) {
    if (!this.activeUpgradeDraft) return;
    const chosenOpt = this.activeUpgradeDraft.options.find((o) => o.id === upgradeId);
    const def = LEVEL_UPGRADE_MAP[upgradeId];
    if (!def || !chosenOpt) return;

    const nextRank = Math.min(def.maxRank, (this.upgradeRanks[upgradeId] || 0) + 1);
    this.upgradeRanks[upgradeId] = nextRank;

    // Guardar la rareza más alta conseguida para colorear el icono en el HUD
    const prevBestId = this.upgradeBestRarity[upgradeId];
    const prevBestOrder = prevBestId ? (UPGRADE_RARITY_MAP[prevBestId]?.order || 0) : 0;
    if (chosenOpt.rarityOrder > prevBestOrder) {
      this.upgradeBestRarity[upgradeId] = chosenOpt.rarityId;
    }

    const t = chosenOpt.tierData;

    // Aplicar mejoras numéricas según el grado (Común, Poco común, Raro, Épico, Legendario)
    if (t.dmgBonus) this.upgradeStats.dmgBonus += t.dmgBonus;
    if (t.knockBonus) this.upgradeStats.knockBonus += t.knockBonus;
    if (t.rateBonus) this.upgradeStats.rateBonus += t.rateBonus;
    if (t.projSpeedBonus) this.upgradeStats.projSpeedBonus += t.projSpeedBonus;
    if (t.extraShots) this.upgradeStats.extraShots += t.extraShots;
    if (t.pierceBonus) this.upgradeStats.pierceBonus += t.pierceBonus;
    if (t.scaleBonus) this.upgradeStats.scaleBonus += t.scaleBonus;
    if (t.speedBonus) this.upgradeStats.speedBonus += t.speedBonus;
    if (t.iframeBonus) this.upgradeStats.iframeBonus += t.iframeBonus;
    if (t.radiusBonus) this.upgradeStats.radiusBonus += t.radiusBonus;
    if (t.medkitHealBonus) this.upgradeStats.medkitHealBonus += t.medkitHealBonus;
    if (t.novaDmg) this.upgradeStats.novaDmg += t.novaDmg;
    if (t.novaRadius) this.upgradeStats.novaRadius += t.novaRadius;

    if (t.maxHpBonus) {
      this.playerMaxHP += t.maxHpBonus;
    }
    if (t.healNow) {
      this.playerHP = Math.min(this.playerMaxHP, this.playerHP + t.healNow);
    }
    if (upgradeId === 'nova') {
      this.#triggerDeathNova(this.playerPos.x, this.playerPos.y);
    }

    // Empuje protector al reanudar tras elegir mejora
    const px = this.playerPos.x;
    const py = this.playerPos.y;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      const dx = e.pos.x - px;
      const dy = e.pos.y - py;
      const d = Math.hypot(dx, dy);
      if (d < 105 && d > 0.001) {
        const push = 105 - d;
        e.pos.x = Math.min(Math.max(e.pos.x + (dx / d) * push, ARENA_BOUNDS.minX), ARENA_BOUNDS.maxX);
        e.pos.y = Math.min(Math.max(e.pos.y + (dy / d) * push, ARENA_BOUNDS.minY), ARENA_BOUNDS.maxY);
      }
    }

    this.invulnerabilityTimer = Math.max(this.invulnerabilityTimer, 1.35);
    this.#spawnShockRing(px, py, chosenOpt.color, 54);
    this.#spawnBurst(px, py, chosenOpt.color, 16, 140);
    this.#spawnPopupText(`${chosenOpt.rarityLabel} · ${chosenOpt.shortTag}`, px, py + 34, chosenOpt.color);
    this.audio?.triggerHeal?.();

    this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);
    if (this.pendingLevelUps > 0) {
      this.#openNextUpgradeDraft();
    } else {
      this.activeUpgradeDraft = null;
      this.lastFrameTime = null;
      this.onUpgradeDraftChange?.(null);
      this.#publishHUDNow(null);
    }
  }

  // MARK: - Enemigos y Combate

  #updateEnemies(dt, directive) {
    const tProgress = Math.min(1, Math.max(0, this.elapsedTime / TOTAL_RUN_DURATION));
    const cooldownScale = Math.max(0.55, 1.0 - tProgress * 0.42);

    let activeOrStartedLunges = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.archetype === 'martir' && (e.stalkerPhase.type === 'lunging' || e.stalkerPhase.type === 'telegraphing')) {
        activeOrStartedLunges += 1;
      }
    }

    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      enemy.age += dt;
      if (enemy.flashTimer > 0) {
        enemy.flashTimer = Math.max(0, enemy.flashTimer - dt);
      }

      const toX = this.playerPos.x - enemy.pos.x;
      const toY = this.playerPos.y - enemy.pos.y;
      const distToPlayer = Math.max(0.001, Math.hypot(toX, toY));
      const dirX = toX / distToPlayer;
      const dirY = toY / distToPlayer;
      const angleToPlayer = Math.atan2(dirY, dirX);
      let facingAngle = angleToPlayer;

      if (enemy.archetype === 'desollado') {
        if (enemy.abilityActiveTimer > 0) {
          enemy.abilityActiveTimer = Math.max(0, enemy.abilityActiveTimer - dt);
          const pounceFactor = 1.62 + tProgress * 0.28;
          const pounceSpeed = enemy.baseSpeed * directive.enemySpeedMultiplier * pounceFactor;
          enemy.pos.x += dirX * pounceSpeed * dt;
          enemy.pos.y += dirY * pounceSpeed * dt;
          if (enemy.abilityActiveTimer <= 0) {
            enemy.isPouncing = false;
          }
        } else {
          enemy.abilityCooldown -= dt;
          const pounceTriggerRange = 150.0 + tProgress * 35.0;
          if (enemy.abilityCooldown <= 0 && distToPlayer < pounceTriggerRange) {
            enemy.abilityActiveTimer = 0.38;
            enemy.abilityCooldown = randomRange(2.2, 3.2) * cooldownScale;
            enemy.isPouncing = true;
          } else {
            const perpX = -dirY;
            const perpY = dirX;
            const wave = Math.sin(enemy.age * 7.8 + enemy.phaseOffset) * 0.45;
            const speed = enemy.baseSpeed * directive.enemySpeedMultiplier;
            const vx = (dirX + perpX * wave) * speed;
            const vy = (dirY + perpY * wave) * speed;
            enemy.pos.x += vx * dt;
            enemy.pos.y += vy * dt;
            facingAngle = Math.atan2(vy, vx);
          }
        }
        enemy.facingAngle = facingAngle;
      } else if (enemy.archetype === 'jaula') {
        const frenzied = enemy.hp / Math.max(1, enemy.maxHP) <= 0.30;
        const frenzyBoost = frenzied ? 1.68 + tProgress * 0.20 : 1.0;

        if (enemy.isSpitTelegraphing) {
          enemy.abilityActiveTimer -= dt;
          const slowSpeed = enemy.baseSpeed * directive.enemySpeedMultiplier * 0.35;
          enemy.pos.x += dirX * slowSpeed * dt;
          enemy.pos.y += dirY * slowSpeed * dt;
          if (enemy.abilityActiveTimer <= 0) {
            enemy.isSpitTelegraphing = false;
            enemy.abilityCooldown = (frenzied ? randomRange(2.4, 3.2) : randomRange(3.3, 4.4)) * cooldownScale;
            this.#spawnEnemyBoneVolley(enemy.pos, angleToPlayer, frenzied);
          }
        } else {
          const speed = enemy.baseSpeed * directive.enemySpeedMultiplier * frenzyBoost;
          enemy.pos.x += dirX * speed * dt;
          enemy.pos.y += dirY * speed * dt;

          enemy.abilityCooldown -= dt;
          if (enemy.abilityCooldown <= 0 && distToPlayer > 85 && distToPlayer < 350) {
            enemy.isSpitTelegraphing = true;
            enemy.abilityActiveTimer = 0.42;
            enemy.spitPulse = 0.42;
          }
        }
        if (enemy.spitPulse > 0) {
          enemy.spitPulse = Math.max(0, enemy.spitPulse - dt);
        }
        enemy.ribSpinAngle += dt * enemy.ribSpinSpeed;
        enemy.facingAngle = angleToPlayer;
      } else if (enemy.archetype === 'martir') {
        const wasStalking = enemy.stalkerPhase.type === 'stalking';
        facingAngle = this.#updateStalker(
          enemy,
          dt,
          dirX,
          dirY,
          distToPlayer,
          angleToPlayer,
          directive,
          !directive.suppressSimultaneousLunges || activeOrStartedLunges === 0
        );
        if (wasStalking && enemy.stalkerPhase.type === 'telegraphing') {
          activeOrStartedLunges += 1;
        }
        enemy.haloSpin += dt * 1.9;
        enemy.facingAngle = facingAngle;
      } else if (enemy.archetype === 'incensario') {
        // INCENSARIO VOLÁTIL: Corre hacia el jugador; al acercarse a <52 unidades entra en ignición de 0.55s y explota
        if (enemy.isIgniting) {
          enemy.abilityActiveTimer -= dt;
          enemy.pos.x += dirX * enemy.baseSpeed * 0.45 * dt;
          enemy.pos.y += dirY * enemy.baseSpeed * 0.45 * dt;
          if (enemy.abilityActiveTimer <= 0) {
            enemy.hp = 0;
            this.#applyHitToEnemy(i, 999, 0, 0, enemy.pos.x, enemy.pos.y);
            i -= 1;
            continue;
          }
        } else {
          const speed = enemy.baseSpeed * directive.enemySpeedMultiplier;
          enemy.pos.x += dirX * speed * dt;
          enemy.pos.y += dirY * speed * dt;
          if (distToPlayer < 52) {
            enemy.isIgniting = true;
            enemy.abilityActiveTimer = 0.55;
            this.#spawnShockRing(enemy.pos.x, enemy.pos.y, RELICARIO_PALETTE.emberOrange, 48);
          }
        }
        enemy.facingAngle = angleToPlayer;
      } else if (enemy.archetype === 'tejedor') {
        // TEJEDOR ASTRAL: Mantiene distancia de francotirador (155-215), orbita lateralmente y dispara 2 saetas cruzadas
        const tangentSign = enemy.phaseOffset > Math.PI ? 1.0 : -1.0;
        const tanX = -dirY * tangentSign;
        const tanY = dirX * tangentSign;
        const radial = distToPlayer > 215 ? 0.75 : distToPlayer < 145 ? -0.65 : 0.0;
        const speed = enemy.baseSpeed * directive.enemySpeedMultiplier;
        enemy.pos.x += (dirX * radial + tanX * 0.82) * speed * dt;
        enemy.pos.y += (dirY * radial + tanY * 0.82) * speed * dt;

        enemy.abilityCooldown -= dt;
        if (enemy.abilityCooldown <= 0 && distToPlayer < 360) {
          enemy.abilityCooldown = randomRange(2.3, 3.2) * cooldownScale;
          enemy.flashTimer = 0.12;
          for (const spread of [-0.14, 0.14]) {
            if (this.enemyProjectiles.length >= POOL_CAPS.ENEMY_PROJ) break;
            const a = angleToPlayer + spread;
            this.enemyProjectiles.push({
              x: enemy.pos.x + Math.cos(a) * 18,
              y: enemy.pos.y + Math.sin(a) * 18,
              dx: Math.cos(a) * 235,
              dy: Math.sin(a) * 235,
              angle: a,
              remainingLife: 2.2,
              damage: 13
            });
          }
        }
        enemy.facingAngle = angleToPlayer;
      } else if (enemy.archetype === 'coloso_menor') {
        // COLOSO MENOR: Gólem acorazado implacable que al morir se divide en 2 mini-Desollados
        const speed = enemy.baseSpeed * directive.enemySpeedMultiplier;
        enemy.pos.x += dirX * speed * dt;
        enemy.pos.y += dirY * speed * dt;
        enemy.facingAngle = angleToPlayer;
      } else if (enemy.archetype === 'sombra') {
        // SOMBRA ABISAL: Acecha y cada ~2.8s se teletransporta en una nube violeta a otro ángulo del jugador y lanza 1 daga
        const speed = enemy.baseSpeed * directive.enemySpeedMultiplier;
        enemy.pos.x += dirX * speed * dt;
        enemy.pos.y += dirY * speed * dt;
        enemy.abilityCooldown -= dt;
        if (enemy.abilityCooldown <= 0 && distToPlayer < 320) {
          enemy.abilityCooldown = randomRange(2.5, 3.4) * cooldownScale;
          this.#spawnBurst(enemy.pos.x, enemy.pos.y, '#A855F7', 10, 95);
          this.#spawnGhostTrail(enemy.pos.x, enemy.pos.y, angleToPlayer);
          const blinkAngle = randomRange(0, Math.PI * 2);
          const blinkDist = randomRange(115, 155);
          enemy.pos.x = Math.min(Math.max(this.playerPos.x + Math.cos(blinkAngle) * blinkDist, ARENA_BOUNDS.minX + 24), ARENA_BOUNDS.maxX - 24);
          enemy.pos.y = Math.min(Math.max(this.playerPos.y + Math.sin(blinkAngle) * blinkDist, ARENA_BOUNDS.minY + 24), ARENA_BOUNDS.maxY - 24);
          this.#spawnShockRing(enemy.pos.x, enemy.pos.y, '#A855F7', 34);
          const aim = Math.atan2(this.playerPos.y - enemy.pos.y, this.playerPos.x - enemy.pos.x);
          if (this.enemyProjectiles.length < POOL_CAPS.ENEMY_PROJ) {
            this.enemyProjectiles.push({
              x: enemy.pos.x + Math.cos(aim) * 16,
              y: enemy.pos.y + Math.sin(aim) * 16,
              dx: Math.cos(aim) * 230,
              dy: Math.sin(aim) * 230,
              angle: aim,
              remainingLife: 2.0,
              damage: 13
            });
          }
        }
        enemy.facingAngle = angleToPlayer;
      }

      enemy.pos.x = Math.min(Math.max(enemy.pos.x, ARENA_BOUNDS.minX - 28), ARENA_BOUNDS.maxX + 28);
      enemy.pos.y = Math.min(Math.max(enemy.pos.y, ARENA_BOUNDS.minY - 28), ARENA_BOUNDS.maxY + 28);
    }

    // Separación suave entre criaturas (squared-distance primero para ahorrar sqrt)
    const count = this.enemies.length;
    if (count > 1) {
      for (let i = 0; i < count - 1; i++) {
        const a = this.enemies[i];
        for (let j = i + 1; j < count; j++) {
          const b = this.enemies[j];
          const dx = b.pos.x - a.pos.x;
          const dy = b.pos.y - a.pos.y;
          const minDist = (a.hitRadius + b.hitRadius) * 0.85;
          const dSq = dx * dx + dy * dy;
          if (dSq > 0.0001 && dSq < minDist * minDist) {
            const d = Math.sqrt(dSq);
            const overlap = (minDist - d) * 0.38;
            const nx = dx / d;
            const ny = dy / d;
            a.pos.x -= nx * overlap;
            a.pos.y -= ny * overlap;
            b.pos.x += nx * overlap;
            b.pos.y += ny * overlap;
          }
        }
      }
    }

    // Colisión cuerpo a cuerpo contra el jugador
    if (this.invulnerabilityTimer <= 0) {
      const px = this.playerPos.x;
      const py = this.playerPos.y;
      for (let i = 0; i < this.enemies.length; i++) {
        const enemy = this.enemies[i];
        const dx = enemy.pos.x - px;
        const dy = enemy.pos.y - py;
        const rad = enemy.hitRadius + 10.5;
        if (dx * dx + dy * dy <= rad * rad) {
          let dmg = enemy.contactDamage;
          if (enemy.archetype === 'martir' && enemy.stalkerPhase.type === 'lunging') {
            dmg = 26 + Math.floor(this.elapsedTime / 24.0) * 2;
          }
          this.#applyDamageToPlayer(dmg);
          break;
        }
      }
    }
  }

  #spawnEnemyBoneVolley(origin, baseAngle, frenzied) {
    const tProgress = Math.min(1, Math.max(0, this.elapsedTime / TOTAL_RUN_DURATION));
    const lateBarrage = this.elapsedTime >= 35.0;
    let offsets;
    if (frenzied) {
      offsets = lateBarrage ? [-0.32, -0.16, 0.0, 0.16, 0.32] : [-0.27, -0.09, 0.09, 0.27];
    } else {
      offsets = lateBarrage ? [-0.28, -0.095, 0.095, 0.28] : [-0.22, 0.0, 0.22];
    }

    const speed = (frenzied ? 235.0 : 198.0) * (1.0 + tProgress * 0.30);
    const boltDamage = 14 + Math.floor(this.elapsedTime / 22.0) * 2;

    for (let i = 0; i < offsets.length; i++) {
      if (this.enemyProjectiles.length >= POOL_CAPS.ENEMY_PROJ) break;
      const shotAngle = baseAngle + offsets[i];
      const cosA = Math.cos(shotAngle);
      const sinA = Math.sin(shotAngle);
      this.enemyProjectiles.push({
        x: origin.x + cosA * 18,
        y: origin.y + sinA * 18,
        dx: cosA * speed,
        dy: sinA * speed,
        angle: shotAngle,
        remainingLife: 2.3,
        damage: boltDamage
      });
    }
  }

  #updateEnemyProjectiles(dt) {
    const minX = ARENA_BOUNDS.minX - 36;
    const maxX = ARENA_BOUNDS.maxX + 36;
    const minY = ARENA_BOUNDS.minY - 36;
    const maxY = ARENA_BOUNDS.maxY + 36;
    const hitSq = 13.5 * 13.5;
    const px = this.playerPos.x;
    const py = this.playerPos.y;

    let writeIdx = 0;
    for (let i = 0; i < this.enemyProjectiles.length; i++) {
      const bolt = this.enemyProjectiles[i];
      bolt.remainingLife -= dt;
      bolt.x += bolt.dx * dt;
      bolt.y += bolt.dy * dt;

      if (bolt.remainingLife <= 0 || bolt.x < minX || bolt.x > maxX || bolt.y < minY || bolt.y > maxY) {
        continue;
      }

      const dx = bolt.x - px;
      const dy = bolt.y - py;
      if (dx * dx + dy * dy <= hitSq) {
        if (this.invulnerabilityTimer <= 0 && !this.hasEnded) {
          this.#applyDamageToPlayer(bolt.damage);
        }
        continue;
      }

      this.enemyProjectiles[writeIdx++] = bolt;
    }
    this.enemyProjectiles.length = writeIdx;
  }

  #updateStalker(enemy, dt, dirX, dirY, distToPlayer, angleToPlayer, directive, canStartNewLunge) {
    const tProgress = Math.min(1, Math.max(0, this.elapsedTime / TOTAL_RUN_DURATION));
    const cooldownScale = Math.max(0.55, 1.0 - tProgress * 0.42);
    const phase = enemy.stalkerPhase;

    if (phase.type === 'stalking') {
      enemy.telegraphActive = false;
      enemy.comboDashUsed = false;
      const tangentSign = enemy.phaseOffset > Math.PI ? 1.0 : -1.0;
      const tanX = -dirY * tangentSign;
      const tanY = dirX * tangentSign;
      const radialBias = distToPlayer > 175 ? 0.68 : distToPlayer < 100 ? -0.30 : 0.18;
      const speed = enemy.baseSpeed * directive.enemySpeedMultiplier;
      enemy.pos.x += (dirX * radialBias + tanX * 0.85) * speed * dt;
      enemy.pos.y += (dirY * radialBias + tanY * 0.85) * speed * dt;

      const twitch = Math.sin(enemy.age * 14.0) > 0.90 ? 0.26 * tangentSign : 0;
      const nextCD = phase.cooldown - dt;
      if (nextCD <= 0 && distToPlayer < 330 && canStartNewLunge) {
        const telegraphDuration = Math.max(0.32, 0.40 - tProgress * 0.08);
        enemy.stalkerPhase = { type: 'telegraphing', remaining: telegraphDuration, angle: angleToPlayer };
      } else {
        phase.cooldown = nextCD;
      }
      return angleToPlayer + twitch;
    }

    if (phase.type === 'telegraphing') {
      const updatedAngle = phase.remaining > 0.16 ? angleToPlayer : phase.angle;
      phase.angle = updatedAngle;
      enemy.telegraphActive = true;
      enemy.telegraphDist = Math.min(275, distToPlayer + 40);

      phase.remaining -= dt;
      if (phase.remaining <= 0) {
        enemy.telegraphActive = false;
        const dashSpeed = (510.0 + tProgress * 110.0) * Math.max(1.0, directive.enemySpeedMultiplier);
        enemy.stalkerPhase = {
          type: 'lunging',
          remaining: 0.34,
          vel: { dx: Math.cos(updatedAngle) * dashSpeed, dy: Math.sin(updatedAngle) * dashSpeed },
          angle: updatedAngle,
          trailTimer: 0
        };
      }
      return updatedAngle;
    }

    if (phase.type === 'lunging') {
      enemy.pos.x += phase.vel.dx * dt;
      enemy.pos.y += phase.vel.dy * dt;
      phase.trailTimer -= dt;
      if (phase.trailTimer <= 0) {
        phase.trailTimer = 0.04;
        this.#spawnGhostTrail(enemy.pos.x, enemy.pos.y, phase.angle);
      }

      phase.remaining -= dt;
      if (phase.remaining <= 0) {
        const shockRadius = 34.0 + tProgress * 10.0;
        const shockDamage = 12 + Math.floor(this.elapsedTime / 25.0) * 2;
        this.#spawnShockRing(enemy.pos.x, enemy.pos.y, RELICARIO_PALETTE.vermilion, shockRadius);
        const sdx = enemy.pos.x - this.playerPos.x;
        const sdy = enemy.pos.y - this.playerPos.y;
        if (sdx * sdx + sdy * sdy <= shockRadius * shockRadius && this.invulnerabilityTimer <= 0 && !this.hasEnded) {
          this.#applyDamageToPlayer(shockDamage);
        }

        if (!enemy.comboDashUsed && (this.elapsedTime >= 20.0 || enemy.hp <= Math.max(2, Math.floor(enemy.maxHP / 2)))) {
          enemy.comboDashUsed = true;
          enemy.stalkerPhase = { type: 'telegraphing', remaining: 0.28, angle: angleToPlayer };
        } else {
          enemy.stalkerPhase = { type: 'recovering', remaining: 0.45 };
        }
      }
      return phase.angle;
    }

    // recovering
    enemy.telegraphActive = false;
    phase.remaining -= dt;
    if (phase.remaining <= 0) {
      enemy.stalkerPhase = { type: 'stalking', cooldown: randomRange(1.15, 2.05) * cooldownScale };
    }
    return angleToPlayer;
  }

  #applyDamageToPlayer(amount) {
    this.playerHP = Math.max(0, this.playerHP - amount);
    this.invulnerabilityTimer = 0.58 + this.upgradeStats.iframeBonus;
    this.justTookDamageFlag = true;
    this.#triggerShake(7.0);
    this.#spawnBurst(this.playerPos.x, this.playerPos.y, RELICARIO_PALETTE.vermilion, 10, 115);

    if (this.playerHP <= 0) {
      this.#finishRun(false);
    } else {
      this.audio?.triggerDamage();
      this.#publishHUDNow(null);
    }
  }

  #triggerShake(amplitude) {
    this.shakeAmplitude = Math.max(this.shakeAmplitude, amplitude);
    this.shakeTimer = 0.16;
  }

  // MARK: - Botiquines (Gotas de Gracia) y Generación de Enemigos

  #spawnMedkit(biasAhead) {
    if (this.medkits.length >= 4) return;
    const safeMinX = ARENA_BOUNDS.minX + 22;
    const safeMaxX = ARENA_BOUNDS.maxX - 22;
    const safeMinY = ARENA_BOUNDS.minY + 22;
    const safeMaxY = ARENA_BOUNDS.maxY - 22;

    let pos;
    if (biasAhead && Math.hypot(this.playerVelocity.dx, this.playerVelocity.dy) > 10) {
      const moveAngle = Math.atan2(this.playerVelocity.dy, this.playerVelocity.dx) + randomRange(-0.42, 0.42);
      const dist = randomRange(72, 118);
      pos = {
        x: Math.min(Math.max(this.playerPos.x + Math.cos(moveAngle) * dist, safeMinX), safeMaxX),
        y: Math.min(Math.max(this.playerPos.y + Math.sin(moveAngle) * dist, safeMinY), safeMaxY)
      };
    } else {
      pos = {
        x: randomRange(safeMinX, safeMaxX),
        y: randomRange(safeMinY, safeMaxY)
      };
      if (Math.hypot(pos.x - this.playerPos.x, pos.y - this.playerPos.y) < 68) {
        pos.y = pos.y > ARENA_BOUNDS.midY
          ? Math.min(safeMaxY, ARENA_BOUNDS.minY + 46)
          : Math.max(safeMinY, ARENA_BOUNDS.maxY - 46);
      }
    }

    this.medkits.push({ pos, age: 0 });
  }

  #updateMedkits(dt) {
    let writeIdx = 0;
    const px = this.playerPos.x;
    const py = this.playerPos.y;
    const magnetRadius = 104.0 + this.upgradeStats.radiusBonus;
    const magnetRadiusSq = magnetRadius * magnetRadius;
    const healAmount = 30 + this.upgradeStats.medkitHealBonus;

    for (let i = 0; i < this.medkits.length; i++) {
      const kit = this.medkits[i];
      kit.age += dt;

      let dx = px - kit.pos.x;
      let dy = py - kit.pos.y;
      let dSq = dx * dx + dy * dy;

      if (dSq > 0.0001 && dSq <= magnetRadiusSq) {
        const d = Math.sqrt(dSq);
        const pullSpeed = 165.0 + this.upgradeStats.radiusBonus * 0.65 + (1.0 - d / magnetRadius) * 150.0;
        const step = Math.min(d, pullSpeed * dt);
        kit.pos.x += (dx / d) * step;
        kit.pos.y += (dy / d) * step;
        dx = px - kit.pos.x;
        dy = py - kit.pos.y;
        dSq = dx * dx + dy * dy;
      }

      if (dSq <= 30.0 * 30.0) {
        const prevHP = this.playerHP;
        this.playerHP = Math.min(this.playerMaxHP, this.playerHP + healAmount);
        const actualHeal = this.playerHP - prevHP;
        this.medkitsCollected += 1;

        this.#spawnBurst(kit.pos.x, kit.pos.y, RELICARIO_PALETTE.graceJade, 14, 120);
        this.#spawnShockRing(px, py, RELICARIO_PALETTE.graceJade, 42);
        this.#spawnPopupText(
          actualHeal > 0 ? `+${actualHeal} HP` : 'VIDA MÁX',
          px,
          py + 34,
          RELICARIO_PALETTE.graceJade
        );

        this.audio?.triggerHeal();
        this.#publishHUDNow(null);
      } else if (kit.age <= 16.0) {
        this.medkits[writeIdx++] = kit;
      }
    }
    this.medkits.length = writeIdx;
  }

  #spawnEnemy(directive) {
    if (this.enemies.length >= POOL_CAPS.DESOLLADO + POOL_CAPS.JAULA + POOL_CAPS.MARTIR) return;
    const archetype = this.#pickArchetype(directive);
    const spawnPoint = this.#pickSpawnPoint(directive);
    const tProgress = Math.min(1, Math.max(0, this.elapsedTime / TOTAL_RUN_DURATION));
    const cooldownScale = Math.max(0.52, 0.96 - tProgress * 0.40);
    const lvlScale = Math.max(0, this.playerLevel - 1);

    let hp;
    let speed;
    let hitRadius;
    let contactDamage;
    let initialAbilityCD;

    if (archetype === 'desollado') {
      hp = Number((1.8 + (this.elapsedTime / 18.0) * 0.85 + lvlScale * 0.18).toFixed(2));
      speed = randomRange(114, 136) * (1.0 + tProgress * 0.14);
      hitRadius = 12.5;
      contactDamage = 12 + Math.floor(this.elapsedTime / 25.0) * 2;
      initialAbilityCD = randomRange(1.5, 2.7) * cooldownScale;
    } else if (archetype === 'incensario') {
      // Bomba de brasa: rápida, poca vida, explota al morir o al pegarse al jugador
      hp = Number((2.6 + tProgress * 3.2 + lvlScale * 0.25).toFixed(2));
      speed = randomRange(118, 138) * (1.0 + tProgress * 0.14);
      hitRadius = 14.0;
      contactDamage = 13 + Math.floor(this.elapsedTime / 26.0) * 2;
      initialAbilityCD = 0;
    } else if (archetype === 'tejedor') {
      // Francotirador astral: mantiene distancia y dispara 2 saetas en V
      hp = Number((5.2 + tProgress * 5.8 + lvlScale * 0.5).toFixed(2));
      speed = randomRange(82, 96) * (1.0 + tProgress * 0.12);
      hitRadius = 15.5;
      contactDamage = 13 + Math.floor(this.elapsedTime / 26.0) * 2;
      initialAbilityCD = randomRange(1.6, 2.4) * cooldownScale;
    } else if (archetype === 'coloso_menor') {
      // Gólem divisor: resistente, se parte en 2 mini-Desollados al caer
      hp = Number((11.5 + tProgress * 10.5 + lvlScale * 0.85).toFixed(2));
      speed = randomRange(66, 78) * (1.0 + tProgress * 0.12);
      hitRadius = 21.0;
      contactDamage = 17 + Math.floor(this.elapsedTime / 28.0) * 2;
      initialAbilityCD = 0;
    } else if (archetype === 'sombra') {
      // Espectro abisal: se teletransporta alrededor del jugador y lanza daga
      hp = Number((6.5 + tProgress * 6.5 + lvlScale * 0.55).toFixed(2));
      speed = randomRange(92, 108) * (1.0 + tProgress * 0.14);
      hitRadius = 15.5;
      contactDamage = 14 + Math.floor(this.elapsedTime / 26.0) * 2;
      initialAbilityCD = randomRange(1.8, 2.6) * cooldownScale;
    } else if (archetype === 'jaula') {
      hp = Number((16 + tProgress * 15.0 + lvlScale * 1.2).toFixed(2));
      speed = randomRange(58, 68) * (1.0 + tProgress * 0.14);
      hitRadius = 25.5;
      contactDamage = 20 + Math.floor(this.elapsedTime / 28.0) * 2;
      initialAbilityCD = randomRange(2.3, 3.5) * cooldownScale;
    } else {
      hp = Number((8 + tProgress * 8.0 + lvlScale * 0.7).toFixed(2));
      speed = randomRange(98, 114) * (1.0 + tProgress * 0.14);
      hitRadius = 16.5;
      contactDamage = 15 + Math.floor(this.elapsedTime / 25.0) * 2;
      initialAbilityCD = randomRange(1.25, 1.95) * cooldownScale;
    }

    this.enemies.push({
      archetype,
      renderScale: 1.0,
      pos: spawnPoint,
      hp,
      maxHP: hp,
      baseSpeed: speed,
      hitRadius,
      contactDamage,
      age: 0,
      phaseOffset: randomRange(0, Math.PI * 2),
      abilityCooldown: initialAbilityCD,
      abilityActiveTimer: 0,
      isIgniting: false,
      isSpitTelegraphing: false,
      comboDashUsed: false,
      stalkerPhase: { type: 'stalking', cooldown: initialAbilityCD },
      facingAngle: Math.atan2(this.playerPos.y - spawnPoint.y, this.playerPos.x - spawnPoint.x),
      flashTimer: 0,
      isPouncing: false,
      attachedRibs: 4,
      ribSpinAngle: 0,
      ribSpinSpeed: 1.25,
      isFrenzied: false,
      spitPulse: 0,
      telegraphActive: false,
      telegraphDist: 0,
      haloSpin: 0
    });
  }

  #pickArchetype(directive) {
    const total = Math.max(0.001, directive.swarmWeight + directive.tankWeight + directive.stalkerWeight);
    const roll = Math.random() * total;
    if (roll < directive.swarmWeight) {
      // En el grupo de enjambre alterna entre Desollados e Incensarios Volátiles
      if (this.elapsedTime >= 8 && Math.random() < 0.28) return 'incensario';
      return 'desollado';
    }
    if (roll < directive.swarmWeight + directive.tankWeight) {
      // En el grupo pesado alterna entre Jaulas y Colosos Menores divisores
      if (this.elapsedTime >= 14 && Math.random() < 0.42) return 'coloso_menor';
      return 'jaula';
    }
    // En el grupo de especialistas alterna entre Mártires, Tejedores Astrales y Sombras Abisales
    const specRoll = Math.random();
    if (this.elapsedTime >= 10 && specRoll < 0.34) return 'tejedor';
    if (this.elapsedTime >= 18 && specRoll < 0.65) return 'sombra';
    return 'martir';
  }

  #pickSpawnPoint(directive) {
    let chosenAngle = randomRange(0, Math.PI * 2);
    if (directive.safeEscapeCenterAngle !== null && directive.safeEscapeCenterAngle !== undefined) {
      for (let i = 0; i < 8; i++) {
        const candidate = randomRange(0, Math.PI * 2);
        const diff = Math.abs(Math.atan2(
          Math.sin(candidate - directive.safeEscapeCenterAngle),
          Math.cos(candidate - directive.safeEscapeCenterAngle)
        ));
        if (diff > directive.safeEscapeHalfConeRadians) {
          chosenAngle = candidate;
          break;
        }
      }
    }

    const spawnDist = randomRange(185, 265);
    const pad = 14;
    let x = Math.min(Math.max(this.playerPos.x + Math.cos(chosenAngle) * spawnDist, ARENA_BOUNDS.minX - pad), ARENA_BOUNDS.maxX + pad);
    let y = Math.min(Math.max(this.playerPos.y + Math.sin(chosenAngle) * spawnDist, ARENA_BOUNDS.minY - pad), ARENA_BOUNDS.maxY + pad);

    if (Math.hypot(x - this.playerPos.x, y - this.playerPos.y) < 118) {
      const inwardAngle = Math.atan2(ARENA_BOUNDS.midY - this.playerPos.y, ARENA_BOUNDS.midX - this.playerPos.x) + randomRange(-0.55, 0.55);
      const safeDist = randomRange(145, 185);
      x = Math.min(Math.max(this.playerPos.x + Math.cos(inwardAngle) * safeDist, ARENA_BOUNDS.minX - pad), ARENA_BOUNDS.maxX + pad);
      y = Math.min(Math.max(this.playerPos.y + Math.sin(inwardAngle) * safeDist, ARENA_BOUNDS.minY - pad), ARENA_BOUNDS.maxY + pad);
    }

    return { x, y };
  }

  // MARK: - Efectos Visuales 3D Efímeros en Pools Instanciados

  #spawnBurst(x, y, colorHex, count, speedScale) {
    this._colScratch.set(colorHex);
    const cr = this._colScratch.r;
    const cg = this._colScratch.g;
    const cb = this._colScratch.b;

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= POOL_CAPS.PARTICLES) break;
      const angle = randomRange(0, Math.PI * 2);
      const speed = randomRange(speedScale * 0.45, speedScale);
      this.particles.push({
        x,
        y: randomRange(8, 22),
        z: -y,
        size: randomRange(2.0, 4.4),
        cr,
        cg,
        cb,
        vx: Math.cos(angle) * speed,
        vy: randomRange(45, 110),
        vz: -Math.sin(angle) * speed,
        life: 0,
        maxLife: randomRange(0.24, 0.46)
      });
    }
  }

  #spawnShockRing(x, y, colorHex, maxRadius) {
    if (this.shockRings.length >= 24) return;
    this.shockRings.push({
      x,
      z: -y,
      color: new THREE.Color(colorHex),
      maxRadius,
      life: 0,
      maxLife: 0.34
    });
  }

  #spawnDetachedRib(x, y, spinAngle) {
    if (this.detachedRibs.length >= 48) return;
    const outAngle = randomRange(0, Math.PI * 2);
    const speed = randomRange(90, 150);
    this.detachedRibs.push({
      x,
      y: 16,
      z: -y,
      rotX: 0,
      rotY: spinAngle,
      scale: 1,
      vx: Math.cos(outAngle) * speed,
      vy: randomRange(65, 120),
      vz: -Math.sin(outAngle) * speed,
      life: 0,
      maxLife: 0.45
    });
  }

  #spawnGhostTrail(x, y, facingAngle) {
    if (this.ghostTrails.length >= POOL_CAPS.GHOSTS) return;
    this.ghostTrails.push({
      x,
      z: -y,
      facingAngle,
      life: 0,
      maxLife: 0.22
    });
  }

  #spawnPopupText(text, x, y, colorHex) {
    let slot = null;
    for (let i = 0; i < this.popupPool.length; i++) {
      if (!this.popupPool[i].inUse) {
        slot = this.popupPool[i];
        break;
      }
    }
    if (!slot) {
      slot = this.popupPool[0];
    }

    slot.inUse = true;
    slot.life = 0;
    slot.maxLife = 0.72;
    slot.material.map = this.assets.getPopupTexture(text, colorHex);
    slot.material.opacity = 1;
    slot.sprite.position.set(x, 42, -y);
    slot.sprite.visible = true;
    if (!this.activePopups.includes(slot)) {
      this.activePopups.push(slot);
    }
  }

  #updateVisualFX(dt) {
    // Partículas
    let pw = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life < p.maxLife) {
        p.x += p.vx * dt;
        p.y = Math.max(1, p.y + p.vy * dt);
        p.vy -= 260 * dt;
        p.z += p.vz * dt;
        this.particles[pw++] = p;
      }
    }
    this.particles.length = pw;

    // Ondas de choque
    let rw = 0;
    for (let i = 0; i < this.shockRings.length; i++) {
      const r = this.shockRings[i];
      r.life += dt;
      if (r.life < r.maxLife) {
        this.shockRings[rw++] = r;
      }
    }
    this.shockRings.length = rw;

    // Costillas desprendidas
    let bw = 0;
    for (let i = 0; i < this.detachedRibs.length; i++) {
      const rib = this.detachedRibs[i];
      rib.life += dt;
      const t = rib.life / rib.maxLife;
      if (t < 1) {
        rib.x += rib.vx * dt;
        rib.y = Math.max(2, rib.y + rib.vy * dt);
        rib.vy -= 300 * dt;
        rib.z += rib.vz * dt;
        rib.rotX += dt * 7;
        rib.scale = 1 - t * 0.75;
        this.detachedRibs[bw++] = rib;
      }
    }
    this.detachedRibs.length = bw;

    // Estelas fantasma
    let gw = 0;
    for (let i = 0; i < this.ghostTrails.length; i++) {
      const g = this.ghostTrails[i];
      g.life += dt;
      if (g.life < g.maxLife) {
        this.ghostTrails[gw++] = g;
      }
    }
    this.ghostTrails.length = gw;

    // Popups flotantes en pool
    let popW = 0;
    for (let i = 0; i < this.activePopups.length; i++) {
      const pop = this.activePopups[i];
      pop.life += dt;
      const t = pop.life / pop.maxLife;
      if (t >= 1) {
        pop.inUse = false;
        pop.sprite.visible = false;
      } else {
        pop.sprite.position.y += dt * 36;
        pop.material.opacity = 1 - t * t;
        this.activePopups[popW++] = pop;
      }
    }
    this.activePopups.length = popW;
  }

  #syncPools() {
    const pools = this.pools;
    pools.resetFrameCounts();

    // Halos estáticos (altar + 8 pebeteros)
    for (let i = 0; i < this.staticGlows.length; i++) {
      const g = this.staticGlows[i];
      pools.addGlow(g.x, g.y, g.z, g.size, g.color, g.opacity);
    }

    // Halo en el suelo bajo el Boss activo y sellos explosivos del Jefe Final
    if (this.activeBoss) {
      pools.addGlow(
        this.activeBoss.pos.x,
        1.2,
        -this.activeBoss.pos.y,
        this.activeBoss.isFinal ? 145 : 115,
        this._colGold,
        0.55
      );
    }
    for (let i = 0; i < this.bossZones.length; i++) {
      const z = this.bossZones[i];
      const progress = 1.0 - z.remaining / Math.max(0.01, z.maxTime);
      pools.addGlow(z.x, 1.3, -z.y, z.radius * 2.1, this._colGold, 0.35 + progress * 0.45);
      pools.addRing(z.x, 1.6, -z.y, z.radius * (0.3 + progress * 0.7), z.remaining * 6, this._colGold, 0.92);
    }

    // Enemigos (7 arquetipos distintos)
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      if (enemy.archetype === 'desollado') {
        pools.addDesollado(enemy);
      } else if (enemy.archetype === 'jaula') {
        pools.addJaula(enemy);
      } else if (enemy.archetype === 'incensario') {
        pools.addIncensario(enemy);
      } else if (enemy.archetype === 'tejedor') {
        pools.addTejedor(enemy);
      } else if (enemy.archetype === 'coloso_menor') {
        pools.addColosoMenor(enemy);
      } else if (enemy.archetype === 'sombra') {
        pools.addSombra(enemy);
      } else {
        pools.addMartir(enemy);
      }
    }

    // Botiquines
    for (let i = 0; i < this.medkits.length; i++) {
      pools.addMedkit(this.medkits[i]);
    }

    // Proyectiles
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      pools.addPlayerProjectile(p.x, p.y, p.angle, p.scale, p.color);
    }
    for (let i = 0; i < this.enemyProjectiles.length; i++) {
      const b = this.enemyProjectiles[i];
      pools.addEnemyProjectile(b.x, b.y, b.angle);
    }

    // Partículas (atenuación por color + escala)
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const invT = 1 - p.life / p.maxLife;
      pools.addParticle(p.x, p.y, p.z, p.size * (0.45 + 0.55 * invT), p.cr * invT, p.cg * invT, p.cb * invT);
    }

    // Ondas de choque
    for (let i = 0; i < this.shockRings.length; i++) {
      const r = this.shockRings[i];
      const t = r.life / r.maxLife;
      pools.addRing(r.x, 1.8, r.z, 6 + (r.maxRadius - 6) * t, 0, r.color, (1 - t) * 0.85);
    }

    // Costillas sueltas
    for (let i = 0; i < this.detachedRibs.length; i++) {
      pools.addDetachedRib(this.detachedRibs[i]);
    }

    // Fantasmas del Mártir
    for (let i = 0; i < this.ghostTrails.length; i++) {
      const g = this.ghostTrails[i];
      const t = g.life / g.maxLife;
      pools.addGhost(g.x, g.z, g.facingAngle, 1 - t * 0.35, (1 - t) * 0.45);
    }

    pools.commit();
  }

  // MARK: - Telemetría HUD y Cierre

  #publishHUDNow(directive) {
    if (this.hasEnded) return;
    const activeDirective = directive || this.lastDirective;
    const activePhaseDef = CAMPAIGN_PHASES[this.currentPhaseIndex] || CAMPAIGN_PHASES[0];
    let fallbackMsg = 'Regla fija [0-40s] → Escalamiento continuo';
    if (activePhaseDef.id === 'hybrid1985x2026') {
      fallbackMsg = 'Mix 85×26 [40s-1m20s] → Reloj fijo + IA';
    } else if (activePhaseDef.id === 'director2026') {
      fallbackMsg = 'IA Directora [1m20s-2m] → Leyendo estrés en vivo';
    }

    this.onSnapshotUpdate?.({
      elapsedTime: this.elapsedTime,
      timeRemaining: Math.max(0, TOTAL_RUN_DURATION - this.elapsedTime),
      hp: this.playerHP,
      maxHP: this.playerMaxHP,
      kills: this.kills,
      playerLevel: this.playerLevel,
      xpProgress: this.currentXP / Math.max(1, this.xpToNextLevel),
      upgradeRanks: { ...this.upgradeRanks },
      upgradeBestRarity: { ...this.upgradeBestRarity },
      activeBoss: this.activeBoss
        ? {
            bossNumber: this.activeBoss.bossNumber,
            title: this.activeBoss.title,
            subtitle: this.activeBoss.subtitle,
            isFinal: this.activeBoss.isFinal,
            enraged: this.activeBoss.enraged,
            hp: Math.ceil(this.activeBoss.hp),
            maxHP: this.activeBoss.maxHP,
            color: this.activeBoss.color
          }
        : null,
      stressIndex: this.stressTracker.currentStress,
      stressTier: this.stressTracker.currentTier,
      aiState: this.currentAiState,
      directorMessage: activeDirective?.microMessage || fallbackMsg,
      isInterventionActive: Boolean(activeDirective?.isInterventionActive),
      medkitsCollected: this.medkitsCollected,
      currentPhase: activePhaseDef,
      phaseTransition: this.phaseTransition
    });
  }

  #buildSerializedPhaseBreakdown() {
    const out = {};
    for (const phase of CAMPAIGN_PHASES) {
      const raw = this.phaseStats[phase.id];
      const avgStress =
        raw.sampleTime > 0.05
          ? Math.min(100, Math.max(0, raw.stressIntegral / raw.sampleTime))
          : this.stressTracker.currentStress;
      out[phase.id] = {
        entered: Boolean(raw.entered),
        survivedSeconds: Number(raw.survivedSeconds.toFixed(2)),
        didSurvive: Boolean(raw.didSurvive),
        kills: raw.kills,
        medkitsCollected: raw.medkitsCollected,
        averageStress: Number(avgStress.toFixed(1)),
        peakStress: Number(raw.peakStress.toFixed(1))
      };
    }
    return out;
  }

  #finishRun(didSurvive) {
    if (this.hasEnded) return;
    this.hasEnded = true;
    this.isUserPaused = true;
    this.phaseTransition = null;
    this.#releaseJoystick();

    const survived = didSurvive ? TOTAL_RUN_DURATION : Math.min(TOTAL_RUN_DURATION, this.elapsedTime);
    const activePhaseDef = CAMPAIGN_PHASES[this.currentPhaseIndex] || CAMPAIGN_PHASES[0];

    this.onSnapshotUpdate?.({
      elapsedTime: survived,
      timeRemaining: didSurvive ? 0 : Math.max(0, TOTAL_RUN_DURATION - this.elapsedTime),
      hp: this.playerHP,
      maxHP: PLAYER_MAX_HP,
      kills: this.kills,
      playerLevel: this.playerLevel,
      stressIndex: this.stressTracker.currentStress,
      stressTier: this.stressTracker.currentTier,
      directorMessage: didSurvive ? '¡Campaña completada (2m 00s)!' : 'Sujeto caído en combate',
      isInterventionActive: false,
      medkitsCollected: this.medkitsCollected,
      currentPhase: activePhaseDef,
      phaseTransition: null
    });

    const record = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      initials: this.initials,
      avatar: this.avatarId,
      mode: activePhaseDef.id,
      reachedPhase: activePhaseDef.phaseNumber,
      survivedSeconds: survived,
      didSurvive,
      kills: this.kills,
      averageStress: this.stressTracker.averageStress,
      peakStress: this.stressTracker.peakStress,
      medkitsCollected: this.medkitsCollected,
      phaseBreakdown: this.#buildSerializedPhaseBreakdown(),
      playedAt: new Date().toISOString()
    };

    this.audio?.triggerRunEnd(didSurvive);
    this.onRunCompleted?.(record);
  }

  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);

    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onWindowBlur);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);

    const dom = this.renderer?.domElement;
    if (dom) {
      dom.removeEventListener('contextmenu', this._onContextMenu);
      dom.removeEventListener('webglcontextlost', this._onWebGLContextLost);
      dom.removeEventListener('webglcontextrestored', this._onWebGLContextRestored);
      dom.removeEventListener('pointerdown', this._onPointerDown);
      dom.removeEventListener('pointermove', this._onPointerMove);
      dom.removeEventListener('pointerup', this._onPointerEnd);
      dom.removeEventListener('pointercancel', this._onPointerEnd);
      if (dom.parentNode === this.container) {
        this.container.removeChild(dom);
      }
    }

    for (const pop of this.popupPool) {
      pop.material.dispose();
    }
    if (this.staticInstancedMeshes) {
      for (const m of this.staticInstancedMeshes) m.dispose();
    }
    this.pools?.dispose();
    this.playerXPBar?.dispose();
    this.assets?.dispose();
    this.renderer?.dispose();
  }
}
