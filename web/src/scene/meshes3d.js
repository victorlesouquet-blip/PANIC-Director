// Modelos 3D 100% procedurales en Three.js para los 12 avatares, 3 arquetipos grotescos, botiquines, proyectiles y barra XP flotante

import * as THREE from 'three';
import { PLAYER_AVATAR_MAP, RELICARIO_PALETTE } from '../engine/constants.js';

export class SharedThreeAssets {
  constructor() {
    this.geometries = [];
    this.materials = [];
    this.textures = [];

    // Geometrías comunes para entidades repetidas (rendimiento móvil 60fps)
    this.sphereUnit = this.#trackGeo(new THREE.SphereGeometry(1, 14, 12));
    this.icosaUnit = this.#trackGeo(new THREE.IcosahedronGeometry(1, 1));
    this.octaUnit = this.#trackGeo(new THREE.OctahedronGeometry(1, 0));
    this.coneUnit = this.#trackGeo(new THREE.ConeGeometry(1, 2, 10));
    this.cylUnit = this.#trackGeo(new THREE.CylinderGeometry(1, 1, 1, 10));
    this.boxUnit = this.#trackGeo(new THREE.BoxGeometry(1, 1, 1));
    this.torusUnit = this.#trackGeo(new THREE.TorusGeometry(1, 0.14, 8, 28));
    this.ringGround = this.#trackGeo(new THREE.RingGeometry(0.78, 1.0, 28));
    this.ringGround.rotateX(-Math.PI / 2);

    // Ala dentada ósea 3D del Desollado
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(-4, 12);
    wingShape.lineTo(-10, 17);
    wingShape.lineTo(-5, 9);
    wingShape.lineTo(-11, 5);
    wingShape.lineTo(-3, 2);
    wingShape.closePath();
    this.desolladoWingGeo = this.#trackGeo(
      new THREE.ExtrudeGeometry(wingShape, { depth: 1.8, bevelEnabled: false })
    );
    this.desolladoWingGeo.center();

    // Costilla mandibular curvada 3D de la Jaula de Vísceras
    const ribShape = new THREE.Shape();
    ribShape.moveTo(-4, 15);
    ribShape.lineTo(0, 27);
    ribShape.lineTo(6, 20);
    ribShape.lineTo(13, 21);
    ribShape.lineTo(16, 13);
    ribShape.lineTo(9, 12);
    ribShape.lineTo(3, 16);
    ribShape.closePath();
    this.jaulaRibGeo = this.#trackGeo(
      new THREE.ExtrudeGeometry(ribShape, { depth: 4.5, bevelEnabled: true, bevelSize: 0.6, bevelThickness: 0.6, bevelSegments: 1 })
    );

    // Proyectil shard 3D del jugador
    this.playerShardGeo = this.#trackGeo(new THREE.OctahedronGeometry(1, 0));
    this.playerShardGeo.scale(2.1, 0.75, 0.75);

    // Esquirla ósea 3D de la Jaula
    this.boneBoltGeo = this.#trackGeo(new THREE.OctahedronGeometry(1, 0));
    this.boneBoltGeo.scale(1.6, 0.6, 0.6);

    // Halo roto del Mártir (dos arcos 3D)
    this.martirHaloArc1 = this.#trackGeo(new THREE.TorusGeometry(13.5, 1.15, 7, 18, Math.PI * 0.75));
    this.martirHaloArc2 = this.#trackGeo(new THREE.TorusGeometry(10.5, 0.95, 7, 14, Math.PI * 0.56));

    // Textura radial brillante compartida para halos en el suelo
    this.radialGlowTex = this.#createRadialGlowTexture();

    // Materiales compartidos
    this.matVoid = this.#mat({ color: RELICARIO_PALETTE.voidBlack, roughness: 0.55, metalness: 0.25 });
    this.matDarkFlesh = this.#mat({ color: '#2B151A', emissive: '#3D0914', emissiveIntensity: 0.4, roughness: 0.65 });
    this.matIvory = this.#mat({ color: RELICARIO_PALETTE.ivory, emissive: '#3B342D', emissiveIntensity: 0.22, roughness: 0.45 });
    this.matOldBone = this.#mat({ color: RELICARIO_PALETTE.oldBone, emissive: '#3A2A1C', emissiveIntensity: 0.25, roughness: 0.52 });
    this.matVermilion = this.#mat({ color: RELICARIO_PALETTE.vermilion, emissive: RELICARIO_PALETTE.vermilion, emissiveIntensity: 0.68, roughness: 0.35 });
    this.matVisceral = this.#mat({ color: RELICARIO_PALETTE.visceralCore, emissive: '#8A0219', emissiveIntensity: 0.62, roughness: 0.4 });
    this.matGold = this.#mat({ color: RELICARIO_PALETTE.liturgicalGold, emissive: RELICARIO_PALETTE.liturgicalGold, emissiveIntensity: 0.65, metalness: 0.4, roughness: 0.3 });
    this.matColdSilver = this.#mat({ color: RELICARIO_PALETTE.coldSilver, emissive: RELICARIO_PALETTE.coldSilver, emissiveIntensity: 0.52, roughness: 0.32 });
    this.matGraceJade = this.#mat({ color: RELICARIO_PALETTE.graceJade, emissive: RELICARIO_PALETTE.graceJade, emissiveIntensity: 0.75, roughness: 0.25 });
    this.matOrange = this.#mat({ color: RELICARIO_PALETTE.emberOrange, emissive: RELICARIO_PALETTE.emberOrange, emissiveIntensity: 0.6, roughness: 0.35 });
    this.matFlashWhite = this.#mat({ color: '#FFFFFF', emissive: '#FFFFFF', emissiveIntensity: 1.0, roughness: 0.1 });
  }

  #trackGeo(geo) {
    this.geometries.push(geo);
    return geo;
  }

  #mat(opts) {
    const m = new THREE.MeshStandardMaterial(opts);
    this.materials.push(m);
    return m;
  }

  trackMaterial(mat) {
    this.materials.push(mat);
    return mat;
  }

  #createRadialGlowTexture() {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 96;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(48, 48, 2, 48, 48, 48);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    const tex = new THREE.CanvasTexture(c);
    this.textures.push(tex);
    return tex;
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}

