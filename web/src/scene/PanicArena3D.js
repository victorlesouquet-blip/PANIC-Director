// Arena 3D completa en Three.js replicando exactamente PanicGameScene.swift (simulación 2D lógica -> mundo 3D Y-up)
// Optimizada con InstancedMesh, pools sin GC, DPR adaptativo y compilación anticipada de shaders.

import * as THREE from 'three';
import {
  GAME_MODE_MAP,
  PLAYER_AVATAR_MAP,
  RELICARIO_PALETTE,
  stressTierFromIndex
} from '../engine/constants.js';
import { createWaveDirector, StressMetricsTracker } from '../engine/aiDirector.js';
import {
  buildPlayerAvatar3D,
  InstancedArenaPools,
  PlayerXPBar3D,
  POOL_CAPS,
  SharedThreeAssets
} from './meshes3d.js';

const TOTAL_RUN_DURATION = 60.0;
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
  return 35 + level * 20 + step * step * 8;
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

export class PanicArena3D {
  constructor({
    container,
    modeId,
    initials,
    avatarId,
    audio,
    onSnapshotUpdate,
    onRunCompleted,
    onJoystickChange,
    onPauseShortcut
  }) {
    this.container = container;
    this.modeId = modeId;
    this.modeDef = GAME_MODE_MAP[modeId] || GAME_MODE_MAP.director2026;
    this.initials = initials;
    this.avatarId = avatarId;
    this.avatarDef = PLAYER_AVATAR_MAP[avatarId] || PLAYER_AVATAR_MAP.penitente;
    this.audio = audio;
    this.onSnapshotUpdate = onSnapshotUpdate;
    this.onRunCompleted = onRunCompleted;
    this.onJoystickChange = onJoystickChange;
    this.onPauseShortcut = onPauseShortcut;

    this.hasEnded = false;
    this.isUserPaused = false;
    this.isDisposed = false;
    this.contextLost = false;
    this.needsPausedRender = false;
    this.rafId = null;
    this.lastFrameTime = null;

    // Estado del jugador y progresión
    this.playerPos = { x: 0, y: 0 };
    this.playerVelocity = { dx: 0, dy: 0 };
    this.playerHP = PLAYER_MAX_HP;
    this.invulnerabilityTimer = 0;
    this.fireTimer = 0;
    this.playerLevel = 1;
    this.currentXP = 0;
    this.xpToNextLevel = xpRequiredForLevel(1);

    // Motores de IA
    this.stressTracker = new StressMetricsTracker();
    this.waveDirector = createWaveDirector(this.modeId);
    this.previousStressTier = this.stressTracker.currentTier;
    this.lastDirective = null;

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
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (!this.hasEnded && typeof this.onPauseShortcut === 'function') {
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
      if (this.hasEnded || this.isUserPaused || this.activePointerId !== null) return;
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

  #stepSimulation(dt) {
    this.elapsedTime += dt;
    if (this.elapsedTime >= TOTAL_RUN_DURATION) {
      this.elapsedTime = TOTAL_RUN_DURATION;
      this.#finishRun(true);
      return;
    }

    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - dt);
      this.playerVisual.body.visible = Math.floor(this.invulnerabilityTimer * 22) % 2 !== 0;
    } else {
      this.playerVisual.body.visible = true;
    }

