// Arena 3D completa en Three.js replicando exactamente PanicGameScene.swift (simulación 2D lógica -> mundo 3D Y-up)

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
  createDesollado3D,
  createFloatingTextSprite3D,
  createJaula3D,
  createMartir3D,
  createMedkit3D,
  PlayerXPBar3D,
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

    // Entidades activas
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.medkits = [];
    this.effects = [];

    // Contadores y temporizadores
    this.elapsedTime = 0;
    this.spawnTimer = 0.45;
    this.hudPublishTimer = 0;
    this.kills = 0;
    this.medkitsCollected = 0;
    this.justTookDamageFlag = false;
    this.shakeTimer = 0;
    this.shakeAmplitude = 0;

    // Entrada híbrida: teclado WASD/Flechas + joystick flotante táctil/ratón
    this.keysDown = new Set();
    this.activePointerId = null;
    this.joystickOrigin = { x: 0, y: 0 };
    this.pointerMoveInput = { dx: 0, dy: 0 };
    this.moveInput = { dx: 0, dy: 0 };

    // Inicializar Three.js + Escenario + Entidad jugador
    this.assets = new SharedThreeAssets();
    this.#initThreeScene();
    this.#bindInputs();
    this.#publishHUDNow(null);
    this.#startLoop();
  }

  #initThreeScene() {
    const width = Math.max(320, this.container.clientWidth || window.innerWidth);
    const height = Math.max(320, this.container.clientHeight || window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(RELICARIO_PALETTE.arenaBG);
    this.scene.fog = new THREE.FogExp2('#110E0E', 0.00115);

    this.camera = new THREE.PerspectiveCamera(48, width / height, 20, 1800);
    this.cameraLookTarget = new THREE.Vector3(0, 12, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
    this.#updateCamera(1.0);
  }

  #buildLights() {
    const hemi = new THREE.HemisphereLight('#5C494F', '#0C0909', 1.25);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#F5EFE6', 1.45);
    keyLight.position.set(160, 360, 210);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(RELICARIO_PALETTE.coldSilver, 0.58);
    rimLight.position.set(-180, 190, -250);
    this.scene.add(rimLight);

    const altarAccent = new THREE.PointLight(RELICARIO_PALETTE.visceralCore, 1.4, 520, 1.5);
    altarAccent.position.set(0, 95, 0);
    this.scene.add(altarAccent);

    this.playerLight = new THREE.PointLight(this.avatarDef.auraColor, 2.2, 230, 1.4);
    this.playerLight.position.set(0, 46, 0);
    this.scene.add(this.playerLight);
  }

  #buildSanctuaryArena() {
    // Textura procedural de losas basálticas oscuras + juntas de piedra
    const texCanvas = document.createElement('canvas');
    texCanvas.width = 512;
    texCanvas.height = 512;
    const ctx = texCanvas.getContext('2d');
    ctx.fillStyle = '#151011';
    ctx.fillRect(0, 0, 512, 512);

    // Variación orgánica en las baldosas de basalto
    const tile = 64;
    for (let y = 0; y < 512; y += tile) {
      for (let x = 0; x < 512; x += tile) {
        const shade = ((x * 7 + y * 13) % 11) - 5;
        const r = 24 + shade;
        const g = 18 + Math.round(shade * 0.7);
        const b = 19 + Math.round(shade * 0.7);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
      }
    }
    ctx.strokeStyle = '#0B0809';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 512; i += tile) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    this.floorTex = new THREE.CanvasTexture(texCanvas);
    this.floorTex.wrapS = THREE.RepeatWrapping;
    this.floorTex.wrapT = THREE.RepeatWrapping;
    this.floorTex.repeat.set(4, 6.2);
    this.floorTex.colorSpace = THREE.SRGBColorSpace;
    this.assets.textures.push(this.floorTex);

    // Suelo principal jugable
    const floorGeo = new THREE.PlaneGeometry(ARENA_BOUNDS.width, ARENA_BOUNDS.height);
    floorGeo.rotateX(-Math.PI / 2);
    this.assets.geometries.push(floorGeo);

    const floorMat = new THREE.MeshStandardMaterial({
      map: this.floorTex,
      roughness: 0.85,
      metalness: 0.12
    });
    this.assets.trackMaterial(floorMat);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = 0;
    this.worldGroup.add(floor);

    // Explanada exterior abisal para que nunca se vea corte vacío
    const voidFloorGeo = new THREE.PlaneGeometry(1100, 1300);
    voidFloorGeo.rotateX(-Math.PI / 2);
    this.assets.geometries.push(voidFloorGeo);
    const voidFloorMat = new THREE.MeshStandardMaterial({
      color: '#090707',
      roughness: 0.95
    });
    this.assets.trackMaterial(voidFloorMat);
    const voidFloor = new THREE.Mesh(voidFloorGeo, voidFloorMat);
    voidFloor.position.y = -2;
    this.worldGroup.add(voidFloor);

    // Sello ritual geométrico central del Relicario (anillos y rombo)
    const outerSealGeo = new THREE.RingGeometry(118, 122, 64);
    outerSealGeo.rotateX(-Math.PI / 2);
    this.assets.geometries.push(outerSealGeo);
    const sealMat = new THREE.MeshBasicMaterial({
      color: '#3D2326',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.assets.trackMaterial(sealMat);
    const outerSeal = new THREE.Mesh(outerSealGeo, sealMat);
    outerSeal.position.y = 0.4;
    this.worldGroup.add(outerSeal);

    const innerSealGeo = new THREE.RingGeometry(82, 85, 4);
    innerSealGeo.rotateX(-Math.PI / 2);
    this.assets.geometries.push(innerSealGeo);
    const diamondSeal = new THREE.Mesh(innerSealGeo, sealMat);
    diamondSeal.position.y = 0.45;
    this.worldGroup.add(diamondSeal);

    const accentSealGeo = new THREE.RingGeometry(42, 44, 32);
    accentSealGeo.rotateX(-Math.PI / 2);
    this.assets.geometries.push(accentSealGeo);
    const goldSealMat = new THREE.MeshBasicMaterial({
      color: RELICARIO_PALETTE.liturgicalGold,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.assets.trackMaterial(goldSealMat);
    const coreSeal = new THREE.Mesh(accentSealGeo, goldSealMat);
    coreSeal.position.y = 0.5;
    this.worldGroup.add(coreSeal);

    // Bordillo perimetral de obsidiana y línea sutil de límite arena
    const halfW = ARENA_BOUNDS.width * 0.5;
    const halfH = ARENA_BOUNDS.height * 0.5;
    const borderGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-halfW, 1.2, -halfH),
      new THREE.Vector3(halfW, 1.2, -halfH),
      new THREE.Vector3(halfW, 1.2, halfH),
      new THREE.Vector3(-halfW, 1.2, halfH)
    ]);
    this.assets.geometries.push(borderGeo);
    const borderMat = new THREE.LineBasicMaterial({
      color: RELICARIO_PALETTE.vermilion,
      transparent: true,
      opacity: 0.42
    });
    this.assets.trackMaterial(borderMat);
    const borderLoop = new THREE.LineLoop(borderGeo, borderMat);
    this.worldGroup.add(borderLoop);

    const wallThick = 14;
    const wallH = 12;
    const wallMat = new THREE.MeshStandardMaterial({
      color: '#1E1517',
      roughness: 0.72,
      metalness: 0.25
    });
    this.assets.trackMaterial(wallMat);

    const wallConfigs = [
      { w: ARENA_BOUNDS.width + wallThick * 2, d: wallThick, x: 0, z: -(halfH + wallThick * 0.5) },
      { w: ARENA_BOUNDS.width + wallThick * 2, d: wallThick, x: 0, z: halfH + wallThick * 0.5 },
      { w: wallThick, d: ARENA_BOUNDS.height, x: -(halfW + wallThick * 0.5), z: 0 },
      { w: wallThick, d: ARENA_BOUNDS.height, x: halfW + wallThick * 0.5, z: 0 }
    ];
    for (const cfg of wallConfigs) {
      const mesh = new THREE.Mesh(this.assets.boxUnit, wallMat);
      mesh.scale.set(cfg.w, wallH, cfg.d);
      mesh.position.set(cfg.x, wallH * 0.5 - 1, cfg.z);
      this.worldGroup.add(mesh);
    }

    // Pilares góticos perimetrales con pebeteros encendidos
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

    for (const [px, pz] of pillarPositions) {
      const col = new THREE.Mesh(this.assets.cylUnit, wallMat);
      col.scale.set(11, 56, 11);
      col.position.set(px, 28, pz);
      this.worldGroup.add(col);

      const cap = new THREE.Mesh(this.assets.octaUnit, this.assets.matGold);
      cap.scale.set(6, 7, 6);
      cap.position.set(px, 59, pz);
      this.worldGroup.add(cap);

      const emberSpriteMat = new THREE.SpriteMaterial({
        map: this.assets.radialGlowTex,
        color: RELICARIO_PALETTE.emberOrange,
        transparent: true,
        opacity: 0.52,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      this.assets.trackMaterial(emberSpriteMat);
      const ember = new THREE.Sprite(emberSpriteMat);
      ember.scale.set(34, 34, 1);
      ember.position.set(px, 60, pz);
      this.worldGroup.add(ember);
    }
  }

  #buildAmbientEmbers() {
    const count = 48;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = randomRange(-ARENA_BOUNDS.width * 0.55, ARENA_BOUNDS.width * 0.55);
      positions[i * 3 + 1] = randomRange(4, 130);
      positions[i * 3 + 2] = randomRange(-ARENA_BOUNDS.height * 0.55, ARENA_BOUNDS.height * 0.55);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.assets.geometries.push(geo);

    const mat = new THREE.PointsMaterial({
      color: RELICARIO_PALETTE.emberOrange,
      size: 3.2,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.assets.trackMaterial(mat);
    this.emberPoints = new THREE.Points(geo, mat);
    this.worldGroup.add(this.emberPoints);
  }

  #buildPlayer() {
    this.playerVisual = buildPlayerAvatar3D(this.avatarId, this.assets);
    this.playerVisual.root.position.set(0, 0, 0);
    this.worldGroup.add(this.playerVisual.root);

    this.playerXPBar = new PlayerXPBar3D();
    this.playerXPBar.sprite.position.set(0, 44, -8);
    this.worldGroup.add(this.playerXPBar.sprite);
    this.playerXPBar.updateXP(0, 1, false);
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

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onWindowBlur);

    const dom = this.renderer.domElement;
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
      this.joystickOrigin = { x: e.clientX, y: e.clientY };
      this.pointerMoveInput = { dx: 0, dy: 0 };
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
      const dist = Math.hypot(dx, dyScreen);
      const maxR = 46.0;

      if (dist < 4.5) {
        this.pointerMoveInput = { dx: 0, dy: 0 };
        this.onJoystickChange?.({
          active: true,
          originX: this.joystickOrigin.x,
          originY: this.joystickOrigin.y,
          knobX: this.joystickOrigin.x,
          knobY: this.joystickOrigin.y
        });
        return;
      }

      const clamped = Math.min(dist, maxR);
      const nx = dx / dist;
      const nyScreen = dyScreen / dist;
      const throttle = clamped / maxR;

      // En pantalla, arrastrar arriba (dyScreen < 0) equivale a +simY
      this.pointerMoveInput = {
        dx: nx * throttle,
        dy: -nyScreen * throttle
      };

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
    this.pointerMoveInput = { dx: 0, dy: 0 };
    this.onJoystickChange?.({ active: false, originX: 0, originY: 0, knobX: 0, knobY: 0 });
  }

  #resolveMoveInput() {
    if (this.activePointerId !== null) {
      this.moveInput = { ...this.pointerMoveInput };
      return this.moveInput;
    }

    let kx = 0;
    let ky = 0;
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) kx -= 1;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) kx += 1;
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) ky += 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) ky -= 1;

    const mag = Math.hypot(kx, ky);
    if (mag > 0) {
      this.moveInput = { dx: kx / mag, dy: ky / mag };
    } else {
      this.moveInput = { dx: 0, dy: 0 };
    }
    return this.moveInput;
  }

  #handleResize() {
    if (this.isDisposed || !this.container) return;
    const width = Math.max(320, this.container.clientWidth || window.innerWidth);
    const height = Math.max(320, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  setUserPaused(paused) {
    this.isUserPaused = Boolean(paused);
    if (this.isUserPaused) {
      this.#releaseJoystick();
      this.keysDown.clear();
    } else {
      this.lastFrameTime = null;
    }
  }

  forceAbort() {
    if (this.hasEnded) return;
    this.#finishRun(false);
  }

  // MARK: - Bucle Principal (60/120 Hz)

  #startLoop() {
    let prevVisualMs = null;
    const tick = (nowMs) => {
      if (this.isDisposed) return;
      this.rafId = requestAnimationFrame(tick);

      const visualDt = prevVisualMs !== null ? Math.min(0.05, Math.max(0, (nowMs - prevVisualMs) * 0.001)) : 1 / 60;
      prevVisualMs = nowMs;

      if (!this.hasEnded && !this.isUserPaused) {
        const nowSec = nowMs * 0.001;
        const rawDt = this.lastFrameTime !== null ? nowSec - this.lastFrameTime : 1 / 60;
        this.lastFrameTime = nowSec;
        const dt = Math.min(Math.max(rawDt, 0), 1 / 24);
        this.#stepSimulation(dt);
      }

      if (!this.isUserPaused) {
        this.#updateVisualFX(visualDt);
      }
      this.renderer.render(this.scene, this.camera);
    };
    this.rafId = requestAnimationFrame(tick);
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
    this.playerVelocity = { dx: move.dx * effectiveSpeed, dy: move.dy * effectiveSpeed };

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

    // 2. Medición espacial y actualización del Índice de Estrés en vivo
    let nearestDist = 999;
    let dangerCount = 0;
    let panicCount = 0;
    for (const enemy of this.enemies) {
      const d = Math.hypot(enemy.pos.x - this.playerPos.x, enemy.pos.y - this.playerPos.y);
      if (d < nearestDist) nearestDist = d;
      if (d < 120) dangerCount += 1;
      if (d < 68) panicCount += 1;
    }

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
    const camHeight = isPortrait ? 335 : 375;
    const camBackZ = isPortrait ? 215 : 235;
    const lookBiasZ = isPortrait ? -24 : -10;

    let shakeX = 0;
    let shakeZ = 0;
    if (this.shakeTimer > 0) {
      const strength = this.shakeAmplitude * (this.shakeTimer / 0.16);
      shakeX = (Math.random() * 2 - 1) * strength;
      shakeZ = (Math.random() * 2 - 1) * strength;
    }

    const desiredTarget = new THREE.Vector3(
      this.playerPos.x * 0.58 + shakeX,
      12,
      -this.playerPos.y * 0.62 + lookBiasZ + shakeZ
    );
    const desiredCamPos = new THREE.Vector3(
      this.playerPos.x * 0.58 + shakeX,
      camHeight,
      -this.playerPos.y * 0.62 + camBackZ + shakeZ
    );

    const alpha = Math.min(1, Math.max(0.08, lerpFactor));
    this.cameraLookTarget.lerp(desiredTarget, alpha);
    this.camera.position.lerp(desiredCamPos, alpha);
    this.camera.lookAt(this.cameraLookTarget);
  }

  #animateAmbientEmbers(dt) {
    if (!this.emberPoints) return;
    const attr = this.emberPoints.geometry.getAttribute('position');
    for (let i = 0; i < attr.count; i++) {
      let y = attr.getY(i) + dt * 18;
      if (y > 140) y = 4;
      attr.setY(i, y);
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
    const mat = this.playerLevel >= 5
      ? this.assets.matGold
      : this.playerLevel >= 3
        ? this.assets.matColdSilver
        : this.assets.matIvory;

    for (const offset of spreadOffsets) {
      const shotAngle = angle + offset;
      const sx = this.playerPos.x + Math.cos(shotAngle) * 14;
      const sy = this.playerPos.y + Math.sin(shotAngle) * 14;

      const mesh = new THREE.Mesh(this.assets.playerShardGeo, mat);
      mesh.scale.setScalar(shardScale);
      mesh.position.set(sx, 14, -sy);
      mesh.rotation.y = shotAngle;
      this.worldGroup.add(mesh);

      this.projectiles.push({
        mesh,
        pos: { x: sx, y: sy },
        vel: { dx: Math.cos(shotAngle) * speed, dy: Math.sin(shotAngle) * speed },
        remainingLife: 1.05,
        damage
      });
    }

    this.audio?.triggerShoot();
    return angle;
  }

  #closestEnemy(maxRange) {
    let best = null;
    let bestDist = maxRange;
    for (const e of this.enemies) {
      const d = Math.hypot(e.pos.x - this.playerPos.x, e.pos.y - this.playerPos.y);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  #updateProjectiles(dt) {
    const survivors = [];
    const minX = ARENA_BOUNDS.minX - 40;
    const maxX = ARENA_BOUNDS.maxX + 40;
    const minY = ARENA_BOUNDS.minY - 40;
    const maxY = ARENA_BOUNDS.maxY + 40;

    for (const p of this.projectiles) {
      p.remainingLife -= dt;
      p.pos.x += p.vel.dx * dt;
      p.pos.y += p.vel.dy * dt;
      p.mesh.position.set(p.pos.x, 14, -p.pos.y);

      if (p.remainingLife <= 0 || p.pos.x < minX || p.pos.x > maxX || p.pos.y < minY || p.pos.y > maxY) {
        this.worldGroup.remove(p.mesh);
        continue;
      }

      const hitPadding = 6.5 + (p.damage - 1) * 1.2;
      let hitIdx = -1;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
        if (d <= e.hitRadius + hitPadding) {
          hitIdx = i;
          break;
        }
      }

      if (hitIdx >= 0) {
        this.#applyHitToEnemy(hitIdx, p.damage, p.vel, p.pos);
        this.worldGroup.remove(p.mesh);
      } else {
        survivors.push(p);
      }
    }

    this.projectiles = survivors;
  }

  #applyHitToEnemy(index, damage, impactVel, impactPos) {
    const enemy = this.enemies[index];
    enemy.hp -= damage;

    const sparkColor = enemy.archetype === 'jaula' ? RELICARIO_PALETTE.oldBone : RELICARIO_PALETTE.vermilion;
    this.#spawnBurst(impactPos.x, impactPos.y, sparkColor, 5, 85);

    const velMag = Math.max(1, Math.hypot(impactVel.dx, impactVel.dy));
    const knock = enemy.archetype === 'desollado' ? 5.5 : enemy.archetype === 'jaula' ? 1.2 : 4.0;
    enemy.pos.x += (impactVel.dx / velMag) * knock;
    enemy.pos.y += (impactVel.dy / velMag) * knock;
    enemy.visual.root.position.set(enemy.pos.x, 0, -enemy.pos.y);

    enemy.visual.triggerHitFlash();
    if (enemy.archetype === 'jaula') {
      enemy.visual.updateArmor(enemy.hp, enemy.maxHP, enemy.pos.x, enemy.pos.y);
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
      this.worldGroup.remove(enemy.visual.root);
      enemy.visual.dispose();
      this.enemies.splice(index, 1);
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

    let activeOrStartedLunges = this.enemies.reduce((count, e) => {
      if (e.archetype === 'martir' && (e.stalkerPhase.type === 'lunging' || e.stalkerPhase.type === 'telegraphing')) {
        return count + 1;
      }
      return count;
    }, 0);

    for (const enemy of this.enemies) {
      enemy.age += dt;
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
            enemy.visual.setPouncing(false);
          }
        } else {
          enemy.abilityCooldown -= dt;
          const pounceTriggerRange = 150.0 + tProgress * 35.0;
          if (enemy.abilityCooldown <= 0 && distToPlayer < pounceTriggerRange) {
            enemy.abilityActiveTimer = 0.38;
            enemy.abilityCooldown = randomRange(2.2, 3.2) * cooldownScale;
            enemy.visual.setPouncing(true);
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
        enemy.visual.updateVisual(dt, enemy.age, facingAngle);
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
            enemy.visual.triggerSpitTelegraph();
          }
        }
        enemy.visual.updateVisual(dt, enemy.age, angleToPlayer);
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
        enemy.visual.updateVisual(dt, enemy.age, facingAngle);
      }

      enemy.pos.x = Math.min(Math.max(enemy.pos.x, ARENA_BOUNDS.minX - 28), ARENA_BOUNDS.maxX + 28);
      enemy.pos.y = Math.min(Math.max(enemy.pos.y, ARENA_BOUNDS.minY - 28), ARENA_BOUNDS.maxY + 28);
      enemy.visual.root.position.set(enemy.pos.x, 0, -enemy.pos.y);
    }

    // Separación suave entre criaturas
    const count = this.enemies.length;
    if (count > 1) {
      for (let i = 0; i < count - 1; i++) {
        for (let j = i + 1; j < count; j++) {
          const a = this.enemies[i];
          const b = this.enemies[j];
          const dx = b.pos.x - a.pos.x;
          const dy = b.pos.y - a.pos.y;
          const minDist = (a.hitRadius + b.hitRadius) * 0.85;
          const d = Math.hypot(dx, dy);
          if (d > 0.01 && d < minDist) {
            const overlap = (minDist - d) * 0.38;
            const nx = dx / d;
            const ny = dy / d;
            a.pos.x -= nx * overlap;
            a.pos.y -= ny * overlap;
            b.pos.x += nx * overlap;
            b.pos.y += ny * overlap;
            a.visual.root.position.set(a.pos.x, 0, -a.pos.y);
            b.visual.root.position.set(b.pos.x, 0, -b.pos.y);
          }
        }
      }
    }

    // Colisión cuerpo a cuerpo contra el jugador
    if (this.invulnerabilityTimer <= 0) {
      for (const enemy of this.enemies) {
        const d = Math.hypot(enemy.pos.x - this.playerPos.x, enemy.pos.y - this.playerPos.y);
        if (d <= enemy.hitRadius + 10.5) {
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

    for (const offset of offsets) {
      const shotAngle = baseAngle + offset;
      const sx = origin.x + Math.cos(shotAngle) * 18;
      const sy = origin.y + Math.sin(shotAngle) * 18;

      const mesh = new THREE.Mesh(this.assets.boneBoltGeo, this.assets.matOrange);
      mesh.scale.setScalar(5.0);
      mesh.position.set(sx, 14, -sy);
      mesh.rotation.y = shotAngle;
      this.worldGroup.add(mesh);

      this.enemyProjectiles.push({
        mesh,
        pos: { x: sx, y: sy },
        vel: { dx: Math.cos(shotAngle) * speed, dy: Math.sin(shotAngle) * speed },
        remainingLife: 2.3,
        damage: boltDamage
      });
    }
  }

  #updateEnemyProjectiles(dt) {
    const survivors = [];
    const minX = ARENA_BOUNDS.minX - 36;
    const maxX = ARENA_BOUNDS.maxX + 36;
    const minY = ARENA_BOUNDS.minY - 36;
    const maxY = ARENA_BOUNDS.maxY + 36;

    for (const bolt of this.enemyProjectiles) {
      bolt.remainingLife -= dt;
      bolt.pos.x += bolt.vel.dx * dt;
      bolt.pos.y += bolt.vel.dy * dt;
      bolt.mesh.position.set(bolt.pos.x, 14, -bolt.pos.y);

      if (bolt.remainingLife <= 0 || bolt.pos.x < minX || bolt.pos.x > maxX || bolt.pos.y < minY || bolt.pos.y > maxY) {
        this.worldGroup.remove(bolt.mesh);
        continue;
      }

      const d = Math.hypot(bolt.pos.x - this.playerPos.x, bolt.pos.y - this.playerPos.y);
      if (d <= 13.5) {
        this.worldGroup.remove(bolt.mesh);
        if (this.invulnerabilityTimer <= 0 && !this.hasEnded) {
          this.#applyDamageToPlayer(bolt.damage);
        }
        continue;
      }

      survivors.push(bolt);
    }

    this.enemyProjectiles = survivors;
  }

  #updateStalker(enemy, dt, dirX, dirY, distToPlayer, angleToPlayer, directive, canStartNewLunge) {
    const tProgress = Math.min(1, Math.max(0, this.elapsedTime / TOTAL_RUN_DURATION));
    const cooldownScale = Math.max(0.55, 1.0 - tProgress * 0.42);
    const phase = enemy.stalkerPhase;

    if (phase.type === 'stalking') {
      enemy.visual.setTelegraph(false, 0);
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
      enemy.visual.setTelegraph(true, Math.min(275, distToPlayer + 40));

      phase.remaining -= dt;
      if (phase.remaining <= 0) {
        enemy.visual.setTelegraph(false, 0);
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
        const shockDist = Math.hypot(enemy.pos.x - this.playerPos.x, enemy.pos.y - this.playerPos.y);
        if (shockDist <= shockRadius && this.invulnerabilityTimer <= 0 && !this.hasEnded) {
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
    enemy.visual.setTelegraph(false, 0);
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

    const visual = createMedkit3D(this.assets);
    visual.root.position.set(pos.x, 0, -pos.y);
    this.worldGroup.add(visual.root);
    this.medkits.push({ visual, pos, age: 0 });
  }

  #updateMedkits(dt) {
    const remaining = [];
    for (const kit of this.medkits) {
      kit.age += dt;
      kit.visual.updateVisual(kit.age);

      let dx = this.playerPos.x - kit.pos.x;
      let dy = this.playerPos.y - kit.pos.y;
      let d = Math.hypot(dx, dy);

      if (d > 0.01 && d <= 96.0) {
        const pullSpeed = 155.0 + (1.0 - d / 96.0) * 140.0;
        const step = Math.min(d, pullSpeed * dt);
        kit.pos.x += (dx / d) * step;
        kit.pos.y += (dy / d) * step;
        kit.visual.root.position.set(kit.pos.x, 0, -kit.pos.y);
        dx = this.playerPos.x - kit.pos.x;
        dy = this.playerPos.y - kit.pos.y;
        d = Math.hypot(dx, dy);
      }

      if (d <= 30.0) {
        const prevHP = this.playerHP;
        this.playerHP = Math.min(PLAYER_MAX_HP, this.playerHP + 28);
        const actualHeal = this.playerHP - prevHP;
        this.medkitsCollected += 1;

        this.#spawnBurst(kit.pos.x, kit.pos.y, RELICARIO_PALETTE.graceJade, 14, 120);
        this.#spawnShockRing(this.playerPos.x, this.playerPos.y, RELICARIO_PALETTE.graceJade, 42);
        this.#spawnPopupText(
          actualHeal > 0 ? `+${actualHeal} HP` : 'VIDA MÁX',
          this.playerPos.x,
          this.playerPos.y + 34,
          RELICARIO_PALETTE.graceJade
        );

        this.worldGroup.remove(kit.visual.root);
        kit.visual.dispose();
        this.audio?.triggerHeal();
        this.#publishHUDNow(null);
      } else if (kit.age > 16.0) {
        this.worldGroup.remove(kit.visual.root);
        kit.visual.dispose();
      } else {
        remaining.push(kit);
      }
    }
    this.medkits = remaining;
  }

  #spawnEnemy(directive) {
    const archetype = this.#pickArchetype(directive);
    const spawnPoint = this.#pickSpawnPoint(directive);
    const tProgress = Math.min(1, Math.max(0, this.elapsedTime / TOTAL_RUN_DURATION));
    const cooldownScale = Math.max(0.58, 1.0 - tProgress * 0.40);

    let visual;
    let hp;
    let speed;
    let hitRadius;
    let contactDamage;
    let initialAbilityCD;

    if (archetype === 'desollado') {
      visual = createDesollado3D(this.assets);
      hp = 2 + Math.floor(this.elapsedTime / 16.0) + (this.playerLevel >= 5 ? 1 : 0);
      speed = randomRange(120, 144) * (1.0 + tProgress * 0.16);
      hitRadius = 12.5;
      contactDamage = 14 + Math.floor(this.elapsedTime / 20.0) * 2;
      initialAbilityCD = randomRange(1.4, 2.6) * cooldownScale;
    } else if (archetype === 'jaula') {
      visual = createJaula3D(this.assets, (rx, ry, spinAngle) => {
        this.#spawnDetachedRib(rx, ry, spinAngle);
      });
      hp = 18 + Math.floor(tProgress * 16.0);
      speed = randomRange(62, 72) * (1.0 + tProgress * 0.18);
      hitRadius = 25.5;
      contactDamage = 24 + Math.floor(this.elapsedTime / 25.0) * 3;
      initialAbilityCD = randomRange(2.2, 3.4) * cooldownScale;
    } else {
      visual = createMartir3D(this.assets);
      hp = 9 + Math.floor(tProgress * 8.0);
      speed = randomRange(102, 118) * (1.0 + tProgress * 0.16);
      hitRadius = 16.5;
      contactDamage = 18 + Math.floor(this.elapsedTime / 20.0) * 2;
      initialAbilityCD = randomRange(1.1, 1.8) * cooldownScale;
    }

    visual.root.position.set(spawnPoint.x, 0, -spawnPoint.y);
    this.worldGroup.add(visual.root);

    this.enemies.push({
      archetype,
      visual,
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
      stalkerPhase: { type: 'stalking', cooldown: initialAbilityCD }
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

  // MARK: - Efectos Visuales 3D Efímeros (Chispas, Ondas, Costillas, Fantasmas y Textos)

  #spawnBurst(x, y, colorHex, count, speedScale) {
    const color = new THREE.Color(colorHex);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.92
      });
      const mesh = new THREE.Mesh(this.assets.octaUnit, mat);
      const size = randomRange(2.0, 4.4);
      mesh.scale.setScalar(size);
      mesh.position.set(x, randomRange(8, 22), -y);
      this.worldGroup.add(mesh);

      const angle = randomRange(0, Math.PI * 2);
      const speed = randomRange(speedScale * 0.45, speedScale);
      this.effects.push({
        type: 'particle',
        mesh,
        mat,
        vx: Math.cos(angle) * speed,
        vy: randomRange(45, 110),
        vz: -Math.sin(angle) * speed,
        life: 0,
        maxLife: randomRange(0.24, 0.46)
      });
    }
  }

  #spawnShockRing(x, y, colorHex, maxRadius) {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(this.assets.ringGround, mat);
    mesh.position.set(x, 1.8, -y);
    mesh.scale.setScalar(6);
    this.worldGroup.add(mesh);

    this.effects.push({
      type: 'ring',
      mesh,
      mat,
      maxRadius,
      life: 0,
      maxLife: 0.34
    });
  }

  #spawnDetachedRib(x, y, spinAngle) {
    const mesh = new THREE.Mesh(this.assets.jaulaRibGeo, this.assets.matOldBone);
    mesh.position.set(x, 16, -y);
    mesh.rotation.y = spinAngle;
    this.worldGroup.add(mesh);
    const outAngle = randomRange(0, Math.PI * 2);
    const speed = randomRange(90, 150);
    this.effects.push({
      type: 'rib',
      mesh,
      vx: Math.cos(outAngle) * speed,
      vy: randomRange(65, 120),
      vz: -Math.sin(outAngle) * speed,
      life: 0,
      maxLife: 0.45
    });
  }

  #spawnGhostTrail(x, y, facingAngle) {
    const mat = new THREE.MeshBasicMaterial({
      color: RELICARIO_PALETTE.vermilion,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(this.assets.coneUnit, mat);
    mesh.scale.set(10, 14, 10);
    mesh.position.set(x, 13, -y);
    mesh.rotation.y = facingAngle + Math.PI * 0.5;
    this.worldGroup.add(mesh);

    this.effects.push({
      type: 'ghost',
      mesh,
      mat,
      life: 0,
      maxLife: 0.22
    });
  }

  #spawnPopupText(text, x, y, colorHex) {
    const popup = createFloatingTextSprite3D(text, colorHex);
    popup.sprite.position.set(x, 42, -y);
    this.worldGroup.add(popup.sprite);
    this.effects.push({
      type: 'popup',
      mesh: popup.sprite,
      popup,
      life: 0,
      maxLife: 0.72
    });
  }

  #updateVisualFX(dt) {
    if (this.effects.length === 0) return;
    const active = [];
    for (const fx of this.effects) {
      fx.life += dt;
      const t = Math.min(1, fx.life / fx.maxLife);
      if (t >= 1) {
        this.worldGroup.remove(fx.mesh);
        if (fx.mat) fx.mat.dispose();
        if (fx.popup) fx.popup.dispose();
        continue;
      }

      if (fx.type === 'particle') {
        fx.mesh.position.x += fx.vx * dt;
        fx.mesh.position.y = Math.max(1, fx.mesh.position.y + fx.vy * dt);
        fx.vy -= 260 * dt;
        fx.mesh.position.z += fx.vz * dt;
        fx.mat.opacity = (1 - t) * 0.92;
      } else if (fx.type === 'ring') {
        fx.mesh.scale.setScalar(6 + (fx.maxRadius - 6) * t);
        fx.mat.opacity = (1 - t) * 0.85;
      } else if (fx.type === 'rib') {
        fx.mesh.position.x += fx.vx * dt;
        fx.mesh.position.y = Math.max(2, fx.mesh.position.y + fx.vy * dt);
        fx.vy -= 300 * dt;
        fx.mesh.position.z += fx.vz * dt;
        fx.mesh.rotation.x += dt * 7;
        fx.mesh.scale.setScalar(1 - t * 0.75);
      } else if (fx.type === 'ghost') {
        fx.mat.opacity = (1 - t) * 0.45;
        fx.mesh.scale.setScalar((1 - t * 0.35) * 10);
      } else if (fx.type === 'popup') {
        fx.mesh.position.y += dt * 36;
        fx.popup.material.opacity = 1 - t * t;
      }
      active.push(fx);
    }
    this.effects = active;
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

    const dom = this.renderer?.domElement;
    if (dom) {
      dom.removeEventListener('pointerdown', this._onPointerDown);
      dom.removeEventListener('pointermove', this._onPointerMove);
      dom.removeEventListener('pointerup', this._onPointerEnd);
      dom.removeEventListener('pointercancel', this._onPointerEnd);
      if (dom.parentNode === this.container) {
        this.container.removeChild(dom);
      }
    }

    for (const e of this.enemies) e.visual.dispose();
    for (const k of this.medkits) k.visual.dispose();
    for (const fx of this.effects) {
      if (fx.mat) fx.mat.dispose();
      if (fx.popup) fx.popup.dispose();
    }
    this.playerXPBar?.dispose();
    this.assets?.dispose();
    this.renderer?.dispose();
  }
}