// MARK: - Barra de XP y Nivel flotante en 3D sobre el jugador

export class PlayerXPBar3D {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 160;
    this.canvas.height = 52;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.scale.set(52, 17, 1);
    this.sprite.renderOrder = 20;

    this.currentProgress = 0;
    this.targetProgress = 0;
    this.level = 1;
    this.pulseTimer = 0;
    this.#redraw();
  }

  updateXP(progress, level, leveledUp = false) {
    this.targetProgress = Math.min(1, Math.max(0, progress));
    this.level = level;
    if (leveledUp) {
      this.pulseTimer = 0.35;
      this.currentProgress = this.targetProgress;
    }
    this.#redraw();
  }

  tick(dt) {
    let dirty = false;
    if (Math.abs(this.currentProgress - this.targetProgress) > 0.005) {
      this.currentProgress += (this.targetProgress - this.currentProgress) * Math.min(1, dt * 12);
      dirty = true;
    }
    if (this.pulseTimer > 0) {
      this.pulseTimer = Math.max(0, this.pulseTimer - dt);
      const s = 1 + Math.sin((this.pulseTimer / 0.35) * Math.PI) * 0.28;
      this.sprite.scale.set(52 * s, 17 * s, 1);
      dirty = true;
    }
    if (dirty) this.#redraw();
  }

  #redraw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Nivel
    ctx.font = 'bold 20px "JetBrains Mono", Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = RELICARIO_PALETTE.liturgicalGold;
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.fillText(`NV.${this.level}`, canvas.width / 2, 24);
    ctx.shadowBlur = 0;

    // Fondo barra XP
    const bx = 18;
    const by = 29;
    const bw = 124;
    const bh = 14;
    ctx.fillStyle = 'rgba(8,6,6,0.90)';
    ctx.strokeStyle = 'rgba(230,204,178,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 6);
    ctx.fill();
    ctx.stroke();

    // Relleno XP
    const fillW = Math.max(0, (bw - 6) * this.currentProgress);
    if (fillW > 0.5) {
      ctx.fillStyle = this.level >= 3 ? RELICARIO_PALETTE.liturgicalGold : RELICARIO_PALETTE.coldSilver;
      ctx.beginPath();
      ctx.roundRect(bx + 3, by + 3, fillW, bh - 6, 4);
      ctx.fill();
    }
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    this.material.dispose();
  }
}

// MARK: - Constructor 3D para los 12 Avatares del Jugador