    // 1. Movimiento del jugador (escala agilidad con el nivel)
    const move = this.#resolveMoveInput();
    const speedBonus = 1.0 + Math.min(0.30, (this.playerLevel - 1) * 0.05);
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
      playerHPNormalized: this.playerHP / PLAYER_MAX_HP,
      nearestEnemyDistance: nearestDist,
      enemiesInsideDangerRing: dangerCount,
      enemiesInsidePanicRing: panicCount,
      justTookDamage: this.justTookDamageFlag
    });
    this.justTookDamageFlag = false;

    const newTier = stressTierFromIndex(stressValue);
    if (newTier.rawValue > this.previousStressTier.rawValue) {
      this.audio?.triggerStressTierUp(newTier.rawValue);
    }
    this.previousStressTier = newTier;

    // 3. Evaluación del motor de IA (1985 vs 2026 vs Híbrido)
    const directive = this.waveDirector.evaluate({
      dt,
      elapsedTime: this.elapsedTime,
      stressIndex: stressValue,
      stressTier: newTier,
      playerHPNormalized: this.playerHP / PLAYER_MAX_HP,
      playerVelocity: this.playerVelocity,
      activeEnemyCount: this.enemies.length,
      activeMedkitCount: this.medkits.length
    });
    this.lastDirective = directive;

    if (directive.spawnEmergencyMedkit) {
      this.#spawnMedkit(directive.medkitBiasAhead);
    }

    // 4. Aparición de criaturas según directiva
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemies.length < directive.maxActiveEnemies) {
      this.#spawnEnemy(directive);
      this.spawnTimer = directive.spawnInterval;
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

    // 6. Proyectiles, criaturas, proyectiles hostiles y curas
    this.#updateProjectiles(dt);
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

    this.fireTimer = Math.max(0.125, 0.24 * Math.pow(0.91, this.playerLevel - 1));
    const damage = this.playerLevel >= 6 ? 3 : this.playerLevel >= 3 ? 2 : 1;

    let spreadOffsets;
    if (this.playerLevel === 1) {
      spreadOffsets = [0.0];
    } else if (this.playerLevel <= 3) {
      spreadOffsets = [-0.08, 0.08];
    } else if (this.playerLevel <= 5) {
      spreadOffsets = [-0.13, 0.0, 0.13];
    } else {
      spreadOffsets = [-0.16, -0.055, 0.055, 0.16];
    }

    const tierStep = Math.min(5, this.playerLevel - 1);
    const shardScale = 3.8 * (1.0 + tierStep * 0.07);
    const speed = 590.0 + tierStep * 28.0;
    const color = this.playerLevel >= 5
      ? this._colGold
      : this.playerLevel >= 3
        ? this._colColdSilver
        : this._colIvory;

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
        remainingLife: 1.05,
        damage
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

      const hitPadding = 6.5 + (p.damage - 1) * 1.2;
      let hitIdx = -1;
      for (let j = 0; j < this.enemies.length; j++) {
        const e = this.enemies[j];
        const dx = e.pos.x - p.x;
        const dy = e.pos.y - p.y;
        const rad = e.hitRadius + hitPadding;
        if (dx * dx + dy * dy <= rad * rad) {
          hitIdx = j;
          break;
        }
      }

      if (hitIdx >= 0) {
        this.#applyHitToEnemy(hitIdx, p.damage, p.dx, p.dy, p.x, p.y);
      } else {
        this.projectiles[writeIdx++] = p;
      }
    }
    this.projectiles.length = writeIdx;
  }

  #applyHitToEnemy(index, damage, velDx, velDy, impactX, impactY) {
    const enemy = this.enemies[index];
    enemy.hp -= damage;

    const sparkColor = enemy.archetype === 'jaula' ? RELICARIO_PALETTE.oldBone : RELICARIO_PALETTE.vermilion;
    this.#spawnBurst(impactX, impactY, sparkColor, 5, 85);

    const velMag = Math.max(1, Math.hypot(velDx, velDy));
    const knock = enemy.archetype === 'desollado' ? 5.5 : enemy.archetype === 'jaula' ? 1.2 : 4.0;
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
      let deathColor = RELICARIO_PALETTE.vermilion;
      let count = 11;
      let xpValue = 10;
      if (enemy.archetype === 'jaula') {
        deathColor = RELICARIO_PALETTE.liturgicalGold;
        count = 20;
        xpValue = 65;
        this.#triggerShake(4.5);
      } else if (enemy.archetype === 'martir') {
        deathColor = RELICARIO_PALETTE.liturgicalGold;
        count = 15;
        xpValue = 28;
      }

      this.#spawnBurst(enemy.pos.x, enemy.pos.y, deathColor, count, 130);
      // Swap-and-pop O(1)
      const lastIdx = this.enemies.length - 1;
      if (index !== lastIdx) {
        this.enemies[index] = this.enemies[lastIdx];
      }
      this.enemies.pop();
      this.kills += 1;
      this.#grantXP(xpValue);
    }
  }

  #grantXP(amount) {
    this.currentXP += amount;
    let didLevelUp = false;
    while (this.currentXP >= this.xpToNextLevel) {
      this.currentXP -= this.xpToNextLevel;
      this.playerLevel += 1;
      this.xpToNextLevel = xpRequiredForLevel(this.playerLevel);
      didLevelUp = true;
    }

    const progress = this.currentXP / Math.max(1, this.xpToNextLevel);
    this.playerXPBar.updateXP(progress, this.playerLevel, didLevelUp);

    if (didLevelUp) {
      if (this.playerHP < PLAYER_MAX_HP) {
        const prevHP = this.playerHP;
        this.playerHP = Math.min(PLAYER_MAX_HP, this.playerHP + 10);
        const healed = this.playerHP - prevHP;
        if (healed > 0) {
          this.#spawnShockRing(this.playerPos.x, this.playerPos.y, RELICARIO_PALETTE.graceJade, 34);
          this.#spawnPopupText(`+${healed} HP`, this.playerPos.x, this.playerPos.y - 26, RELICARIO_PALETTE.graceJade);
        }
      }
      this.#spawnShockRing(this.playerPos.x, this.playerPos.y, RELICARIO_PALETTE.liturgicalGold, 44);
      this.#spawnBurst(this.playerPos.x, this.playerPos.y, RELICARIO_PALETTE.liturgicalGold, 14, 135);
      this.#spawnPopupText(`¡NIVEL ${this.playerLevel}! +PODER`, this.playerPos.x, this.playerPos.y + 36, RELICARIO_PALETTE.liturgicalGold);
      this.audio?.triggerLevelUp();
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
    this.invulnerabilityTimer = 0.40;
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
    for (let i = 0; i < this.medkits.length; i++) {
      const kit = this.medkits[i];
      kit.age += dt;

      let dx = px - kit.pos.x;
      let dy = py - kit.pos.y;
      let dSq = dx * dx + dy * dy;

      if (dSq > 0.0001 && dSq <= 96.0 * 96.0) {
        const d = Math.sqrt(dSq);
        const pullSpeed = 155.0 + (1.0 - d / 96.0) * 140.0;
        const step = Math.min(d, pullSpeed * dt);
        kit.pos.x += (dx / d) * step;
        kit.pos.y += (dy / d) * step;
        dx = px - kit.pos.x;
        dy = py - kit.pos.y;
        dSq = dx * dx + dy * dy;
      }

      if (dSq <= 30.0 * 30.0) {
        const prevHP = this.playerHP;
        this.playerHP = Math.min(PLAYER_MAX_HP, this.playerHP + 28);
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
    const archetype = this.#pickArchetype(directive);
    const spawnPoint = this.#pickSpawnPoint(directive);
    const tProgress = Math.min(1, Math.max(0, this.elapsedTime / TOTAL_RUN_DURATION));
    const cooldownScale = Math.max(0.58, 1.0 - tProgress * 0.40);

    let hp;
    let speed;
    let hitRadius;
    let contactDamage;
    let initialAbilityCD;

    if (archetype === 'desollado') {
      if (this.enemies.length >= POOL_CAPS.DESOLLADO + POOL_CAPS.JAULA + POOL_CAPS.MARTIR) return;
      hp = 2 + Math.floor(this.elapsedTime / 16.0) + (this.playerLevel >= 5 ? 1 : 0);
      speed = randomRange(120, 144) * (1.0 + tProgress * 0.16);
      hitRadius = 12.5;
      contactDamage = 14 + Math.floor(this.elapsedTime / 20.0) * 2;
      initialAbilityCD = randomRange(1.4, 2.6) * cooldownScale;
    } else if (archetype === 'jaula') {
      hp = 18 + Math.floor(tProgress * 16.0);
      speed = randomRange(62, 72) * (1.0 + tProgress * 0.18);
      hitRadius = 25.5;
      contactDamage = 24 + Math.floor(this.elapsedTime / 25.0) * 3;
      initialAbilityCD = randomRange(2.2, 3.4) * cooldownScale;
    } else {
      hp = 9 + Math.floor(tProgress * 8.0);
      speed = randomRange(102, 118) * (1.0 + tProgress * 0.16);
      hitRadius = 16.5;
      contactDamage = 18 + Math.floor(this.elapsedTime / 20.0) * 2;
      initialAbilityCD = randomRange(1.1, 1.8) * cooldownScale;
    }

    this.enemies.push({
      archetype,
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
    if (roll < directive.swarmWeight) return 'desollado';
    if (roll < directive.swarmWeight + directive.tankWeight) return 'jaula';
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

    // Enemigos
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      if (enemy.archetype === 'desollado') {
        pools.addDesollado(enemy);
      } else if (enemy.archetype === 'jaula') {
        pools.addJaula(enemy);
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
    let fallbackMsg = 'IA activa → Leyendo estrés';
    if (this.modeId === 'classic1985') {
      fallbackMsg = 'Regla fija [0-15s] → Escalamiento continuo';
    } else if (this.modeId === 'hybrid1985x2026') {
      fallbackMsg = 'Mix 85×26 → Reloj fijo + IA';
    }

    this.onSnapshotUpdate?.({
      timeRemaining: Math.max(0, TOTAL_RUN_DURATION - this.elapsedTime),
      hp: this.playerHP,
      maxHP: PLAYER_MAX_HP,
      kills: this.kills,
      playerLevel: this.playerLevel,
      stressIndex: this.stressTracker.currentStress,
      stressTier: this.stressTracker.currentTier,
      directorMessage: activeDirective?.microMessage || fallbackMsg,
      isInterventionActive: Boolean(activeDirective?.isInterventionActive),
      medkitsCollected: this.medkitsCollected
    });
  }

  #finishRun(didSurvive) {
    if (this.hasEnded) return;
    this.hasEnded = true;
    this.isUserPaused = true;
    this.#releaseJoystick();

    const survived = didSurvive ? TOTAL_RUN_DURATION : Math.min(TOTAL_RUN_DURATION, this.elapsedTime);

    this.onSnapshotUpdate?.({
      timeRemaining: didSurvive ? 0 : Math.max(0, TOTAL_RUN_DURATION - this.elapsedTime),
      hp: this.playerHP,
      maxHP: PLAYER_MAX_HP,
      kills: this.kills,
      playerLevel: this.playerLevel,
      stressIndex: this.stressTracker.currentStress,
      stressTier: this.stressTracker.currentTier,
      directorMessage: didSurvive ? 'Experimento completado (60s)' : 'Sujeto caído en combate',
      isInterventionActive: false,
      medkitsCollected: this.medkitsCollected
    });

    const record = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      initials: this.initials,
      avatar: this.avatarId,
      mode: this.modeId,
      survivedSeconds: survived,
      didSurvive,
      kills: this.kills,
      averageStress: this.stressTracker.averageStress,
      peakStress: this.stressTracker.peakStress,
      medkitsCollected: this.medkitsCollected,
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