export function buildPlayerAvatar3D(avatarId, assets) {
  const def = PLAYER_AVATAR_MAP[avatarId] || PLAYER_AVATAR_MAP.penitente;
  const auraColor = new THREE.Color(def.auraColor);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Aro litúrgico luminoso en el suelo bajo el avatar
  const auraMat = new THREE.MeshBasicMaterial({
    color: auraColor,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  assets.trackMaterial(auraMat);
  const auraRing = new THREE.Mesh(assets.ringGround, auraMat);
  auraRing.scale.setScalar(20);
  auraRing.position.y = 0.6;
  root.add(auraRing);

  // Halo suave radial
  const glowSpriteMat = new THREE.SpriteMaterial({
    map: assets.radialGlowTex,
    color: auraColor,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  assets.trackMaterial(glowSpriteMat);
  const floorGlow = new THREE.Sprite(glowSpriteMat);
  floorGlow.scale.set(46, 46, 1);
  floorGlow.position.y = 0.8;
  root.add(floorGlow);

  // Manto base común del héroe
  const cloakMat = new THREE.MeshStandardMaterial({
    color: '#191316',
    emissive: auraColor,
    emissiveIntensity: 0.16,
    roughness: 0.55,
    metalness: 0.2
  });
  assets.trackMaterial(cloakMat);

  const torso = new THREE.Mesh(assets.coneUnit, cloakMat);
  torso.scale.set(10.5, 9.5, 10.5);
  torso.position.y = 9.5;
  body.add(torso);

  const head = new THREE.Mesh(assets.sphereUnit, assets.matVoid);
  head.scale.setScalar(6.5);
  head.position.y = 18;
  body.add(head);

  const trimMat = new THREE.MeshStandardMaterial({
    color: auraColor,
    emissive: auraColor,
    emissiveIntensity: 0.6,
    roughness: 0.3
  });
  assets.trackMaterial(trimMat);

  // Rasgos anatómicos 3D distintivos por arquetipo
  switch (def.id) {
    case 'penitente': {
      const capirote = new THREE.Mesh(assets.coneUnit, cloakMat);
      capirote.scale.set(7.5, 12.5, 7.5);
      capirote.position.y = 26;
      body.add(capirote);
      const eye = new THREE.Mesh(assets.octaUnit, assets.matGold);
      eye.scale.set(1.8, 3.2, 1.8);
      eye.position.set(0, 18.5, 6.2);
      body.add(eye);
      break;
    }
    case 'inquisidor': {
      const brim = new THREE.Mesh(assets.cylUnit, cloakMat);
      brim.scale.set(14.5, 1.5, 14.5);
      brim.position.y = 22.5;
      body.add(brim);
      const crown = new THREE.Mesh(assets.cylUnit, trimMat);
      crown.scale.set(6.8, 9.0, 6.8);
      crown.position.y = 27.5;
      body.add(crown);
      const eyeL = new THREE.Mesh(assets.sphereUnit, assets.matGraceJade);
      eyeL.scale.setScalar(1.5);
      eyeL.position.set(-2.6, 18.2, 6);
      const eyeR = eyeL.clone();
      eyeR.position.x = 2.6;
      body.add(eyeL, eyeR);
      break;
    }
    case 'serafin': {
      head.material = assets.matIvory;
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(assets.desolladoWingGeo, assets.matIvory);
        wing.scale.set(1.1, 1.1, 1.1);
        wing.position.set(side * 12, 18, -3);
        wing.rotation.set(0.3, side * 0.3, side * -0.4);
        body.add(wing);
      }
      const blindfold = new THREE.Mesh(assets.cylUnit, assets.matVermilion);
      blindfold.scale.set(6.9, 3.2, 6.9);
      blindfold.position.y = 18.5;
      const thirdEye = new THREE.Mesh(assets.octaUnit, assets.matGold);
      thirdEye.scale.setScalar(2.4);
      thirdEye.position.set(0, 22.5, 5.5);
      body.add(blindfold, thirdEye);
      break;
    }
    case 'cuervo': {
      const beak = new THREE.Mesh(assets.coneUnit, assets.matOldBone);
      beak.scale.set(3.2, 9.5, 3.2);
      beak.rotation.x = Math.PI * 0.54;
      beak.position.set(0, 17, 10.5);
      body.add(beak);
      for (const side of [-1, 1]) {
        const goggle = new THREE.Mesh(assets.sphereUnit, assets.matVermilion);
        goggle.scale.setScalar(2.1);
        goggle.position.set(side * 3.0, 19.2, 5.4);
        body.add(goggle);
      }
      break;
    }
    case 'verdugo': {
      const helm = new THREE.Mesh(assets.cylUnit, assets.matOldBone);
      helm.scale.set(7.4, 14, 7.4);
      helm.position.y = 20;
      const visor = new THREE.Mesh(assets.boxUnit, assets.matOrange);
      visor.scale.set(11.5, 2.4, 3);
      visor.position.set(0, 20.5, 6.4);
      body.add(helm, visor);
      break;
    }
    case 'oraculo': {
      head.material = assets.matIvory;
      for (const side of [-1, 1]) {
        const horn = new THREE.Mesh(assets.coneUnit, assets.matGold);
        horn.scale.set(2.2, 6.5, 2.2);
        horn.position.set(side * 6.5, 25, 0);
        horn.rotation.z = side * -0.45;
        body.add(horn);
      }
      const star = new THREE.Mesh(assets.octaUnit, assets.matColdSilver);
      star.scale.setScalar(2.5);
      star.position.set(0, 21.5, 6.2);
      body.add(star);
      break;
    }
    case 'golem': {
      head.material = assets.matOldBone;
      torso.material = assets.matOldBone;
      for (const side of [-1, 1]) {
        const horn = new THREE.Mesh(assets.coneUnit, assets.matVermilion);
        horn.scale.set(3.2, 8.5, 3.2);
        horn.position.set(side * 7.5, 25, 0);
        horn.rotation.z = side * -0.5;
        body.add(horn);
      }
      const scar = new THREE.Mesh(assets.boxUnit, assets.matVermilion);
      scar.scale.set(7.5, 2.0, 2.0);
      scar.position.set(0, 14.5, 6.8);
      body.add(scar);
      break;
    }
    case 'espectro': {
      cloakMat.transparent = true;
      cloakMat.opacity = 0.85;
      torso.scale.set(12, 13, 12);
      for (const [x, y] of [[-2.6, 19.5], [2.6, 19.5], [0, 16.2]]) {
        const eye = new THREE.Mesh(assets.sphereUnit, assets.matGraceJade);
        eye.scale.setScalar(1.4);
        eye.position.set(x, y, 6.0);
        body.add(eye);
      }
      break;
    }
    case 'automata': {
      head.material = assets.matGold;
      const astrolabe = new THREE.Mesh(assets.torusUnit, assets.matGold);
      astrolabe.scale.setScalar(12.5);
      astrolabe.position.y = 18.5;
      astrolabe.rotation.x = Math.PI * 0.35;
      const core = new THREE.Mesh(assets.octaUnit, assets.matColdSilver);
      core.scale.setScalar(4.2);
      core.position.set(0, 18.5, 6.2);
      body.add(astrolabe, core);
      body.userData.spinPart = astrolabe;
      break;
    }
    case 'templario': {
      head.material = assets.matIvory;
      const crossH = new THREE.Mesh(assets.boxUnit, assets.matGold);
      crossH.scale.set(12, 2.4, 2.4);
      crossH.position.set(0, 20.5, 6.4);
      const crossV = new THREE.Mesh(assets.boxUnit, assets.matGold);
      crossV.scale.set(2.6, 12, 2.4);
      crossV.position.set(0, 19.5, 6.5);
      body.add(crossH, crossV);
      break;
    }
    case 'brujo': {
      for (const side of [-1, 1]) {
        const spike = new THREE.Mesh(assets.coneUnit, assets.matVermilion);
        spike.scale.set(2.4, 9.5, 2.4);
        spike.position.set(side * 5.8, 25.5, 0);
        spike.rotation.z = side * -0.35;
        body.add(spike);
      }
      const flame = new THREE.Mesh(assets.octaUnit, assets.matGold);
      flame.scale.setScalar(3.2);
      flame.position.y = 28.5;
      body.add(flame);
      break;
    }
    case 'heraldo':
    default: {
      const crescent = new THREE.Mesh(assets.martirHaloArc1, assets.matColdSilver);
      crescent.scale.setScalar(0.9);
      crescent.position.y = 26.5;
      crescent.rotation.z = -Math.PI * 0.87;
      const faceDiamond = new THREE.Mesh(assets.octaUnit, assets.matGraceJade);
      faceDiamond.scale.set(4.5, 6.0, 2.5);
      faceDiamond.position.set(0, 18, 5.2);
      body.add(crescent, faceDiamond);
      break;
    }
  }

  // Farolillo orbital de auto-disparo
  const aimOrbit = new THREE.Group();
  aimOrbit.position.y = 14;
  root.add(aimOrbit);
  const lantern = new THREE.Mesh(assets.octaUnit, assets.matIvory);
  lantern.scale.set(3.2, 2.2, 2.2);
  lantern.position.set(20, 0, 0);
  aimOrbit.add(lantern);

  return {
    root,
    body,
    aimOrbit,
    lantern,
    auraRing,
    floorGlow,
    walkPhase: 0,
    updateMotionAndAim(vx, vy, aimAngle, dt, elapsed) {
      const speed = Math.hypot(vx, vy);
      if (speed > 14) {
        this.walkPhase += dt * 14.0;
        body.rotation.z = Math.sin(this.walkPhase) * 0.11;
        body.position.y = Math.abs(Math.sin(this.walkPhase)) * 2.2;
        const targetFacing = Math.atan2(vx, -vy);
        body.rotation.y = targetFacing;
      } else {
        body.rotation.z *= 0.85;
        body.position.y = Math.sin(elapsed * 3.0) * 1.1;
      }

      if (body.userData.spinPart) {
        body.userData.spinPart.rotation.y += dt * 2.4;
      }

      if (aimAngle !== null) {
        // Logical angle: atan2(dy, dx) -> Three.js Y rotation maps +X forward at 0, +Y logical (-Z Three) at +PI/2
        aimOrbit.rotation.y = aimAngle;
        lantern.visible = true;
      } else if (speed > 14) {
        aimOrbit.rotation.y = Math.atan2(vy, vx);
        lantern.visible = true;
      } else {
        lantern.visible = false;
      }
    }
  };
}

// MARK: - Criatura 1: Querubín Desollado (3D)

export function createDesollado3D(assets) {
  const root = new THREE.Group();

  const glowMat = new THREE.SpriteMaterial({
    map: assets.radialGlowTex,
    color: RELICARIO_PALETTE.vermilion,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  assets.trackMaterial(glowMat);
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(36, 36, 1);
  glow.position.y = 1.0;
  root.add(glow);

  const eyeMesh = new THREE.Mesh(assets.sphereUnit, assets.matIvory);
  eyeMesh.scale.set(8.2, 7.6, 8.2);
  eyeMesh.position.y = 12;
  root.add(eyeMesh);

  const iris = new THREE.Mesh(assets.sphereUnit, assets.matVermilion);
  iris.scale.set(4.5, 4.5, 2.2);
  iris.position.set(0, 12, 6.8);
  root.add(iris);

  const pupil = new THREE.Mesh(assets.octaUnit, assets.matVoid);
  pupil.scale.set(1.5, 4.2, 1.5);
  pupil.position.set(0, 12, 8.2);
  root.add(pupil);

  const leftWing = new THREE.Mesh(assets.desolladoWingGeo, assets.matDarkFlesh);
  leftWing.position.set(-7.5, 13, -1);
  leftWing.scale.set(0.95, 0.95, 0.95);
  root.add(leftWing);

  const rightWing = new THREE.Mesh(assets.desolladoWingGeo, assets.matDarkFlesh);
  rightWing.scale.set(-0.95, 0.95, 0.95);
  rightWing.position.set(7.5, 13, -1);
  root.add(rightWing);

  let flashTimer = 0;
  let isPouncing = false;

  return {
    root,
    setPouncing(active) {
      if (isPouncing === active) return;
      isPouncing = active;
      glowMat.color.set(active ? RELICARIO_PALETTE.liturgicalGold : RELICARIO_PALETTE.vermilion);
      glowMat.opacity = active ? 0.85 : 0.42;
      glow.scale.setScalar(active ? 46 : 36);
    },
    triggerHitFlash() {
      flashTimer = 0.08;
      eyeMesh.material = assets.matFlashWhite;
    },
    updateVisual(dt, age, angleToTarget) {
      root.rotation.y = angleToTarget + Math.PI * 0.5;
      // Aleteo espasmódico asimétrico
      leftWing.rotation.z = Math.sin(age * 22.0) * 0.42 + 0.15;
      rightWing.rotation.z = -Math.sin(age * 18.5 + 0.7) * 0.46 - 0.15;
      root.position.y = Math.sin(age * 9.0) * 2.0;

      // Tic nervioso de la pupila
      const twitch = Math.sin(age * 16.0) > 0.86 ? 1.45 : 1.0;
      pupil.scale.x = 1.5 * twitch;

      if (flashTimer > 0) {
        flashTimer -= dt;
        if (flashTimer <= 0) {
          eyeMesh.material = assets.matIvory;
        }
      }
    },
    dispose() {
      glowMat.dispose();
    }
  };
}

// MARK: - Criatura 2: Jaula de Vísceras (3D con 4 Costillas Desprendibles)

export function createJaula3D(assets, spawnDetachedRibFn) {
  const root = new THREE.Group();

  const glowMat = new THREE.SpriteMaterial({
    map: assets.radialGlowTex,
    color: RELICARIO_PALETTE.visceralCore,
    transparent: true,
    opacity: 0.52,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  assets.trackMaterial(glowMat);
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(68, 68, 1);
  glow.position.y = 1.2;
  root.add(glow);

  const frenzyRingMat = new THREE.MeshBasicMaterial({
    color: RELICARIO_PALETTE.liturgicalGold,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  assets.trackMaterial(frenzyRingMat);
  const frenzyRing = new THREE.Mesh(assets.ringGround, frenzyRingMat);
  frenzyRing.scale.setScalar(26);
  frenzyRing.position.y = 1.4;
  root.add(frenzyRing);

  const core = new THREE.Mesh(assets.icosaUnit, assets.matVisceral);
  core.scale.setScalar(13.5);
  core.position.y = 16;
  root.add(core);

  const eyeGroup = new THREE.Group();
  eyeGroup.position.y = 20;
  root.add(eyeGroup);

  const sclera = new THREE.Mesh(assets.sphereUnit, assets.matIvory);
  sclera.scale.set(7.5, 5.5, 6.0);
  sclera.position.z = 8.5;
  const iris = new THREE.Mesh(assets.sphereUnit, assets.matGold);
  iris.scale.setScalar(3.4);
  iris.position.z = 13.0;
  const slit = new THREE.Mesh(assets.boxUnit, assets.matVoid);
  slit.scale.set(1.6, 5.5, 1.5);
  slit.position.z = 15.6;
  eyeGroup.add(sclera, iris, slit);

  const armorRing = new THREE.Group();
  armorRing.position.y = 16;
  root.add(armorRing);

  const jawRibs = [];
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(assets.jaulaRibGeo, assets.matOldBone);
    const angle = i * (Math.PI * 0.5);
    rib.position.set(Math.cos(angle) * 6, -2, Math.sin(angle) * 6);
    rib.rotation.x = Math.PI * 0.35;
    rib.rotation.y = -angle;
    armorRing.add(rib);
    jawRibs.push(rib);
  }

  let flashTimer = 0;
  let isFrenzied = false;
  let spitPulse = 0;
  let spinSpeed = 1.25;

  return {
    root,
    triggerHitFlash() {
      flashTimer = 0.08;
      core.material = assets.matFlashWhite;
    },
    triggerSpitTelegraph() {
      spitPulse = 0.42;
    },
    updateArmor(hp, maxHP, worldX, worldY) {
      const ratio = hp / Math.max(1, maxHP);
      let targetRibs;
      if (ratio <= 0.30) targetRibs = 0;
      else if (ratio > 0.78) targetRibs = 4;
      else if (ratio > 0.62) targetRibs = 3;
      else if (ratio > 0.45) targetRibs = 2;
      else targetRibs = 1;

      while (jawRibs.length > targetRibs) {
        const detached = jawRibs.pop();
        armorRing.remove(detached);
        spawnDetachedRibFn(worldX, worldY, armorRing.rotation.y);
      }

      const lostCount = 4 - jawRibs.length;
      spinSpeed = 1.25 * (1.0 + lostCount * 0.48);

      if (jawRibs.length === 0 && !isFrenzied) {
        isFrenzied = true;
        glowMat.color.set(RELICARIO_PALETTE.liturgicalGold);
        glowMat.opacity = 0.78;
      }
    },
    updateVisual(dt, age, angleToTarget) {
      // Latido visceral continuo
      const pulse = 13.5 * (1.0 + Math.sin(age * 7.5) * 0.09);
      core.scale.setScalar(pulse);
      armorRing.rotation.y += dt * spinSpeed;
      eyeGroup.rotation.y = angleToTarget + Math.PI * 0.5;

      if (spitPulse > 0) {
        spitPulse -= dt;
        glow.scale.setScalar(68 * 1.45);
        glowMat.opacity = 0.9;
      } else {
        glow.scale.setScalar(68);
        glowMat.opacity = isFrenzied ? 0.78 : 0.52;
      }

      if (isFrenzied) {
        const phase = (age * 2.2) % 1.0;
        frenzyRing.scale.setScalar(20 + phase * 22);
        frenzyRingMat.opacity = (1.0 - phase) * 0.75;
      }

      if (flashTimer > 0) {
        flashTimer -= dt;
        if (flashTimer <= 0) {
          core.material = assets.matVisceral;
        }
      }
    },
    dispose() {
      glowMat.dispose();
      frenzyRingMat.dispose();
    }
  };
}

// MARK: - Criatura 3: Mártir Descoyuntado (3D con Halo Fracturado y Láser Telegrafiado)

export function createMartir3D(assets) {
  const root = new THREE.Group();

  const glowMat = new THREE.SpriteMaterial({
    map: assets.radialGlowTex,
    color: RELICARIO_PALETTE.vermilion,
    transparent: true,
    opacity: 0.36,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  assets.trackMaterial(glowMat);
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(46, 46, 1);
  glow.position.y = 1.1;
  root.add(glow);

  // Torso retorcido oscuro
  const torso = new THREE.Mesh(assets.coneUnit, assets.matVoid);
  torso.scale.set(11, 14, 11);
  torso.position.y = 14;
  torso.rotation.x = 0.24;
  root.add(torso);

  const spineTrim = new THREE.Mesh(assets.octaUnit, assets.matVermilion);
  spineTrim.scale.set(7.2, 12.5, 4.5);
  spineTrim.position.y = 14;
  root.add(spineTrim);

  // Ojo en el pecho
  const chestEye = new THREE.Mesh(assets.sphereUnit, assets.matVermilion);
  chestEye.scale.set(2.5, 4.2, 2.5);
  chestEye.position.set(0, 14.5, 8.0);
  root.add(chestEye);

  // Brazos guadaña asimétricos
  const leftArm = new THREE.Mesh(assets.coneUnit, assets.matOldBone);
  leftArm.scale.set(2.2, 11.5, 2.2);
  leftArm.position.set(-9.5, 13, 6.5);
  leftArm.rotation.set(Math.PI * 0.42, 0, 0.45);
  root.add(leftArm);

  const rightArm = new THREE.Mesh(assets.coneUnit, assets.matOldBone);
  rightArm.scale.set(2.2, 11.5, 2.2);
  rightArm.position.set(9.5, 13, 6.5);
  rightArm.rotation.set(Math.PI * 0.42, 0, -0.58);
  root.add(rightArm);

  // Halo litúrgico fracturado flotando atrás/arriba
  const haloGroup = new THREE.Group();
  haloGroup.position.set(0, 26, -3);
  const arc1 = new THREE.Mesh(assets.martirHaloArc1, assets.matGold);
  const arc2 = new THREE.Mesh(assets.martirHaloArc2, assets.matGold);
  arc2.rotation.z = Math.PI * 0.9;
  haloGroup.add(arc1, arc2);
  root.add(haloGroup);

  // Láser de telégrafo en el suelo/pecho + retícula rombo
  const laserMat = new THREE.MeshBasicMaterial({
    color: RELICARIO_PALETTE.liturgicalGold,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  assets.trackMaterial(laserMat);
  const laserBeam = new THREE.Mesh(assets.boxUnit, laserMat);
  laserBeam.scale.set(2.8, 1.4, 1);
  laserBeam.position.set(0, 12, 0);
  laserBeam.visible = false;
  root.add(laserBeam);

  const reticleMat = new THREE.MeshBasicMaterial({
    color: RELICARIO_PALETTE.liturgicalGold,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide
  });
  assets.trackMaterial(reticleMat);
  const reticle = new THREE.Mesh(assets.ringGround, reticleMat);
  reticle.scale.setScalar(11);
  reticle.position.set(0, 2, 0);
  reticle.visible = false;
  root.add(reticle);

  let flashTimer = 0;

  return {
    root,
    setTelegraph(active, distance) {
      if (active) {
        const reticleDist = Math.max(60, distance);
        const beamLen = Math.max(48, reticleDist - 12);
        laserBeam.visible = true;
        laserBeam.scale.set(2.8, 1.8, beamLen);
        laserBeam.position.set(0, 11, 10 + beamLen * 0.5);
        reticle.visible = true;
        reticle.position.set(0, 2.2, reticleDist);
        chestEye.material = assets.matGold;
        chestEye.scale.set(4.0, 5.2, 4.0);
      } else {
        laserBeam.visible = false;
        reticle.visible = false;
        chestEye.material = assets.matVermilion;
        chestEye.scale.set(2.5, 4.2, 2.5);
      }
    },
    triggerHitFlash() {
      flashTimer = 0.08;
      torso.material = assets.matFlashWhite;
      spineTrim.material = assets.matFlashWhite;
    },
    updateVisual(dt, age, facingAngle) {
      root.rotation.y = facingAngle + Math.PI * 0.5;
      haloGroup.rotation.z += dt * 1.9;
      // Tics bruscos de brazos
      const twitchL = Math.sin(age * 11.0) > 0.85 ? 0.95 : 0.45;
      const twitchR = Math.cos(age * 14.0) > 0.85 ? -1.05 : -0.58;
      leftArm.rotation.z = twitchL;
      rightArm.rotation.z = twitchR;

      if (reticle.visible) {
        reticle.rotation.y += dt * 4.5;
      }

      if (flashTimer > 0) {
        flashTimer -= dt;
        if (flashTimer <= 0) {
          torso.material = assets.matVoid;
          spineTrim.material = assets.matVermilion;
        }
      }
    },
    dispose() {
      glowMat.dispose();
      laserMat.dispose();
      reticleMat.dispose();
    }
  };
}

// MARK: - Botiquín 3D (Gota de Gracia)

export function createMedkit3D(assets) {
  const root = new THREE.Group();

  const glowMat = new THREE.SpriteMaterial({
    map: assets.radialGlowTex,
    color: RELICARIO_PALETTE.graceJade,
    transparent: true,
    opacity: 0.62,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  assets.trackMaterial(glowMat);
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(50, 50, 1);
  glow.position.y = 1.4;
  root.add(glow);

  const ringMat = new THREE.MeshBasicMaterial({
    color: RELICARIO_PALETTE.graceJade,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  assets.trackMaterial(ringMat);
  const pulseRing = new THREE.Mesh(assets.ringGround, ringMat);
  pulseRing.position.y = 1.2;
  root.add(pulseRing);

  const crystal = new THREE.Mesh(assets.octaUnit, assets.matGraceJade);
  crystal.scale.set(9.5, 13.5, 9.5);
  crystal.position.y = 15;
  root.add(crystal);

  const crossH = new THREE.Mesh(assets.boxUnit, assets.matIvory);
  crossH.scale.set(11, 2.8, 11);
  crossH.position.y = 15;
  const crossV = new THREE.Mesh(assets.boxUnit, assets.matIvory);
  crossV.scale.set(2.8, 11, 11);
  crossV.position.y = 15;
  root.add(crossH, crossV);

  return {
    root,
    updateVisual(age) {
      crystal.rotation.y = age * 2.2;
      crystal.position.y = 15 + Math.sin(age * 4.5) * 2.5;
      crossH.position.y = crystal.position.y;
      crossV.position.y = crystal.position.y;
      crossH.rotation.y = crystal.rotation.y;
      crossV.rotation.y = crystal.rotation.y;

      const ringPhase = (age * 1.4) % 1.0;
      pulseRing.scale.setScalar(13 + ringPhase * 11);
      ringMat.opacity = (1.0 - ringPhase) * 0.72;
    },
    dispose() {
      glowMat.dispose();
      ringMat.dispose();
    }
  };
}

// MARK: - Popups flotantes 3D ("+28 HP", "¡NIVEL X! +PODER")

export function createFloatingTextSprite3D(text, colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 56;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 26px "JetBrains Mono", Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = colorHex;
  ctx.fillText(text, 128, 28);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(92, 20, 1);
  sprite.renderOrder = 25;

  return {
    sprite,
    dispose() {
      tex.dispose();
      mat.dispose();
    }
  };
}
