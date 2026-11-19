// Modelos 3D 100% procedurales en Three.js con InstancedMesh, materiales Lambert/Phong rápidos, pools sin GC y barra XP optimizada

import * as THREE from 'three';
import { PLAYER_AVATAR_MAP, RELICARIO_PALETTE } from '../engine/constants.js';

const _dummy = new THREE.Object3D();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

function createShareableInstancedGeo(baseGeo, attrName, array) {
  const geo = new THREE.BufferGeometry();
  geo.index = baseGeo.index;
  for (const key in baseGeo.attributes) {
    geo.setAttribute(key, baseGeo.attributes[key]);
  }
  const attr = new THREE.InstancedBufferAttribute(array, 1);
  attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute(attrName, attr);
  return { geo, attr };
}

function createFlashableLambertMaterial(opts) {
  const mat = new THREE.MeshLambertMaterial(opts);
  mat.customProgramCacheKey = () => 'panic-flash-lambert-v1';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFlash;\nvarying float vFlash;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlash = aFlash;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlash;')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, vec3(1.5), vFlash);\n#include <opaque_fragment>');
  };
  return mat;
}

function createInstancedOpacityBasicMaterial(opts) {
  const mat = new THREE.MeshBasicMaterial(opts);
  mat.customProgramCacheKey = () => 'panic-opacity-basic-v1';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aOpacity;\nvarying float vOpacity;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOpacity = aOpacity;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vOpacity;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vOpacity;');
  };
  return mat;
}

function drawCrispText(ctx, text, x, y, colorHex) {
  ctx.fillStyle = 'rgba(0,0,0,0.92)';
  ctx.fillText(text, x + 1.5, y + 1.5);
  ctx.fillStyle = colorHex;
  ctx.fillText(text, x, y);
}

export class SharedThreeAssets {
  constructor() {
    this.geometries = [];
    this.materials = [];
    this.textures = [];
    this.popupTexCache = new Map();

    // Geometrías optimizadas para renderizado 60/120fps con siluetas 3D nítidas
    this.sphereUnit = this.#trackGeo(new THREE.SphereGeometry(1, 10, 8));
    this.icosaUnit = this.#trackGeo(new THREE.IcosahedronGeometry(1, 1));
    this.octaUnit = this.#trackGeo(new THREE.OctahedronGeometry(1, 0));
    this.coneUnit = this.#trackGeo(new THREE.ConeGeometry(1, 2, 8));
    this.cylUnit = this.#trackGeo(new THREE.CylinderGeometry(1, 1, 1, 8));
    this.boxUnit = this.#trackGeo(new THREE.BoxGeometry(1, 1, 1));
    this.torusUnit = this.#trackGeo(new THREE.TorusGeometry(1, 0.14, 6, 20));
    this.ringGround = this.#trackGeo(new THREE.RingGeometry(0.78, 1.0, 24));
    this.ringGround.rotateX(-Math.PI / 2);

    // Plano horizontal para halos luminosos en el suelo (1 solo draw call instanciado)
    this.glowQuadGeo = this.#trackGeo(new THREE.PlaneGeometry(1, 1));
    this.glowQuadGeo.rotateX(-Math.PI / 2);

    // Ala dentada ósea 3D del Desollado (centrada en Z=0 para simetría sin escala negativa)
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(-4, 12);
    wingShape.lineTo(-10, 17);
    wingShape.lineTo(-5, 9);
    wingShape.lineTo(-11, 5);
    wingShape.lineTo(-3, 2);
    wingShape.closePath();
    this.desolladoWingGeo = this.#trackGeo(
      new THREE.ExtrudeGeometry(wingShape, { depth: 1.8, bevelEnabled: false, curveSegments: 4 })
    );
    this.desolladoWingGeo.center();

    // Costilla mandibular curvada 3D de la Jaula de Vísceras (sin bevel costoso)
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
      new THREE.ExtrudeGeometry(ribShape, { depth: 4.2, bevelEnabled: false, curveSegments: 4 })
    );

    // Proyectil shard 3D del jugador
    this.playerShardGeo = this.#trackGeo(new THREE.OctahedronGeometry(1, 0));
    this.playerShardGeo.scale(2.1, 0.75, 0.75);

    // Esquirla ósea 3D de la Jaula
    this.boneBoltGeo = this.#trackGeo(new THREE.OctahedronGeometry(1, 0));
    this.boneBoltGeo.scale(1.6, 0.6, 0.6);

    // Halo roto del Mártir (dos arcos 3D)
    this.martirHaloArc1 = this.#trackGeo(new THREE.TorusGeometry(13.5, 1.15, 6, 16, Math.PI * 0.75));
    this.martirHaloArc2 = this.#trackGeo(new THREE.TorusGeometry(10.5, 0.95, 6, 12, Math.PI * 0.56));

    // Textura radial brillante compartida para halos en el suelo
    this.radialGlowTex = this.#createRadialGlowTexture();

    // Textura blanca 1x1 para barra XP sin re-subidas a GPU
    const whiteData = new Uint8Array([255, 255, 255, 255]);
    this.white1x1Tex = new THREE.DataTexture(whiteData, 1, 1);
    this.white1x1Tex.needsUpdate = true;
    this.textures.push(this.white1x1Tex);

    // Materiales compartidos rápidos (Lambert/Phong en lugar de PBR Standard pesado)
    this.matVoid = this.#lambert({ color: RELICARIO_PALETTE.voidBlack });
    this.matDarkFlesh = this.#lambert({ color: '#2B151A', emissive: '#3D0914', emissiveIntensity: 0.45 });
    this.matIvory = this.#phong({ color: RELICARIO_PALETTE.ivory, emissive: '#3B342D', emissiveIntensity: 0.25, shininess: 28 });
    this.matOldBone = this.#lambert({ color: RELICARIO_PALETTE.oldBone, emissive: '#3A2A1C', emissiveIntensity: 0.28 });
    this.matVermilion = this.#phong({ color: RELICARIO_PALETTE.vermilion, emissive: RELICARIO_PALETTE.vermilion, emissiveIntensity: 0.68, shininess: 42 });
    this.matVisceral = this.#phong({ color: RELICARIO_PALETTE.visceralCore, emissive: '#8A0219', emissiveIntensity: 0.62, shininess: 35 });
    this.matGold = this.#phong({ color: RELICARIO_PALETTE.liturgicalGold, emissive: RELICARIO_PALETTE.liturgicalGold, emissiveIntensity: 0.65, shininess: 55 });
    this.matColdSilver = this.#phong({ color: RELICARIO_PALETTE.coldSilver, emissive: RELICARIO_PALETTE.coldSilver, emissiveIntensity: 0.52, shininess: 48 });
    this.matGraceJade = this.#phong({ color: RELICARIO_PALETTE.graceJade, emissive: RELICARIO_PALETTE.graceJade, emissiveIntensity: 0.72, shininess: 50 });
    this.matOrange = this.#phong({ color: RELICARIO_PALETTE.emberOrange, emissive: RELICARIO_PALETTE.emberOrange, emissiveIntensity: 0.62, shininess: 38 });
  }

  #trackGeo(geo) {
    this.geometries.push(geo);
    return geo;
  }

  trackGeometry(geo) {
    this.geometries.push(geo);
    return geo;
  }

  #lambert(opts) {
    const m = new THREE.MeshLambertMaterial(opts);
    this.materials.push(m);
    return m;
  }

  #phong(opts) {
    const m = new THREE.MeshPhongMaterial(opts);
    this.materials.push(m);
    return m;
  }

  trackMaterial(mat) {
    this.materials.push(mat);
    return mat;
  }

  getPopupTexture(text, colorHex) {
    const key = `${text}|${colorHex}`;
    let tex = this.popupTexCache.get(key);
    if (tex) return tex;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 56;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 26px "JetBrains Mono", Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawCrispText(ctx, text, 128, 28, colorHex);

    tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.popupTexCache.set(key, tex);
    this.textures.push(tex);
    return tex;
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
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(tex);
    return tex;
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.popupTexCache.clear();
  }
}

// MARK: - Barra de XP y Nivel flotante en 3D sobre el jugador (cero re-dibujos por frame)

export class PlayerXPBar3D {
  constructor(assets) {
    this.group = new THREE.Group();
    // Compatibilidad de propiedad .sprite para posicionamiento en mundo
    this.sprite = this.group;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 160;
    this.canvas.height = 52;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.badgeMaterial = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    this.badgeSprite = new THREE.Sprite(this.badgeMaterial);
    this.badgeSprite.scale.set(52, 17, 1);
    this.badgeSprite.renderOrder = 20;
    this.group.add(this.badgeSprite);

    this.fillMaterial = new THREE.SpriteMaterial({
      map: assets.white1x1Tex,
      color: RELICARIO_PALETTE.coldSilver,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    this.fillSprite = new THREE.Sprite(this.fillMaterial);
    this.fillSprite.renderOrder = 21;
    this.group.add(this.fillSprite);

    this.currentProgress = 0;
    this.targetProgress = 0;
    this.level = 1;
    this.drawnLevel = -1;
    this.pulseTimer = 0;
    this.#redrawFrame();
    this.#syncFillSprite(1);
  }

  updateXP(progress, level, leveledUp = false) {
    this.targetProgress = Math.min(1, Math.max(0, progress));
    this.level = level;
    if (leveledUp) {
      this.pulseTimer = 0.35;
      this.currentProgress = this.targetProgress;
    }
    if (this.drawnLevel !== this.level) {
      this.#redrawFrame();
      this.fillMaterial.color.set(this.level >= 3 ? RELICARIO_PALETTE.liturgicalGold : RELICARIO_PALETTE.coldSilver);
    }
    this.#syncFillSprite(this.#pulseScale());
  }

  tick(dt) {
    let changed = false;
    if (Math.abs(this.currentProgress - this.targetProgress) > 0.004) {
      this.currentProgress += (this.targetProgress - this.currentProgress) * Math.min(1, dt * 12);
      changed = true;
    }
    if (this.pulseTimer > 0) {
      this.pulseTimer = Math.max(0, this.pulseTimer - dt);
      changed = true;
    }
    if (changed) {
      const s = this.#pulseScale();
      this.badgeSprite.scale.set(52 * s, 17 * s, 1);
      this.#syncFillSprite(s);
    }
  }

  #pulseScale() {
    if (this.pulseTimer <= 0) return 1;
    return 1 + Math.sin((this.pulseTimer / 0.35) * Math.PI) * 0.28;
  }

  #syncFillSprite(s) {
    const fillW = 38.35 * this.currentProgress * s;
    if (fillW <= 0.25) {
      this.fillSprite.visible = false;
      return;
    }
    this.fillSprite.visible = true;
    this.fillSprite.scale.set(fillW, 2.615 * s, 1);
    this.fillSprite.center.set((19.175 * s) / fillW, 1.75);
  }

  #redrawFrame() {
    const { ctx, canvas } = this;
    this.drawnLevel = this.level;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Nivel (sin ctx.shadowBlur para evitar blur CPU por cada frame)
    ctx.font = 'bold 20px "JetBrains Mono", Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    drawCrispText(ctx, `NV.${this.level}`, canvas.width / 2, 24, RELICARIO_PALETTE.liturgicalGold);

    // Marco barra XP
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

    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    this.badgeMaterial.dispose();
    this.fillMaterial.dispose();
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
    opacity: 0.44,
    depthWrite: false,
    fog: false
  });
  assets.trackMaterial(auraMat);
  const auraRing = new THREE.Mesh(assets.ringGround, auraMat);
  auraRing.scale.setScalar(20);
  auraRing.position.y = 0.6;
  root.add(auraRing);

  // Halo suave radial en el suelo (plano horizontal)
  const glowMat = new THREE.MeshBasicMaterial({
    map: assets.radialGlowTex,
    color: auraColor,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false
  });
  assets.trackMaterial(glowMat);
  const floorGlow = new THREE.Mesh(assets.glowQuadGeo, glowMat);
  floorGlow.scale.set(46, 1, 46);
  floorGlow.position.y = 0.7;
  root.add(floorGlow);

  // Manto base común del héroe
  const cloakMat = new THREE.MeshLambertMaterial({
    color: '#191316',
    emissive: auraColor,
    emissiveIntensity: 0.18
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

  const trimMat = new THREE.MeshPhongMaterial({
    color: auraColor,
    emissive: auraColor,
    emissiveIntensity: 0.6,
    shininess: 45
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
        wing.rotation.order = 'YXZ';
        wing.rotation.set(side === 1 ? -0.3 : 0.3, side === 1 ? Math.PI : 0, 0.4);
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
        body.rotation.y = Math.atan2(vx, -vy);
      } else {
        body.rotation.z *= 0.85;
        body.position.y = Math.sin(elapsed * 3.0) * 1.1;
      }

      if (body.userData.spinPart) {
        body.userData.spinPart.rotation.y += dt * 2.4;
      }

      if (aimAngle !== null) {
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

// MARK: - Pools Instanciados de Arena 3D (80 enemigos + 400 VFX en ~25 draw calls totales)

export const POOL_CAPS = {
  DESOLLADO: 96,
  JAULA: 48,
  RIBS: 240,
  MARTIR: 64,
  MARTIR_ARMS: 128,
  MEDKIT: 8,
  MEDKIT_CROSS: 16,
  PLAYER_PROJ: 160,
  ENEMY_PROJ: 144,
  PARTICLES: 320,
  GHOSTS: 64,
  RINGS: 160,
  GLOWS: 300,
  SPECIAL: 380
};

export class InstancedArenaPools {
  constructor(worldGroup, assets) {
    this.worldGroup = worldGroup;
    this.assets = assets;
    this.allMeshes = [];

    // Colores pre-computados para evitar new THREE.Color en bucle
    this.colWhite = new THREE.Color('#FFFFFF');
    this.colVoid = new THREE.Color('#140E10');
    this.colVermilion = new THREE.Color(RELICARIO_PALETTE.vermilion);
    this.colVisceral = new THREE.Color(RELICARIO_PALETTE.visceralCore);
    this.colGold = new THREE.Color(RELICARIO_PALETTE.liturgicalGold);
    this.colColdSilver = new THREE.Color(RELICARIO_PALETTE.coldSilver);
    this.colCyan = new THREE.Color('#38BDF8');
    this.colIvory = new THREE.Color(RELICARIO_PALETTE.ivory);
    this.colGraceJade = new THREE.Color(RELICARIO_PALETTE.graceJade);
    this.colOrange = new THREE.Color(RELICARIO_PALETTE.emberOrange);
    this.colPurple = new THREE.Color('#A855F7');
    this.colDarkPurple = new THREE.Color('#3B0764');
    this.colOldBone = new THREE.Color(RELICARIO_PALETTE.oldBone);

    // 1. Halos luminosos en suelo (InstancedMesh único)
    const glowOpArr = new Float32Array(POOL_CAPS.GLOWS);
    const glowBundle = createShareableInstancedGeo(assets.glowQuadGeo, 'aOpacity', glowOpArr);
    assets.trackGeometry(glowBundle.geo);
    this.glowOpacityAttr = glowBundle.attr;
    this.glowOpacityArr = glowOpArr;
    const glowMat = createInstancedOpacityBasicMaterial({
      map: assets.radialGlowTex,
      color: '#FFFFFF',
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    assets.trackMaterial(glowMat);
    this.glowsMesh = this.#makeInstanced(glowBundle.geo, glowMat, POOL_CAPS.GLOWS, true);

    // 2. Anillos en el suelo (ondas de choque, frenesí, retícula mártir, pulso botiquín)
    const ringOpArr = new Float32Array(POOL_CAPS.RINGS);
    const ringBundle = createShareableInstancedGeo(assets.ringGround, 'aOpacity', ringOpArr);
    assets.trackGeometry(ringBundle.geo);
    this.ringOpacityAttr = ringBundle.attr;
    this.ringOpacityArr = ringOpArr;
    const ringMat = createInstancedOpacityBasicMaterial({
      color: '#FFFFFF',
      transparent: true,
      opacity: 1,
      depthWrite: false,
      fog: false
    });
    assets.trackMaterial(ringMat);
    this.ringsMesh = this.#makeInstanced(ringBundle.geo, ringMat, POOL_CAPS.RINGS, true);

    // 3. Desollado (5 draw calls para todos los Desollados)
    const desoFlashArr = new Float32Array(POOL_CAPS.DESOLLADO);
    const desoEyeBundle = createShareableInstancedGeo(assets.sphereUnit, 'aFlash', desoFlashArr);
    assets.trackGeometry(desoEyeBundle.geo);
    this.desoFlashAttr = desoEyeBundle.attr;
    this.desoFlashArr = desoFlashArr;
    const desoEyeMat = createFlashableLambertMaterial({
      color: RELICARIO_PALETTE.ivory,
      emissive: '#3B342D',
      emissiveIntensity: 0.25
    });
    assets.trackMaterial(desoEyeMat);
    this.desoEyeMesh = this.#makeInstanced(desoEyeBundle.geo, desoEyeMat, POOL_CAPS.DESOLLADO, false);
    this.desoIrisMesh = this.#makeInstanced(assets.sphereUnit, assets.matVermilion, POOL_CAPS.DESOLLADO, false);
    this.desoPupilMesh = this.#makeInstanced(assets.octaUnit, assets.matVoid, POOL_CAPS.DESOLLADO, false);
    this.desoLeftWingMesh = this.#makeInstanced(assets.desolladoWingGeo, assets.matDarkFlesh, POOL_CAPS.DESOLLADO, false);
    this.desoRightWingMesh = this.#makeInstanced(assets.desolladoWingGeo, assets.matDarkFlesh, POOL_CAPS.DESOLLADO, false);

    // 4. Jaula de Vísceras + Costillas desprendidas (5 draw calls totales)
    const jaulaFlashArr = new Float32Array(POOL_CAPS.JAULA);
    const jaulaCoreBundle = createShareableInstancedGeo(assets.icosaUnit, 'aFlash', jaulaFlashArr);
    assets.trackGeometry(jaulaCoreBundle.geo);
    this.jaulaFlashAttr = jaulaCoreBundle.attr;
    this.jaulaFlashArr = jaulaFlashArr;
    const jaulaCoreMat = createFlashableLambertMaterial({
      color: RELICARIO_PALETTE.visceralCore,
      emissive: '#8A0219',
      emissiveIntensity: 0.62
    });
    assets.trackMaterial(jaulaCoreMat);
    this.jaulaCoreMesh = this.#makeInstanced(jaulaCoreBundle.geo, jaulaCoreMat, POOL_CAPS.JAULA, false);
    this.jaulaScleraMesh = this.#makeInstanced(assets.sphereUnit, assets.matIvory, POOL_CAPS.JAULA, false);
    this.jaulaIrisMesh = this.#makeInstanced(assets.sphereUnit, assets.matGold, POOL_CAPS.JAULA, false);
    this.jaulaSlitMesh = this.#makeInstanced(assets.boxUnit, assets.matVoid, POOL_CAPS.JAULA, false);
    this.jaulaRibsMesh = this.#makeInstanced(assets.jaulaRibGeo, assets.matOldBone, POOL_CAPS.RIBS, false);

    // 5. Mártir Descoyuntado (7 draw calls totales)
    const martirTorsoFlashArr = new Float32Array(POOL_CAPS.MARTIR);
    const martirTorsoBundle = createShareableInstancedGeo(assets.coneUnit, 'aFlash', martirTorsoFlashArr);
    assets.trackGeometry(martirTorsoBundle.geo);
    this.martirTorsoFlashAttr = martirTorsoBundle.attr;
    this.martirTorsoFlashArr = martirTorsoFlashArr;
    const martirTorsoMat = createFlashableLambertMaterial({ color: RELICARIO_PALETTE.voidBlack });
    assets.trackMaterial(martirTorsoMat);
    this.martirTorsoMesh = this.#makeInstanced(martirTorsoBundle.geo, martirTorsoMat, POOL_CAPS.MARTIR, false);

    const martirSpineFlashArr = new Float32Array(POOL_CAPS.MARTIR);
    const martirSpineBundle = createShareableInstancedGeo(assets.octaUnit, 'aFlash', martirSpineFlashArr);
    assets.trackGeometry(martirSpineBundle.geo);
    this.martirSpineFlashAttr = martirSpineBundle.attr;
    this.martirSpineFlashArr = martirSpineFlashArr;
    const martirSpineMat = createFlashableLambertMaterial({
      color: RELICARIO_PALETTE.vermilion,
      emissive: RELICARIO_PALETTE.vermilion,
      emissiveIntensity: 0.68
    });
    assets.trackMaterial(martirSpineMat);
    this.martirSpineMesh = this.#makeInstanced(martirSpineBundle.geo, martirSpineMat, POOL_CAPS.MARTIR, false);

    const martirEyeMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', fog: false });
    assets.trackMaterial(martirEyeMat);
    this.martirEyeMesh = this.#makeInstanced(assets.sphereUnit, martirEyeMat, POOL_CAPS.MARTIR, true);
    this.martirArmsMesh = this.#makeInstanced(assets.coneUnit, assets.matOldBone, POOL_CAPS.MARTIR_ARMS, false);
    this.martirHalo1Mesh = this.#makeInstanced(assets.martirHaloArc1, assets.matGold, POOL_CAPS.MARTIR, false);
    this.martirHalo2Mesh = this.#makeInstanced(assets.martirHaloArc2, assets.matGold, POOL_CAPS.MARTIR, false);

    const laserMat = new THREE.MeshBasicMaterial({
      color: RELICARIO_PALETTE.liturgicalGold,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    assets.trackMaterial(laserMat);
    this.martirLaserMesh = this.#makeInstanced(assets.boxUnit, laserMat, POOL_CAPS.MARTIR, false);

    // 6. Botiquines (2 draw calls totales)
    this.medkitCrystalMesh = this.#makeInstanced(assets.octaUnit, assets.matGraceJade, POOL_CAPS.MEDKIT, false);
    this.medkitCrossMesh = this.#makeInstanced(assets.boxUnit, assets.matIvory, POOL_CAPS.MEDKIT_CROSS, false);

    // 7. Proyectiles (2 draw calls totales)
    const pProjMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', fog: false });
    assets.trackMaterial(pProjMat);
    this.playerProjMesh = this.#makeInstanced(assets.playerShardGeo, pProjMat, POOL_CAPS.PLAYER_PROJ, true);

    const eProjMat = new THREE.MeshBasicMaterial({ color: RELICARIO_PALETTE.emberOrange, fog: false });
    assets.trackMaterial(eProjMat);
    this.enemyProjMesh = this.#makeInstanced(assets.boneBoltGeo, eProjMat, POOL_CAPS.ENEMY_PROJ, false);

    // 8. Partículas aditivas (1 draw call, se atenúan por color + escala sin alpha-sorting)
    const particleMat = new THREE.MeshBasicMaterial({
      color: '#FFFFFF',
      transparent: true,
      opacity: 0.94,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    assets.trackMaterial(particleMat);
    this.particlesMesh = this.#makeInstanced(assets.octaUnit, particleMat, POOL_CAPS.PARTICLES, true);

    // 9. Estelas fantasma del Mártir (1 draw call)
    const ghostOpArr = new Float32Array(POOL_CAPS.GHOSTS);
    const ghostBundle = createShareableInstancedGeo(assets.coneUnit, 'aOpacity', ghostOpArr);
    assets.trackGeometry(ghostBundle.geo);
    this.ghostOpacityAttr = ghostBundle.attr;
    this.ghostOpacityArr = ghostOpArr;
    const ghostMat = createInstancedOpacityBasicMaterial({
      color: RELICARIO_PALETTE.vermilion,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      fog: false
    });
    assets.trackMaterial(ghostMat);
    this.ghostsMesh = this.#makeInstanced(ghostBundle.geo, ghostMat, POOL_CAPS.GHOSTS, true);

    // 10. Bestiario Especial y Construcciones de Jefes (5 draw calls instanciados con color)
    const specMat = new THREE.MeshPhongMaterial({
      color: '#FFFFFF',
      emissive: '#221518',
      emissiveIntensity: 0.48,
      shininess: 52
    });
    assets.trackMaterial(specMat);
    this.specCoreMesh = this.#makeInstanced(assets.octaUnit, specMat, POOL_CAPS.SPECIAL, true);
    this.specBodyMesh = this.#makeInstanced(assets.boxUnit, specMat, POOL_CAPS.SPECIAL, true);
    this.specRingMesh = this.#makeInstanced(assets.torusUnit, specMat, POOL_CAPS.SPECIAL, true);
    this.specConeMesh = this.#makeInstanced(assets.coneUnit, specMat, POOL_CAPS.SPECIAL, true);
    this.specWingMesh = this.#makeInstanced(assets.desolladoWingGeo, specMat, POOL_CAPS.SPECIAL, true);

    this.resetFrameCounts();
  }

  #makeInstanced(geo, mat, capacity, useColor) {
    const mesh = new THREE.InstancedMesh(geo, mat, capacity);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (useColor) {
      for (let i = 0; i < capacity; i++) {
        mesh.setColorAt(i, this.colWhite);
      }
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    // Inicializar a count=1 oculto lejos para que renderer.compile() compile el shader instanciado al arrancar
    _dummy.position.set(0, -9999, 0);
    _dummy.scale.setScalar(0.001);
    _dummy.rotation.set(0, 0, 0);
    _dummy.updateMatrix();
    mesh.setMatrixAt(0, _dummy.matrix);
    mesh.count = 1;
    this.worldGroup.add(mesh);
    this.allMeshes.push(mesh);
    return mesh;
  }

  resetFrameCounts() {
    this.cGlow = 0;
    this.cRing = 0;
    this.cDeso = 0;
    this.cJaula = 0;
    this.cRib = 0;
    this.cMartir = 0;
    this.cMartirArm = 0;
    this.cMartirLaser = 0;
    this.cMedkit = 0;
    this.cMedkitCross = 0;
    this.cPlayerProj = 0;
    this.cEnemyProj = 0;
    this.cParticle = 0;
    this.cGhost = 0;
    this.cSpecCore = 0;
    this.cSpecBody = 0;
    this.cSpecRing = 0;
    this.cSpecCone = 0;
    this.cSpecWing = 0;
  }

  addGlow(x, yHeight, z, size, color, opacity) {
    const i = this.cGlow;
    if (i >= POOL_CAPS.GLOWS) return;
    this.cGlow = i + 1;
    _pos.set(x, yHeight, z);
    _quat.identity();
    _scale.set(size, 1, size);
    _mat4.compose(_pos, _quat, _scale);
    this.glowsMesh.setMatrixAt(i, _mat4);
    this.glowsMesh.setColorAt(i, color);
    this.glowOpacityArr[i] = opacity;
  }

  addRing(x, yHeight, z, scaleXZ, rotY, color, opacity) {
    const i = this.cRing;
    if (i >= POOL_CAPS.RINGS) return;
    this.cRing = i + 1;
    _pos.set(x, yHeight, z);
    _euler.set(0, rotY, 0);
    _quat.setFromEuler(_euler);
    _scale.set(scaleXZ, 1, scaleXZ);
    _mat4.compose(_pos, _quat, _scale);
    this.ringsMesh.setMatrixAt(i, _mat4);
    this.ringsMesh.setColorAt(i, color);
    this.ringOpacityArr[i] = opacity;
  }

  addDesollado(enemy) {
    const i = this.cDeso;
    if (i >= POOL_CAPS.DESOLLADO) return;
    this.cDeso = i + 1;

    const x = enemy.pos.x;
    const z = -enemy.pos.y;
    const sc = enemy.renderScale || 1.0;
    const hoverY = Math.sin(enemy.age * 9.0) * 2.0;
    const rotY = enemy.facingAngle + Math.PI * 0.5;
    const sinR = Math.sin(rotY);
    const cosR = Math.cos(rotY);
    const flash = enemy.flashTimer > 0 ? 1.0 : 0.0;
    this.desoFlashArr[i] = flash;

    // Halo en suelo
    if (enemy.isPouncing) {
      this.addGlow(x, 0.9, z, 46 * sc, this.colGold, 0.85);
    } else {
      this.addGlow(x, 0.9, z, 36 * sc, sc < 0.85 ? this.colGraceJade : this.colVermilion, 0.42);
    }

    // Cuerpo Ojo
    _euler.set(0, rotY, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _pos.set(x, 12 * sc + hoverY, z);
    _scale.set(8.2 * sc, 7.6 * sc, 8.2 * sc);
    _mat4.compose(_pos, _quat, _scale);
    this.desoEyeMesh.setMatrixAt(i, _mat4);

    // Iris (+6.8 en Z local)
    _pos.set(x + 6.8 * sc * sinR, 12 * sc + hoverY, z + 6.8 * sc * cosR);
    _scale.set(4.5 * sc, 4.5 * sc, 2.2 * sc);
    _mat4.compose(_pos, _quat, _scale);
    this.desoIrisMesh.setMatrixAt(i, _mat4);

    // Pupila (+8.2 en Z local)
    const twitch = Math.sin(enemy.age * 16.0) > 0.86 ? 1.45 : 1.0;
    _pos.set(x + 8.2 * sc * sinR, 12 * sc + hoverY, z + 8.2 * sc * cosR);
    _scale.set(1.5 * twitch * sc, 4.2 * sc, 1.5 * sc);
    _mat4.compose(_pos, _quat, _scale);
    this.desoPupilMesh.setMatrixAt(i, _mat4);

    // Ala izquierda (-7.5 X, -1 Z local)
    const flapL = Math.sin(enemy.age * 22.0) * 0.42 + 0.15;
    _pos.set(x + (-7.5 * sc) * cosR + (-1 * sc) * sinR, 13 * sc + hoverY, z - (-7.5 * sc) * sinR + (-1 * sc) * cosR);
    _euler.set(0, rotY, flapL, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(0.95 * sc, 0.95 * sc, 0.95 * sc);
    _mat4.compose(_pos, _quat, _scale);
    this.desoLeftWingMesh.setMatrixAt(i, _mat4);

    // Ala derecha (+7.5 X, -1 Z local, rotada Y + PI con escala positiva -> sin normales invertidas)
    const flapR = -Math.sin(enemy.age * 18.5 + 0.7) * 0.46 - 0.15;
    _pos.set(x + 7.5 * sc * cosR + (-1 * sc) * sinR, 13 * sc + hoverY, z - 7.5 * sc * sinR + (-1 * sc) * cosR);
    _euler.set(0, rotY + Math.PI, -flapR, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(0.95 * sc, 0.95 * sc, 0.95 * sc);
    _mat4.compose(_pos, _quat, _scale);
    this.desoRightWingMesh.setMatrixAt(i, _mat4);

    // Cresta ósea dorsal y aguijón caudal para silueta depredadora más rica
    if (this.cSpecCone + 2 <= POOL_CAPS.SPECIAL) {
      const c1 = this.cSpecCone++;
      _pos.set(x - 6.8 * sc * sinR, 14.5 * sc + hoverY, z - 6.8 * sc * cosR);
      _euler.set(-Math.PI * 0.42, rotY, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(2.2 * sc, 5.2 * sc, 2.2 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specConeMesh.setMatrixAt(c1, _mat4);
      this.specConeMesh.setColorAt(c1, enemy.isPouncing ? this.colGold : this.colOldBone);

      const c2 = this.cSpecCone++;
      _pos.set(x, 19.2 * sc + hoverY, z);
      _euler.set(-0.35, rotY, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(1.8 * sc, 3.8 * sc, 1.8 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specConeMesh.setMatrixAt(c2, _mat4);
      this.specConeMesh.setColorAt(c2, sc < 0.85 ? this.colGraceJade : this.colVermilion);
    }
  }

  addJaula(enemy) {
    const i = this.cJaula;
    if (i >= POOL_CAPS.JAULA) return;
    this.cJaula = i + 1;

    const x = enemy.pos.x;
    const z = -enemy.pos.y;
    const flash = enemy.flashTimer > 0 ? 1.0 : 0.0;
    this.jaulaFlashArr[i] = flash;

    // Halo
    let glowSize = 68;
    let glowOpacity = enemy.isFrenzied ? 0.78 : 0.52;
    if (enemy.spitPulse > 0) {
      glowSize = 68 * 1.45;
      glowOpacity = 0.9;
    }
    this.addGlow(x, 1.1, z, glowSize, enemy.isFrenzied ? this.colGold : this.colVisceral, glowOpacity);

    // Anillo de frenesí
    if (enemy.isFrenzied) {
      const phase = (enemy.age * 2.2) % 1.0;
      this.addRing(x, 1.4, z, 20 + phase * 22, 0, this.colGold, (1.0 - phase) * 0.75);
    }

    // Núcleo visceral palpitante
    const pulse = 13.5 * (1.0 + Math.sin(enemy.age * 7.5) * 0.09);
    _pos.set(x, 16, z);
    _quat.identity();
    _scale.set(pulse, pulse, pulse);
    _mat4.compose(_pos, _quat, _scale);
    this.jaulaCoreMesh.setMatrixAt(i, _mat4);

    // Ojo mirando al jugador
    const eyeRotY = enemy.facingAngle + Math.PI * 0.5;
    const sinE = Math.sin(eyeRotY);
    const cosE = Math.cos(eyeRotY);
    _euler.set(0, eyeRotY, 0, 'YXZ');
    _quat.setFromEuler(_euler);

    _pos.set(x + 8.5 * sinE, 20, z + 8.5 * cosE);
    _scale.set(7.5, 5.5, 6.0);
    _mat4.compose(_pos, _quat, _scale);
    this.jaulaScleraMesh.setMatrixAt(i, _mat4);

    _pos.set(x + 13.0 * sinE, 20, z + 13.0 * cosE);
    _scale.set(3.4, 3.4, 3.4);
    _mat4.compose(_pos, _quat, _scale);
    this.jaulaIrisMesh.setMatrixAt(i, _mat4);

    _pos.set(x + 15.6 * sinE, 20, z + 15.6 * cosE);
    _scale.set(1.6, 5.5, 1.5);
    _mat4.compose(_pos, _quat, _scale);
    this.jaulaSlitMesh.setMatrixAt(i, _mat4);

    // Corona de espinas óseas superiores sobre la Jaula
    if (this.cSpecCone + 2 <= POOL_CAPS.SPECIAL) {
      for (const side of [-1, 1]) {
        const ci = this.cSpecCone++;
        _pos.set(x + side * 9.5 * cosE, 27.5, z - side * 9.5 * sinE);
        _euler.set(0.25, eyeRotY, -side * 0.45, 'YXZ');
        _quat.setFromEuler(_euler);
        _scale.set(3.2, 6.5, 3.2);
        _mat4.compose(_pos, _quat, _scale);
        this.specConeMesh.setMatrixAt(ci, _mat4);
        this.specConeMesh.setColorAt(ci, enemy.isFrenzied ? this.colGold : this.colOldBone);
      }
    }

    // Costillas mandibulares giratorias (0 a 4)
    const ribBaseAngle = enemy.ribSpinAngle;
    const ribSlotOffsets = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
    for (let r = 0; r < enemy.attachedRibs; r++) {
      const ri = this.cRib;
      if (ri >= POOL_CAPS.RIBS) break;
      this.cRib = ri + 1;

      const localA = ribSlotOffsets[r];
      const lx = Math.cos(localA) * 6;
      const lz = Math.sin(localA) * 6;
      const cosB = Math.cos(ribBaseAngle);
      const sinB = Math.sin(ribBaseAngle);
      _pos.set(x + lx * cosB + lz * sinB, 14, z - lx * sinB + lz * cosB);
      _euler.set(Math.PI * 0.35, -localA + ribBaseAngle, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(1, 1, 1);
      _mat4.compose(_pos, _quat, _scale);
      this.jaulaRibsMesh.setMatrixAt(ri, _mat4);
    }
  }

  addDetachedRib(rib) {
    const ri = this.cRib;
    if (ri >= POOL_CAPS.RIBS) return;
    this.cRib = ri + 1;

    _pos.set(rib.x, rib.y, rib.z);
    _euler.set(rib.rotX, rib.rotY, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.setScalar(rib.scale);
    _mat4.compose(_pos, _quat, _scale);
    this.jaulaRibsMesh.setMatrixAt(ri, _mat4);
  }

  addMartir(enemy) {
    const i = this.cMartir;
    if (i >= POOL_CAPS.MARTIR) return;
    this.cMartir = i + 1;

    const x = enemy.pos.x;
    const z = -enemy.pos.y;
    const rotY = enemy.facingAngle + Math.PI * 0.5;
    const sinR = Math.sin(rotY);
    const cosR = Math.cos(rotY);
    const flash = enemy.flashTimer > 0 ? 1.0 : 0.0;
    this.martirTorsoFlashArr[i] = flash;
    this.martirSpineFlashArr[i] = flash;

    // Halo en el suelo
    this.addGlow(x, 1.0, z, 46, this.colVermilion, 0.36);

    // Torso retorcido
    _pos.set(x, 14, z);
    _euler.set(0.24, rotY, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(11, 14, 11);
    _mat4.compose(_pos, _quat, _scale);
    this.martirTorsoMesh.setMatrixAt(i, _mat4);

    // Espina frontal
    _euler.set(0, rotY, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _pos.set(x, 14, z);
    _scale.set(7.2, 12.5, 4.5);
    _mat4.compose(_pos, _quat, _scale);
    this.martirSpineMesh.setMatrixAt(i, _mat4);

    // Ojo en el pecho (+8.0 Z local)
    _pos.set(x + 8.0 * sinR, 14.5, z + 8.0 * cosR);
    if (enemy.telegraphActive) {
      _scale.set(4.0, 5.2, 4.0);
      this.martirEyeMesh.setColorAt(i, this.colGold);
    } else {
      _scale.set(2.5, 4.2, 2.5);
      this.martirEyeMesh.setColorAt(i, this.colVermilion);
    }
    _mat4.compose(_pos, _quat, _scale);
    this.martirEyeMesh.setMatrixAt(i, _mat4);

    // Brazos guadaña asimétricos
    const twitchL = Math.sin(enemy.age * 11.0) > 0.85 ? 0.95 : 0.45;
    const twitchR = Math.cos(enemy.age * 14.0) > 0.85 ? -1.05 : -0.58;
    const lx = -9.5, lz = 6.5;
    if (this.cMartirArm + 2 <= POOL_CAPS.MARTIR_ARMS) {
      const a1 = this.cMartirArm++;
      _pos.set(x + lx * cosR + lz * sinR, 13, z - lx * sinR + lz * cosR);
      _euler.set(Math.PI * 0.42, rotY, twitchL, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(2.2, 11.5, 2.2);
      _mat4.compose(_pos, _quat, _scale);
      this.martirArmsMesh.setMatrixAt(a1, _mat4);

      const rx = 9.5;
      const a2 = this.cMartirArm++;
      _pos.set(x + rx * cosR + lz * sinR, 13, z - rx * sinR + lz * cosR);
      _euler.set(Math.PI * 0.42, rotY, twitchR, 'YXZ');
      _quat.setFromEuler(_euler);
      _mat4.compose(_pos, _quat, _scale);
      this.martirArmsMesh.setMatrixAt(a2, _mat4);
    }

    // Halo fracturado flotante (-3 Z local)
    _pos.set(x + (-3) * sinR, 26, z + (-3) * cosR);
    _euler.set(0, rotY, enemy.haloSpin, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(1, 1, 1);
    _mat4.compose(_pos, _quat, _scale);
    this.martirHalo1Mesh.setMatrixAt(i, _mat4);

    _euler.set(0, rotY, enemy.haloSpin + Math.PI * 0.9, 'YXZ');
    _quat.setFromEuler(_euler);
    _mat4.compose(_pos, _quat, _scale);
    this.martirHalo2Mesh.setMatrixAt(i, _mat4);

    // Láser y retícula de telégrafo
    if (enemy.telegraphActive) {
      const reticleDist = Math.max(60, enemy.telegraphDist);
      const beamLen = Math.max(48, reticleDist - 12);
      const beamCenterZ = 10 + beamLen * 0.5;
      if (this.cMartirLaser < POOL_CAPS.MARTIR) {
        const li = this.cMartirLaser++;
        _pos.set(x + beamCenterZ * sinR, 11, z + beamCenterZ * cosR);
        _euler.set(0, rotY, 0, 'YXZ');
        _quat.setFromEuler(_euler);
        _scale.set(2.8, 1.8, beamLen);
        _mat4.compose(_pos, _quat, _scale);
        this.martirLaserMesh.setMatrixAt(li, _mat4);
      }
      this.addRing(
        x + reticleDist * sinR,
        2.2,
        z + reticleDist * cosR,
        11,
        enemy.age * 4.5,
        this.colGold,
        0.95
      );
    }
  }

  addMedkit(kit) {
    const i = this.cMedkit;
    if (i >= POOL_CAPS.MEDKIT) return;
    this.cMedkit = i + 1;

    const x = kit.pos.x;
    const z = -kit.pos.y;
    const bobY = 15 + Math.sin(kit.age * 4.5) * 2.5;
    const rotY = kit.age * 2.2;

    this.addGlow(x, 1.3, z, 50, this.colGraceJade, 0.62);
    const ringPhase = (kit.age * 1.4) % 1.0;
    this.addRing(x, 1.2, z, 13 + ringPhase * 11, 0, this.colGraceJade, (1.0 - ringPhase) * 0.72);

    _pos.set(x, bobY, z);
    _euler.set(0, rotY, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(9.5, 13.5, 9.5);
    _mat4.compose(_pos, _quat, _scale);
    this.medkitCrystalMesh.setMatrixAt(i, _mat4);

    if (this.cMedkitCross + 2 <= POOL_CAPS.MEDKIT_CROSS) {
      const c1 = this.cMedkitCross++;
      _scale.set(11, 2.8, 11);
      _mat4.compose(_pos, _quat, _scale);
      this.medkitCrossMesh.setMatrixAt(c1, _mat4);

      const c2 = this.cMedkitCross++;
      _scale.set(2.8, 11, 11);
      _mat4.compose(_pos, _quat, _scale);
      this.medkitCrossMesh.setMatrixAt(c2, _mat4);
    }
  }

  addPlayerProjectile(x, y, angle, scale, color) {
    const i = this.cPlayerProj;
    if (i >= POOL_CAPS.PLAYER_PROJ) return;
    this.cPlayerProj = i + 1;

    _pos.set(x, 14, -y);
    _euler.set(0, angle, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.setScalar(scale);
    _mat4.compose(_pos, _quat, _scale);
    this.playerProjMesh.setMatrixAt(i, _mat4);
    this.playerProjMesh.setColorAt(i, color);
  }

  addEnemyProjectile(bolt) {
    const x = bolt.x;
    const z = -bolt.y;
    const angle = bolt.angle || 0;
    const kind = bolt.kind || 'stone';
    const age = bolt.age || 0;
    const sc = bolt.scale || 1.0;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // --- PROYECTILES DE CRIATURAS (Piedras, Bolas de Fuego, Flechas, Dagas, Manguales, Virotes) ---
    if (kind === 'fireball') {
      // Bola de Fuego: núcleo esférico amarillo-ámbar + corona de llamas octogonal giratoria + halo naranja
      if (this.cProjSphere >= POOL_CAPS.ENEMY_PROJ || this.cSpecCore >= POOL_CAPS.SPECIAL) {
        return;
      }
      this.addGlow(x, 1.2, z, 28 * sc, this.colOrange, 0.72);
      const si = this.cProjSphere++;
      const pulse = 1.0 + Math.sin(age * 24) * 0.14;
      _pos.set(x, 14, z);
      _quat.identity();
      _scale.setScalar(5.0 * sc * pulse);
      _mat4.compose(_pos, _quat, _scale);
      this.projSphereMesh.setMatrixAt(si, _mat4);
      this.projSphereMesh.setColorAt(si, this.colAmber);

      const fi = this.cSpecCore++;
      _euler.set(age * 9, age * 11, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(6.5 * sc * pulse, 6.5 * sc * pulse, 6.5 * sc * pulse);
      _mat4.compose(_pos, _quat, _scale);
      this.specCoreMesh.setMatrixAt(fi, _mat4);
      this.specCoreMesh.setColorAt(fi, this.colOrange);
      return;
    }

    if (kind === 'stone') {
      // Piedra / Roca dentada girando en los 3 ejes
      if (this.cProjStone >= POOL_CAPS.ENEMY_PROJ) return;
      const si = this.cProjStone++;
      _pos.set(x, 14, z);
      _euler.set(age * 7.5, age * 5.5, age * 4.0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(5.4 * sc, 4.2 * sc, 4.9 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.projStoneMesh.setMatrixAt(si, _mat4);
      this.projStoneMesh.setColorAt(si, this.colStone);
      return;
    }

    if (kind === 'arrow') {
      // Flecha Espectral: asta alargada + punta afilada cónica + pluma trasera
      if (
        this.cSpecBody >= POOL_CAPS.SPECIAL ||
        this.cSpecCone + 2 > POOL_CAPS.SPECIAL
      ) {
        return;
      }
      const bi = this.cSpecBody++;
      _pos.set(x, 14, z);
      _euler.set(0, angle, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(13.5 * sc, 1.3 * sc, 1.3 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specBodyMesh.setMatrixAt(bi, _mat4);
      this.specBodyMesh.setColorAt(bi, this.colColdSilver);

      const tip = this.cSpecCone++;
      _pos.set(x + cosA * 7.5 * sc, 14, z - sinA * 7.5 * sc);
      _euler.set(0, angle, -Math.PI * 0.5, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(2.6 * sc, 3.8 * sc, 2.6 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specConeMesh.setMatrixAt(tip, _mat4);
      this.specConeMesh.setColorAt(tip, this.colCyan);

      const fletch = this.cSpecCone++;
      _pos.set(x - cosA * 6.5 * sc, 14, z + sinA * 6.5 * sc);
      _scale.set(2.2 * sc, 2.6 * sc, 2.2 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specConeMesh.setMatrixAt(fletch, _mat4);
      this.specConeMesh.setColorAt(fletch, this.colIvory);
      return;
    }

    if (kind === 'dagger') {
      // Daga Abisal giratoria tipo shuriken violeta
      if (this.cSpecCore >= POOL_CAPS.SPECIAL || this.cSpecWing >= POOL_CAPS.SPECIAL) return;
      this.addGlow(x, 1.0, z, 22 * sc, this.colPurple, 0.55);
      const ci = this.cSpecCore++;
      _pos.set(x, 14, z);
      _euler.set(0, age * 18, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(7.5 * sc, 1.6 * sc, 2.6 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specCoreMesh.setMatrixAt(ci, _mat4);
      this.specCoreMesh.setColorAt(ci, this.colPurple);

      const wi = this.cSpecWing++;
      _euler.set(Math.PI * 0.5, age * 18, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(0.55 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specWingMesh.setMatrixAt(wi, _mat4);
      this.specWingMesh.setColorAt(wi, this.colVermilion);
      return;
    }

    if (kind === 'flail_orb') {
      // Bola de hierro con púas del Flagelante
      if (this.cProjSphere >= POOL_CAPS.ENEMY_PROJ || this.cSpecCore >= POOL_CAPS.SPECIAL) return;
      const si = this.cProjSphere++;
      _pos.set(x, 14, z);
      _euler.set(age * 9, age * 6, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(5.6 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.projSphereMesh.setMatrixAt(si, _mat4);
      this.projSphereMesh.setColorAt(si, this.colIron);

      const sp = this.cSpecCore++;
      _scale.set(8.2 * sc, 3.2 * sc, 3.2 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specCoreMesh.setMatrixAt(sp, _mat4);
      this.specCoreMesh.setColorAt(sp, this.colVermilion);
      return;
    }

    if (kind === 'solar_bolt') {
      // Virote de Eclipse Dorado-Púrpura
      if (this.cSpecCore >= POOL_CAPS.SPECIAL || this.cSpecRing >= POOL_CAPS.SPECIAL) return;
      this.addGlow(x, 1.1, z, 24 * sc, this.colGold, 0.58);
      const ci = this.cSpecCore++;
      _pos.set(x, 14, z);
      _euler.set(0, angle, -Math.PI * 0.5, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(3.2 * sc, 8.8 * sc, 3.2 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specCoreMesh.setMatrixAt(ci, _mat4);
      this.specCoreMesh.setColorAt(ci, this.colAmber);

      const ri = this.cSpecRing++;
      _euler.set(age * 10, angle, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(6.5 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specRingMesh.setMatrixAt(ri, _mat4);
      this.specRingMesh.setColorAt(ri, this.colPurple);
      return;
    }

    // --- PROYECTILES FICTICIOS DE LOS 4 BOSSES (No existen en la vida real) ---

    if (kind === 'pyro_singularity') {
      // Boss 1 Ficticio: Singularidad de Magma Vivo (Poliedro incandescente con doble anillo volcánico ortogonal)
      if (this.cSpecCore >= POOL_CAPS.SPECIAL || this.cSpecRing + 2 > POOL_CAPS.SPECIAL) return;
      this.addGlow(x, 1.2, z, 38 * sc, this.colOrange, 0.80);
      const pulse = 1.0 + Math.sin(age * 20) * 0.16;
      const ci = this.cSpecCore++;
      _pos.set(x, 15, z);
      _euler.set(age * 6, age * 8, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(6.6 * sc * pulse);
      _mat4.compose(_pos, _quat, _scale);
      this.specCoreMesh.setMatrixAt(ci, _mat4);
      this.specCoreMesh.setColorAt(ci, this.colAmber);

      const r1 = this.cSpecRing++;
      _euler.set(age * 9, 0, age * 5, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(9.6 * sc * pulse);
      _mat4.compose(_pos, _quat, _scale);
      this.specRingMesh.setMatrixAt(r1, _mat4);
      this.specRingMesh.setColorAt(r1, this.colOrange);

      const r2 = this.cSpecRing++;
      _euler.set(-age * 7, age * 9, Math.PI * 0.5, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(8.0 * sc * pulse);
      _mat4.compose(_pos, _quat, _scale);
      this.specRingMesh.setMatrixAt(r2, _mat4);
      this.specRingMesh.setColorAt(r2, this.colVermilion);
      return;
    }

    if (kind === 'anvil_prism') {
      // Boss 1 Ficticio: Runa de Basalto Flotante (Monolito giratorio rodeado de corona rúnica)
      if (
        this.cSpecBody >= POOL_CAPS.SPECIAL ||
        this.cSpecRing >= POOL_CAPS.SPECIAL ||
        this.cSpecCore >= POOL_CAPS.SPECIAL
      ) {
        return;
      }
      this.addGlow(x, 1.1, z, 32 * sc, this.colOrange, 0.65);
      const bi = this.cSpecBody++;
      _pos.set(x, 15, z);
      _euler.set(age * 4, age * 6, 0.35, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(6.2 * sc, 9.6 * sc, 6.2 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specBodyMesh.setMatrixAt(bi, _mat4);
      this.specBodyMesh.setColorAt(bi, this.colVoid);

      const ci = this.cSpecCore++;
      _scale.set(7.6 * sc, 5.2 * sc, 7.6 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specCoreMesh.setMatrixAt(ci, _mat4);
      this.specCoreMesh.setColorAt(ci, this.colOrange);

      const ri = this.cSpecRing++;
      _euler.set(Math.PI * 0.5, 0, -age * 9, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(9.0 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specRingMesh.setMatrixAt(ri, _mat4);
      this.specRingMesh.setColorAt(ri, this.colGold);
      return;
    }

    if (kind === 'astral_helix') {
      // Boss 2 Ficticio: Hélice Hiperdimensional de Jade (Cristal alado serafínico que ondula)
      if (this.cSpecCore >= POOL_CAPS.SPECIAL || this.cSpecWing + 2 > POOL_CAPS.SPECIAL) return;
      this.addGlow(x, 1.2, z, 34 * sc, this.colGraceJade, 0.72);
      const ci = this.cSpecCore++;
      _pos.set(x, 16, z);
      _euler.set(0, age * 10, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(4.5 * sc, 9.2 * sc, 4.5 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specCoreMesh.setMatrixAt(ci, _mat4);
      this.specCoreMesh.setColorAt(ci, this.colGraceJade);

      const w1 = this.cSpecWing++;
      _euler.set(0.3, angle + age * 10, 0.25, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(0.82 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specWingMesh.setMatrixAt(w1, _mat4);
      this.specWingMesh.setColorAt(w1, this.colColdSilver);

      const w2 = this.cSpecWing++;
      _euler.set(0.3, angle + age * 10 + Math.PI, -0.25, 'YXZ');
      _quat.setFromEuler(_euler);
      _mat4.compose(_pos, _quat, _scale);
      this.specWingMesh.setMatrixAt(w2, _mat4);
      this.specWingMesh.setColorAt(w2, this.colCyan);
      return;
    }

    if (kind === 'seraph_eye') {
      // Boss 2 Ficticio: Ojo Profético Desprendido (Globo ocular astral con iris de jade y anillo solar)
      if (
        this.cProjSphere >= POOL_CAPS.ENEMY_PROJ ||
        this.cSpecCore >= POOL_CAPS.SPECIAL ||
        this.cSpecRing >= POOL_CAPS.SPECIAL
      ) {
        return;
      }
      this.addGlow(x, 1.2, z, 36 * sc, this.colColdSilver, 0.75);
      const si = this.cProjSphere++;
      _pos.set(x, 16, z);
      _quat.identity();
      _scale.setScalar(5.8 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.projSphereMesh.setMatrixAt(si, _mat4);
      this.projSphereMesh.setColorAt(si, this.colIvory);

      const iris = this.cSpecCore++;
      _pos.set(x + cosA * 3.8 * sc, 16, z - sinA * 3.8 * sc);
      _euler.set(0, angle, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(3.2 * sc, 4.4 * sc, 3.2 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specCoreMesh.setMatrixAt(iris, _mat4);
      this.specCoreMesh.setColorAt(iris, this.colGraceJade);

      const ri = this.cSpecRing++;
      _pos.set(x, 16, z);
      _euler.set(age * 7, angle, 0.4, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(9.5 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specRingMesh.setMatrixAt(ri, _mat4);
      this.specRingMesh.setColorAt(ri, this.colGold);
      return;
    }

    if (kind === 'void_hourglass') {
      // Boss 3 Ficticio: Reloj de Arena del Vacío (Paradoja bicónica púrpura con anillo carmesí)
      if (this.cSpecCone + 2 > POOL_CAPS.SPECIAL || this.cSpecRing >= POOL_CAPS.SPECIAL) return;
      this.addGlow(x, 1.2, z, 36 * sc, this.colPurple, 0.78);
      const spin = age * 11;
      const topC = this.cSpecCone++;
      _pos.set(x, 19, z);
      _euler.set(Math.PI, spin, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(4.5 * sc, 4.5 * sc, 4.5 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specConeMesh.setMatrixAt(topC, _mat4);
      this.specConeMesh.setColorAt(topC, this.colPurple);

      const botC = this.cSpecCone++;
      _pos.set(x, 11, z);
      _euler.set(0, -spin, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _mat4.compose(_pos, _quat, _scale);
      this.specConeMesh.setMatrixAt(botC, _mat4);
      this.specConeMesh.setColorAt(botC, this.colDarkPurple);

      const ri = this.cSpecRing++;
      _pos.set(x, 15, z);
      _euler.set(Math.PI * 0.35, spin, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(8.6 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specRingMesh.setMatrixAt(ri, _mat4);
      this.specRingMesh.setColorAt(ri, this.colVermilion);
      return;
    }

    if (kind === 'abyss_sigil') {
      // Boss 3 Ficticio: Sello Carmesí de Excomunión (Sigilo con alas y diamante que rebota)
      if (
        this.cSpecRing >= POOL_CAPS.SPECIAL ||
        this.cSpecCore >= POOL_CAPS.SPECIAL ||
        this.cSpecWing + 2 > POOL_CAPS.SPECIAL
      ) {
        return;
      }
      this.addGlow(x, 1.2, z, 38 * sc, this.colVermilion, 0.75);
      const ri = this.cSpecRing++;
      _pos.set(x, 15, z);
      _euler.set(Math.PI * 0.5, 0, age * 12, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(10.5 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specRingMesh.setMatrixAt(ri, _mat4);
      this.specRingMesh.setColorAt(ri, this.colVermilion);

      const ci = this.cSpecCore++;
      _euler.set(0, age * 14, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(6.2 * sc, 6.2 * sc, 6.2 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specCoreMesh.setMatrixAt(ci, _mat4);
      this.specCoreMesh.setColorAt(ci, this.colPurple);

      for (const side of [0, Math.PI]) {
        const wi = this.cSpecWing++;
        _euler.set(Math.PI * 0.5, age * 12 + side, 0, 'YXZ');
        _quat.setFromEuler(_euler);
        _scale.setScalar(0.75 * sc);
        _mat4.compose(_pos, _quat, _scale);
        this.specWingMesh.setMatrixAt(wi, _mat4);
        this.specWingMesh.setColorAt(wi, this.colGold);
      }
      return;
    }

    if (kind === 'chronos_crown') {
      // Boss 4 Ficticio: Corona Armilar de Chronos (Esfera imposible con 3 giroscopios en 3 ejes)
      if (this.cSpecCore >= POOL_CAPS.SPECIAL || this.cSpecRing + 3 > POOL_CAPS.SPECIAL) return;
      this.addGlow(x, 1.3, z, 44 * sc, this.colAmber, 0.84);
      const ci = this.cSpecCore++;
      _pos.set(x, 16, z);
      _euler.set(age * 6, age * 9, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(6.0 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specCoreMesh.setMatrixAt(ci, _mat4);
      this.specCoreMesh.setColorAt(ci, this.colAmber);

      const r1 = this.cSpecRing++;
      _euler.set(age * 8, age * 5, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(11.4 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specRingMesh.setMatrixAt(r1, _mat4);
      this.specRingMesh.setColorAt(r1, this.colGold);

      const r2 = this.cSpecRing++;
      _euler.set(0.6, -age * 9, Math.PI * 0.5, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(9.2 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specRingMesh.setMatrixAt(r2, _mat4);
      this.specRingMesh.setColorAt(r2, this.colVermilion);

      const r3 = this.cSpecRing++;
      _euler.set(Math.PI * 0.5, 0, age * 11, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(7.4 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specRingMesh.setMatrixAt(r3, _mat4);
      this.specRingMesh.setColorAt(r3, this.colColdSilver);
      return;
    }

    if (kind === 'eclipse_star') {
      // Boss 4 Ficticio: Estrella de Eclipse Oscuro (Sol negro con 4 alas doradas giratorias y halo carmesí)
      if (
        this.cProjSphere >= POOL_CAPS.ENEMY_PROJ ||
        this.cSpecRing >= POOL_CAPS.SPECIAL ||
        this.cSpecWing + 4 > POOL_CAPS.SPECIAL
      ) {
        return;
      }
      this.addGlow(x, 1.3, z, 42 * sc, this.colVermilion, 0.82);
      const si = this.cProjSphere++;
      _pos.set(x, 16, z);
      _quat.identity();
      _scale.setScalar(5.0 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.projSphereMesh.setMatrixAt(si, _mat4);
      this.projSphereMesh.setColorAt(si, this.colVoid);

      const ri = this.cSpecRing++;
      _euler.set(Math.PI * 0.5, 0, age * 10, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(9.8 * sc);
      _mat4.compose(_pos, _quat, _scale);
      this.specRingMesh.setMatrixAt(ri, _mat4);
      this.specRingMesh.setColorAt(ri, this.colVermilion);

      for (let w = 0; w < 4; w++) {
        const wi = this.cSpecWing++;
        const wa = age * 12 + (w / 4) * Math.PI * 2;
        _pos.set(x + Math.cos(wa) * 5.2 * sc, 16, z + Math.sin(wa) * 5.2 * sc);
        _euler.set(Math.PI * 0.5, wa, 0, 'YXZ');
        _quat.setFromEuler(_euler);
        _scale.setScalar(0.75 * sc);
        _mat4.compose(_pos, _quat, _scale);
        this.specWingMesh.setMatrixAt(wi, _mat4);
        this.specWingMesh.setColorAt(wi, w % 2 === 0 ? this.colGold : this.colPurple);
      }
      return;
    }

    // Fallback clásico
    const i = this.cEnemyProj;
    if (i >= POOL_CAPS.ENEMY_PROJ) return;
    this.cEnemyProj = i + 1;
    _pos.set(x, 14, z);
    _euler.set(0, angle, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.setScalar(5.0 * sc);
    _mat4.compose(_pos, _quat, _scale);
    this.enemyProjMesh.setMatrixAt(i, _mat4);
  }

  addParticle(x, yHeight, z, size, r, g, b) {
    const i = this.cParticle;
    if (i >= POOL_CAPS.PARTICLES) return;
    this.cParticle = i + 1;

    _pos.set(x, yHeight, z);
    _quat.identity();
    _scale.setScalar(size);
    _mat4.compose(_pos, _quat, _scale);
    this.particlesMesh.setMatrixAt(i, _mat4);
    _color.setRGB(r, g, b);
    this.particlesMesh.setColorAt(i, _color);
  }

  addGhost(x, z, facingAngle, scaleScalar, opacity) {
    const i = this.cGhost;
    if (i >= POOL_CAPS.GHOSTS) return;
    this.cGhost = i + 1;

    _pos.set(x, 13, z);
    _euler.set(0, facingAngle + Math.PI * 0.5, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(10 * scaleScalar, 14 * scaleScalar, 10 * scaleScalar);
    _mat4.compose(_pos, _quat, _scale);
    this.ghostsMesh.setMatrixAt(i, _mat4);
    this.ghostOpacityArr[i] = opacity;
  }

  // Criatura 4 (Rediseñada 3D): Incensario Volátil (Botafumeiro / Pebetero de Cadenas con Púas Ígneas)
  addIncensario(enemy) {
    if (
      this.cSpecCore >= POOL_CAPS.SPECIAL ||
      this.cSpecRing + 2 > POOL_CAPS.SPECIAL ||
      this.cSpecCone + 4 > POOL_CAPS.SPECIAL
    ) {
      return;
    }
    const x = enemy.pos.x;
    const z = -enemy.pos.y;
    const flash = enemy.flashTimer > 0;
    const pulse = enemy.isIgniting ? 1.28 + Math.sin(enemy.age * 28) * 0.25 : 1.0 + Math.sin(enemy.age * 10) * 0.1;
    const bobY = 15 + Math.sin(enemy.age * 8) * 2.5;

    this.addGlow(x, 1.0, z, enemy.isIgniting ? 76 : 46, this.colOrange, enemy.isIgniting ? 0.88 : 0.50);
    if (enemy.isIgniting) {
      this.addRing(x, 1.5, z, 46, enemy.age * 8, this.colOrange, 0.94);
    }

    // Núcleo incandescente de magma
    const ci = this.cSpecCore++;
    _pos.set(x, bobY, z);
    _euler.set(enemy.age * 3.5, enemy.age * 5.0, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(8.5 * pulse, 11.5 * pulse, 8.5 * pulse);
    _mat4.compose(_pos, _quat, _scale);
    this.specCoreMesh.setMatrixAt(ci, _mat4);
    this.specCoreMesh.setColorAt(ci, flash ? this.colWhite : this.colOrange);

    // Cúpula superior y aguijón inferior del incensario
    const topCone = this.cSpecCone++;
    _pos.set(x, bobY + 10.5 * pulse, z);
    _euler.set(0, enemy.age * 4.0, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(5.2 * pulse, 5.5 * pulse, 5.2 * pulse);
    _mat4.compose(_pos, _quat, _scale);
    this.specConeMesh.setMatrixAt(topCone, _mat4);
    this.specConeMesh.setColorAt(topCone, flash ? this.colWhite : this.colGold);

    const botCone = this.cSpecCone++;
    _pos.set(x, bobY - 10.0 * pulse, z);
    _euler.set(Math.PI, -enemy.age * 4.0, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(4.5 * pulse, 5.2 * pulse, 4.5 * pulse);
    _mat4.compose(_pos, _quat, _scale);
    this.specConeMesh.setMatrixAt(botCone, _mat4);
    this.specConeMesh.setColorAt(botCone, flash ? this.colWhite : this.colOldBone);

    // 2 Púas laterales de brasa
    for (const side of [-1, 1]) {
      const sp = this.cSpecCone++;
      const a = enemy.age * 5.0 + (side === 1 ? 0 : Math.PI);
      _pos.set(x + Math.cos(a) * 10 * pulse, bobY, z + Math.sin(a) * 10 * pulse);
      _euler.set(0, -a, -Math.PI * 0.5, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(2.6 * pulse, 4.8 * pulse, 2.6 * pulse);
      _mat4.compose(_pos, _quat, _scale);
      this.specConeMesh.setMatrixAt(sp, _mat4);
      this.specConeMesh.setColorAt(sp, flash ? this.colWhite : this.colVermilion);
    }

    // Doble anillo giroscópico de cadenas doradas
    const r1 = this.cSpecRing++;
    _pos.set(x, bobY, z);
    _euler.set(Math.PI * 0.35, enemy.age * 6.0, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.setScalar(13.5 * pulse);
    _mat4.compose(_pos, _quat, _scale);
    this.specRingMesh.setMatrixAt(r1, _mat4);
    this.specRingMesh.setColorAt(r1, flash ? this.colWhite : this.colGold);

    const r2 = this.cSpecRing++;
    _euler.set(-Math.PI * 0.35, -enemy.age * 4.5, Math.PI * 0.25, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.setScalar(11.0 * pulse);
    _mat4.compose(_pos, _quat, _scale);
    this.specRingMesh.setMatrixAt(r2, _mat4);
    this.specRingMesh.setColorAt(r2, flash ? this.colWhite : this.colOrange);
  }

  // Criatura 5 (Rediseñada 3D): Tejedor Astral (Arcángel Francotirador de Cristal con Alas y Astrolabio)
  addTejedor(enemy) {
    if (
      this.cSpecCore + 2 > POOL_CAPS.SPECIAL ||
      this.cSpecRing + 2 > POOL_CAPS.SPECIAL ||
      this.cSpecWing + 2 > POOL_CAPS.SPECIAL
    ) {
      return;
    }
    const x = enemy.pos.x;
    const z = -enemy.pos.y;
    const rotY = enemy.facingAngle + Math.PI * 0.5;
    const sinR = Math.sin(rotY);
    const cosR = Math.cos(rotY);
    const flash = enemy.flashTimer > 0;
    const bob = Math.sin(enemy.age * 5.5) * 2.5;

    this.addGlow(x, 1.0, z, 48, this.colColdSilver, 0.48);

    // Prisma central de cristal
    const ci = this.cSpecCore++;
    _pos.set(x, 18 + bob, z);
    _euler.set(0, enemy.age * 3.0, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(8.0, 16.5, 8.0);
    _mat4.compose(_pos, _quat, _scale);
    this.specCoreMesh.setMatrixAt(ci, _mat4);
    this.specCoreMesh.setColorAt(ci, flash ? this.colWhite : this.colColdSilver);

    // Corona astral flotante sobre el prisma
    const crownIdx = this.cSpecCore++;
    _pos.set(x, 31 + bob, z);
    _euler.set(0, -enemy.age * 4.2, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(4.5, 6.5, 4.5);
    _mat4.compose(_pos, _quat, _scale);
    this.specCoreMesh.setMatrixAt(crownIdx, _mat4);
    this.specCoreMesh.setColorAt(crownIdx, flash ? this.colWhite : this.colGold);

    // Par de alas serafínicas de cristal
    const flap = Math.sin(enemy.age * 9.0) * 0.32;
    const wL = this.cSpecWing++;
    _pos.set(x - 9.0 * cosR, 20 + bob, z + 9.0 * sinR);
    _euler.set(0, rotY + flap, 0.25, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.setScalar(1.05);
    _mat4.compose(_pos, _quat, _scale);
    this.specWingMesh.setMatrixAt(wL, _mat4);
    this.specWingMesh.setColorAt(wL, flash ? this.colWhite : this.colCyan);

    const wR = this.cSpecWing++;
    _pos.set(x + 9.0 * cosR, 20 + bob, z - 9.0 * sinR);
    _euler.set(0, rotY + Math.PI - flap, -0.25, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.setScalar(1.05);
    _mat4.compose(_pos, _quat, _scale);
    this.specWingMesh.setMatrixAt(wR, _mat4);
    this.specWingMesh.setColorAt(wR, flash ? this.colWhite : this.colCyan);

    // Anillos de astrolabio cruzados
    const r1 = this.cSpecRing++;
    _pos.set(x, 18 + bob, z);
    _euler.set(Math.PI * 0.5, enemy.age * 2.5, 0.4, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.setScalar(14.5);
    _mat4.compose(_pos, _quat, _scale);
    this.specRingMesh.setMatrixAt(r1, _mat4);
    this.specRingMesh.setColorAt(r1, flash ? this.colWhite : this.colGraceJade);

    const r2 = this.cSpecRing++;
    _euler.set(0.4, -enemy.age * 3.2, Math.PI * 0.3, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.setScalar(11.5);
    _mat4.compose(_pos, _quat, _scale);
    this.specRingMesh.setMatrixAt(r2, _mat4);
    this.specRingMesh.setColorAt(r2, flash ? this.colWhite : this.colIvory);
  }

  // Criatura 6 (Rediseñada 3D): Coloso Menor / Gólem Bifronte (2 Núcleos de Jade + Cuernos + Puños Acorazados)
  addColosoMenor(enemy) {
    if (
      this.cSpecBody + 5 > POOL_CAPS.SPECIAL ||
      this.cSpecCore + 2 > POOL_CAPS.SPECIAL ||
      this.cSpecCone + 2 > POOL_CAPS.SPECIAL
    ) {
      return;
    }
    const x = enemy.pos.x;
    const z = -enemy.pos.y;
    const rotY = enemy.facingAngle + Math.PI * 0.5;
    const sinR = Math.sin(rotY);
    const cosR = Math.cos(rotY);
    const flash = enemy.flashTimer > 0;
    const stride = Math.sin(enemy.age * 7.5);

    this.addGlow(x, 1.0, z, 56, this.colGraceJade, 0.46);

    // Torso monolítico de hueso tallado
    const bi = this.cSpecBody++;
    _pos.set(x, 15 + Math.abs(stride) * 1.6, z);
    _euler.set(0.12, rotY, stride * 0.08, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(16, 20, 12);
    _mat4.compose(_pos, _quat, _scale);
    this.specBodyMesh.setMatrixAt(bi, _mat4);
    this.specBodyMesh.setColorAt(bi, flash ? this.colWhite : this.colOldBone);

    // Hombreras dobles + Puños oscilantes + 2 Cuernos de Gólem
    for (const side of [-1, 1]) {
      const si = this.cSpecBody++;
      _pos.set(x + side * 11 * cosR, 21, z - side * 11 * sinR);
      _euler.set(0, rotY, -side * 0.2, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(7.5, 9.5, 9.5);
      _mat4.compose(_pos, _quat, _scale);
      this.specBodyMesh.setMatrixAt(si, _mat4);
      this.specBodyMesh.setColorAt(si, flash ? this.colWhite : this.colIvory);

      // Puño pesado adelantado con balanceo de marcha
      const swingZ = side * stride * 5.5 + 5.0;
      const fi = this.cSpecBody++;
      _pos.set(
        x + side * 13.5 * cosR + swingZ * sinR,
        11,
        z - side * 13.5 * sinR + swingZ * cosR
      );
      _scale.set(6.0, 9.0, 7.5);
      _mat4.compose(_pos, _quat, _scale);
      this.specBodyMesh.setMatrixAt(fi, _mat4);
      this.specBodyMesh.setColorAt(fi, flash ? this.colWhite : this.colOldBone);

      // Cuerno sobre cada hombrera
      const hi = this.cSpecCone++;
      _pos.set(x + side * 11.5 * cosR, 28.5, z - side * 11.5 * sinR);
      _euler.set(0.2, rotY, -side * 0.45, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(2.8, 6.2, 2.8);
      _mat4.compose(_pos, _quat, _scale);
      this.specConeMesh.setMatrixAt(hi, _mat4);
      this.specConeMesh.setColorAt(hi, flash ? this.colWhite : this.colGold);

      // Doble núcleo de jade gemelo (indica visualmente que se divide en 2 al morir)
      const ci = this.cSpecCore++;
      _pos.set(x + side * 4.8 * cosR + 5.5 * sinR, 18, z - side * 4.8 * sinR + 5.5 * cosR);
      _euler.set(0, rotY + enemy.age * 3.0, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(4.5, 7.2, 4.5);
      _mat4.compose(_pos, _quat, _scale);
      this.specCoreMesh.setMatrixAt(ci, _mat4);
      this.specCoreMesh.setColorAt(ci, flash ? this.colWhite : this.colGraceJade);
    }
  }

  // Criatura 7 (Rediseñada 3D): Sombra Abisal (Segador del Vacío con Capucha, Alas Cuchilla y Halo Carmesí)
  addSombra(enemy) {
    if (
      this.cSpecCone + 2 > POOL_CAPS.SPECIAL ||
      this.cSpecCore >= POOL_CAPS.SPECIAL ||
      this.cSpecRing >= POOL_CAPS.SPECIAL ||
      this.cSpecWing + 2 > POOL_CAPS.SPECIAL
    ) {
      return;
    }
    const x = enemy.pos.x;
    const z = -enemy.pos.y;
    const rotY = enemy.facingAngle + Math.PI * 0.5;
    const sinR = Math.sin(rotY);
    const cosR = Math.cos(rotY);
    const flash = enemy.flashTimer > 0;
    const hover = Math.sin(enemy.age * 7.0) * 2.2;

    this.addGlow(x, 1.0, z, 48, this.colPurple, 0.54);

    // Manto cónico desgarrado de sombra
    const cloakIdx = this.cSpecCone++;
    _pos.set(x, 13 + hover, z);
    _euler.set(0.22, rotY, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(9.5, 11.5, 9.5);
    _mat4.compose(_pos, _quat, _scale);
    this.specConeMesh.setMatrixAt(cloakIdx, _mat4);
    this.specConeMesh.setColorAt(cloakIdx, flash ? this.colWhite : this.colDarkPurple);

    // Capucha puntiaguda de verdugo abisal
    const hoodIdx = this.cSpecCone++;
    _pos.set(x, 26.5 + hover, z);
    _euler.set(-0.18, rotY, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(5.5, 7.0, 5.5);
    _mat4.compose(_pos, _quat, _scale);
    this.specConeMesh.setMatrixAt(hoodIdx, _mat4);
    this.specConeMesh.setColorAt(hoodIdx, flash ? this.colWhite : this.colPurple);

    // Máscara espectral flotante
    const ci = this.cSpecCore++;
    _pos.set(x + 4.5 * sinR, 22 + hover, z + 4.5 * cosR);
    _euler.set(0, rotY, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(4.8, 6.8, 4.8);
    _mat4.compose(_pos, _quat, _scale);
    this.specCoreMesh.setMatrixAt(ci, _mat4);
    this.specCoreMesh.setColorAt(ci, flash ? this.colWhite : this.colVermilion);

    // 2 Cuchillas-ala de sombra a los costados
    for (const side of [-1, 1]) {
      const wi = this.cSpecWing++;
      _pos.set(x + side * 8.5 * cosR, 18 + hover, z - side * 8.5 * sinR);
      _euler.set(0.35, rotY + (side === 1 ? Math.PI : 0), side * 0.35, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(1.0);
      _mat4.compose(_pos, _quat, _scale);
      this.specWingMesh.setMatrixAt(wi, _mat4);
      this.specWingMesh.setColorAt(wi, flash ? this.colWhite : this.colPurple);
    }

    // Halo abisal carmesí tras la capucha
    const ri = this.cSpecRing++;
    _pos.set(x - 2.5 * sinR, 24 + hover, z - 2.5 * cosR);
    _euler.set(0, rotY, enemy.age * 4.5, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.setScalar(10.5);
    _mat4.compose(_pos, _quat, _scale);
    this.specRingMesh.setMatrixAt(ri, _mat4);
    this.specRingMesh.setColorAt(ri, flash ? this.colWhite : this.colVermilion);
  }

  // NUEVA CRIATURA 8: Querubín de Rueda / Ophan Bíblico (3 Anillos de Fuego Entrelazados + Ojo Central + 4 Púas Radiales)
  addOphan(enemy) {
    if (
      this.cSpecRing + 3 > POOL_CAPS.SPECIAL ||
      this.cSpecCore >= POOL_CAPS.SPECIAL ||
      this.cSpecCone + 4 > POOL_CAPS.SPECIAL
    ) {
      return;
    }
    const x = enemy.pos.x;
    const z = -enemy.pos.y;
    const flash = enemy.flashTimer > 0;
    const charging = enemy.isSpitTelegraphing;
    const spinSpeed = charging ? 9.5 : 4.2;
    const yCenter = 17 + Math.sin(enemy.age * 6.5) * 2.0;

    this.addGlow(x, 1.0, z, charging ? 68 : 48, this.colGold, charging ? 0.85 : 0.48);
    if (charging) {
      this.addRing(x, 1.5, z, 32, enemy.age * 7.0, this.colGold, 0.9);
    }

    // Ojo ardiente en el centro de la rueda
    const ci = this.cSpecCore++;
    _pos.set(x, yCenter, z);
    _euler.set(0, enemy.age * 4.0, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(6.8, 6.8, 6.8);
    _mat4.compose(_pos, _quat, _scale);
    this.specCoreMesh.setMatrixAt(ci, _mat4);
    this.specCoreMesh.setColorAt(ci, flash ? this.colWhite : charging ? this.colVermilion : this.colOrange);

    // 3 Ruedas concéntricas entrelazadas (Ophanim)
    const r1 = this.cSpecRing++;
    _pos.set(x, yCenter, z);
    _euler.set(enemy.age * spinSpeed, enemy.facingAngle, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.setScalar(14.5);
    _mat4.compose(_pos, _quat, _scale);
    this.specRingMesh.setMatrixAt(r1, _mat4);
    this.specRingMesh.setColorAt(r1, flash ? this.colWhite : this.colGold);

    const r2 = this.cSpecRing++;
    _euler.set(0.5, -enemy.age * spinSpeed * 0.85, Math.PI * 0.5, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.setScalar(12.2);
    _mat4.compose(_pos, _quat, _scale);
    this.specRingMesh.setMatrixAt(r2, _mat4);
    this.specRingMesh.setColorAt(r2, flash ? this.colWhite : this.colOrange);

    const r3 = this.cSpecRing++;
    _euler.set(Math.PI * 0.5, 0, enemy.age * spinSpeed * 1.15, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.setScalar(10.0);
    _mat4.compose(_pos, _quat, _scale);
    this.specRingMesh.setMatrixAt(r3, _mat4);
    this.specRingMesh.setColorAt(r3, flash ? this.colWhite : this.colIvory);

    // 4 Púas solares en cruz alrededor de la rueda exterior
    for (let k = 0; k < 4; k++) {
      const si = this.cSpecCone++;
      const a = enemy.age * spinSpeed + k * (Math.PI * 0.5);
      _pos.set(x + Math.cos(a) * 15.5, yCenter, z + Math.sin(a) * 15.5);
      _euler.set(0, -a, -Math.PI * 0.5, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(2.4, 4.8, 2.4);
      _mat4.compose(_pos, _quat, _scale);
      this.specConeMesh.setMatrixAt(si, _mat4);
      this.specConeMesh.setColorAt(si, flash ? this.colWhite : this.colGold);
    }
  }

  // NUEVA CRIATURA 9: Flagelante de Hierro (Verdugo Acorazado con Escudo Pavés y Mangual Giratorio Carmesí)
  addFlagelante(enemy) {
    if (
      this.cSpecBody + 3 > POOL_CAPS.SPECIAL ||
      this.cSpecCone + 2 > POOL_CAPS.SPECIAL ||
      this.cSpecCore >= POOL_CAPS.SPECIAL ||
      this.cSpecRing >= POOL_CAPS.SPECIAL
    ) {
      return;
    }
    const x = enemy.pos.x;
    const z = -enemy.pos.y;
    const rotY = enemy.facingAngle + Math.PI * 0.5;
    const sinR = Math.sin(rotY);
    const cosR = Math.cos(rotY);
    const flash = enemy.flashTimer > 0;
    const walk = Math.sin(enemy.age * 8.5);

    this.addGlow(x, 1.0, z, 50, this.colVermilion, 0.45);

    // Torso acorazado de hierro oscuro
    const bi = this.cSpecBody++;
    _pos.set(x, 13 + Math.abs(walk) * 1.4, z);
    _euler.set(0.1, rotY, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(12.5, 17.5, 10.5);
    _mat4.compose(_pos, _quat, _scale);
    this.specBodyMesh.setMatrixAt(bi, _mat4);
    this.specBodyMesh.setColorAt(bi, flash ? this.colWhite : this.colVoid);

    // Capirote puntiagudo de hierro + espina dorsal
    const capIdx = this.cSpecCone++;
    _pos.set(x, 26.5 + Math.abs(walk) * 1.4, z);
    _euler.set(0, rotY, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(5.8, 9.2, 5.8);
    _mat4.compose(_pos, _quat, _scale);
    this.specConeMesh.setMatrixAt(capIdx, _mat4);
    this.specConeMesh.setColorAt(capIdx, flash ? this.colWhite : this.colVermilion);

    // Escudo Pavés Relicario en el brazo izquierdo (+8.5 Z frontal, -6.5 X)
    const shIdx = this.cSpecBody++;
    _pos.set(x - 6.0 * cosR + 8.5 * sinR, 14, z + 6.0 * sinR + 8.5 * cosR);
    _euler.set(-0.12, rotY, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(10.5, 16.5, 3.0);
    _mat4.compose(_pos, _quat, _scale);
    this.specBodyMesh.setMatrixAt(shIdx, _mat4);
    this.specBodyMesh.setColorAt(shIdx, flash ? this.colWhite : this.colOldBone);

    // Emblema dorado sobre el escudo frontal
    const embIdx = this.cSpecBody++;
    _pos.set(x - 6.0 * cosR + 10.3 * sinR, 14.5, z + 6.0 * sinR + 10.3 * cosR);
    _scale.set(4.2, 10.5, 1.8);
    _mat4.compose(_pos, _quat, _scale);
    this.specBodyMesh.setMatrixAt(embIdx, _mat4);
    this.specBodyMesh.setColorAt(embIdx, flash ? this.colWhite : this.colGold);

    // Mangual / Flagelo giratorio en el brazo derecho (+9 X)
    const flailSpin = enemy.age * 11.5;
    const fx = x + 10.5 * cosR + Math.cos(flailSpin) * 6.5;
    const fz = z - 10.5 * sinR + Math.sin(flailSpin) * 6.5;

    const ringIdx = this.cSpecRing++;
    _pos.set(x + 10.5 * cosR, 17, z - 10.5 * sinR);
    _euler.set(Math.PI * 0.35, flailSpin, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.setScalar(8.5);
    _mat4.compose(_pos, _quat, _scale);
    this.specRingMesh.setMatrixAt(ringIdx, _mat4);
    this.specRingMesh.setColorAt(ringIdx, flash ? this.colWhite : this.colGold);

    const headIdx = this.cSpecCore++;
    _pos.set(fx, 17 + Math.sin(flailSpin) * 3.5, fz);
    _euler.set(flailSpin, flailSpin, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(5.5, 5.5, 5.5);
    _mat4.compose(_pos, _quat, _scale);
    this.specCoreMesh.setMatrixAt(headIdx, _mat4);
    this.specCoreMesh.setColorAt(headIdx, flash ? this.colWhite : this.colVermilion);

    const spikeIdx = this.cSpecCone++;
    _pos.set(fx, 21 + Math.sin(flailSpin) * 3.5, fz);
    _scale.set(2.5, 4.5, 2.5);
    _mat4.compose(_pos, _quat, _scale);
    this.specConeMesh.setMatrixAt(spikeIdx, _mat4);
    this.specConeMesh.setColorAt(spikeIdx, flash ? this.colWhite : this.colGold);
  }

  // NUEVA CRIATURA 10: Heraldo del Eclipse (Sumo Sacerdote con Sol Negro, Mitra Bífida y 3 Orbes Satelitales)
  addEclipseHerald(enemy) {
    if (
      this.cSpecCone + 3 > POOL_CAPS.SPECIAL ||
      this.cSpecCore + 4 > POOL_CAPS.SPECIAL ||
      this.cSpecRing >= POOL_CAPS.SPECIAL ||
      this.cSpecWing + 2 > POOL_CAPS.SPECIAL
    ) {
      return;
    }
    const x = enemy.pos.x;
    const z = -enemy.pos.y;
    const rotY = enemy.facingAngle + Math.PI * 0.5;
    const sinR = Math.sin(rotY);
    const cosR = Math.cos(rotY);
    const flash = enemy.flashTimer > 0;
    const bob = Math.sin(enemy.age * 5.0) * 2.5;

    this.addGlow(x, 1.0, z, 54, this.colGold, 0.52);

    // Túnica ceremonial flotante
    const robeIdx = this.cSpecCone++;
    _pos.set(x, 14 + bob, z);
    _euler.set(0, rotY, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(10.5, 13.0, 10.5);
    _mat4.compose(_pos, _quat, _scale);
    this.specConeMesh.setMatrixAt(robeIdx, _mat4);
    this.specConeMesh.setColorAt(robeIdx, flash ? this.colWhite : this.colVoid);

    // Mitra bífida (2 cuernos/puntas litúrgicas de oro)
    for (const side of [-1, 1]) {
      const mi = this.cSpecCone++;
      _pos.set(x + side * 3.6 * cosR, 28.5 + bob, z - side * 3.6 * sinR);
      _euler.set(0, rotY, -side * 0.24, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(2.8, 6.2, 2.8);
      _mat4.compose(_pos, _quat, _scale);
      this.specConeMesh.setMatrixAt(mi, _mat4);
      this.specConeMesh.setColorAt(mi, flash ? this.colWhite : this.colGold);

      // Manto alado carmesí
      const wi = this.cSpecWing++;
      _pos.set(x + side * 10.0 * cosR, 19 + bob, z - side * 10.0 * sinR);
      _euler.set(0, rotY + (side === 1 ? Math.PI : 0), side * 0.25, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(1.1);
      _mat4.compose(_pos, _quat, _scale);
      this.specWingMesh.setMatrixAt(wi, _mat4);
      this.specWingMesh.setColorAt(wi, flash ? this.colWhite : this.colVermilion);
    }

    // Sol Negro Eclipsado flotando sobre su cabeza (núcleo oscuro + corona dorada)
    const sunCore = this.cSpecCore++;
    _pos.set(x, 36 + bob, z);
    _euler.set(0, enemy.age * 2.5, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(5.5, 5.5, 5.5);
    _mat4.compose(_pos, _quat, _scale);
    this.specCoreMesh.setMatrixAt(sunCore, _mat4);
    this.specCoreMesh.setColorAt(sunCore, flash ? this.colWhite : this.colPurple);

    const sunRing = this.cSpecRing++;
    _pos.set(x, 36 + bob, z);
    _euler.set(0, rotY, enemy.age * 3.2, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.setScalar(9.5);
    _mat4.compose(_pos, _quat, _scale);
    this.specRingMesh.setMatrixAt(sunRing, _mat4);
    this.specRingMesh.setColorAt(sunRing, flash ? this.colWhite : this.colGold);

    // 3 Orbes solares orbitando alrededor del Heraldo
    for (let o = 0; o < 3; o++) {
      const oi = this.cSpecCore++;
      const a = enemy.age * 3.8 + (o / 3) * Math.PI * 2;
      _pos.set(x + Math.cos(a) * 16.5, 18 + bob + Math.sin(a * 2) * 2.5, z + Math.sin(a) * 16.5);
      _euler.set(a, a, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(3.2, 4.5, 3.2);
      _mat4.compose(_pos, _quat, _scale);
      this.specCoreMesh.setMatrixAt(oi, _mat4);
      this.specCoreMesh.setColorAt(oi, flash ? this.colWhite : o === 0 ? this.colGold : this.colVermilion);
    }
  }

  // Construcciones 3D de las Habilidades Especiales de cada Jefe (Espejismos, Obeliscos de Cadena, Tótems de Forja y Custodios)
  addBossConstruct(c) {
    const x = c.x;
    const z = -c.y;
    const age = c.age || 0;

    if (c.kind === 'seraph_mirage') {
      // Habilidad Especial Boss 2: Espejismo Astral del Serafín (Clon de Cristal Alado)
      if (
        this.cSpecCore + 2 > POOL_CAPS.SPECIAL ||
        this.cSpecWing + 2 > POOL_CAPS.SPECIAL ||
        this.cSpecRing >= POOL_CAPS.SPECIAL
      ) {
        return;
      }
      const bob = Math.sin(age * 8.0) * 3.0;
      const rotY = (c.facingAngle || 0) + Math.PI * 0.5;
      const sinR = Math.sin(rotY);
      const cosR = Math.cos(rotY);

      this.addGlow(x, 1.2, z, 68, this.colColdSilver, 0.72);
      this.addRing(x, 1.6, z, 28 + Math.sin(age * 9) * 4, age * 5, this.colGraceJade, 0.88);

      const core = this.cSpecCore++;
      _pos.set(x, 22 + bob, z);
      _euler.set(0, age * 4.0, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(10, 20, 10);
      _mat4.compose(_pos, _quat, _scale);
      this.specCoreMesh.setMatrixAt(core, _mat4);
      this.specCoreMesh.setColorAt(core, this.colColdSilver);

      const crown = this.cSpecCore++;
      _pos.set(x, 38 + bob, z);
      _scale.set(6, 10, 6);
      _mat4.compose(_pos, _quat, _scale);
      this.specCoreMesh.setMatrixAt(crown, _mat4);
      this.specCoreMesh.setColorAt(crown, this.colGold);

      for (const side of [-1, 1]) {
        const wi = this.cSpecWing++;
        _pos.set(x + side * 12 * cosR, 26 + bob, z - side * 12 * sinR);
        _euler.set(0, rotY + (side === 1 ? Math.PI : 0), side * 0.35, 'YXZ');
        _quat.setFromEuler(_euler);
        _scale.setScalar(1.55);
        _mat4.compose(_pos, _quat, _scale);
        this.specWingMesh.setMatrixAt(wi, _mat4);
        this.specWingMesh.setColorAt(wi, this.colGraceJade);
      }

      const ri = this.cSpecRing++;
      _pos.set(x, 24 + bob, z);
      _euler.set(Math.PI * 0.35, age * 5.0, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(19);
      _mat4.compose(_pos, _quat, _scale);
      this.specRingMesh.setMatrixAt(ri, _mat4);
      this.specRingMesh.setColorAt(ri, this.colGold);
    } else if (c.kind === 'abyss_obelisk') {
      // Habilidad Especial Boss 3: Obelisco de Excomunión Abisal (Estaca de Cadenas Violetas)
      if (
        this.cSpecBody >= POOL_CAPS.SPECIAL ||
        this.cSpecCore >= POOL_CAPS.SPECIAL ||
        this.cSpecRing >= POOL_CAPS.SPECIAL
      ) {
        return;
      }
      this.addGlow(x, 1.2, z, 58, this.colPurple, 0.75);
      this.addRing(x, 1.6, z, 24, -age * 6, this.colVermilion, 0.85);

      const bi = this.cSpecBody++;
      _pos.set(x, 16, z);
      _euler.set(0, age * 2.0, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(7.5, 28, 7.5);
      _mat4.compose(_pos, _quat, _scale);
      this.specBodyMesh.setMatrixAt(bi, _mat4);
      this.specBodyMesh.setColorAt(bi, this.colDarkPurple);

      const ci = this.cSpecCore++;
      _pos.set(x, 35 + Math.sin(age * 8) * 2.5, z);
      _euler.set(0, -age * 5.0, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(7, 11, 7);
      _mat4.compose(_pos, _quat, _scale);
      this.specCoreMesh.setMatrixAt(ci, _mat4);
      this.specCoreMesh.setColorAt(ci, this.colPurple);

      const ri = this.cSpecRing++;
      _pos.set(x, 22, z);
      _euler.set(Math.PI * 0.5, 0, age * 5.0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(13.5);
      _mat4.compose(_pos, _quat, _scale);
      this.specRingMesh.setMatrixAt(ri, _mat4);
      this.specRingMesh.setColorAt(ri, this.colVermilion);
    } else if (c.kind === 'forge_totem') {
      // Habilidad Especial Boss 1: Yunque Volcánico del Crisol de Forja
      if (this.cSpecCone >= POOL_CAPS.SPECIAL || this.cSpecCore >= POOL_CAPS.SPECIAL) return;
      this.addGlow(x, 1.2, z, 52, this.colOrange, 0.72);

      const cone = this.cSpecCone++;
      _pos.set(x, 12, z);
      _euler.set(0, age * 2.0, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(9.0, 12.0, 9.0);
      _mat4.compose(_pos, _quat, _scale);
      this.specConeMesh.setMatrixAt(cone, _mat4);
      this.specConeMesh.setColorAt(cone, this.colOldBone);

      const ember = this.cSpecCore++;
      _pos.set(x, 26 + Math.sin(age * 9) * 2, z);
      _euler.set(age * 4, age * 5, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(6.5, 8.5, 6.5);
      _mat4.compose(_pos, _quat, _scale);
      this.specCoreMesh.setMatrixAt(ember, _mat4);
      this.specCoreMesh.setColorAt(ember, this.colOrange);
    } else if (c.kind === 'relic_sentinel') {
      // Habilidad Especial Boss 4: Custodio Dorado del Eclipse Final
      if (
        this.cSpecCore >= POOL_CAPS.SPECIAL ||
        this.cSpecRing + 2 > POOL_CAPS.SPECIAL ||
        this.cSpecCone >= POOL_CAPS.SPECIAL
      ) {
        return;
      }
      const bob = Math.sin(age * 7) * 2.5;
      this.addGlow(x, 1.2, z, 62, this.colGold, 0.78);

      const core = this.cSpecCore++;
      _pos.set(x, 22 + bob, z);
      _euler.set(0, age * 4.5, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(8.5, 14.5, 8.5);
      _mat4.compose(_pos, _quat, _scale);
      this.specCoreMesh.setMatrixAt(core, _mat4);
      this.specCoreMesh.setColorAt(core, this.colGold);

      const r1 = this.cSpecRing++;
      _pos.set(x, 22 + bob, z);
      _euler.set(age * 4, age * 3, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(15.5);
      _mat4.compose(_pos, _quat, _scale);
      this.specRingMesh.setMatrixAt(r1, _mat4);
      this.specRingMesh.setColorAt(r1, this.colVermilion);

      const r2 = this.cSpecRing++;
      _euler.set(Math.PI * 0.5, -age * 4, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(12.0);
      _mat4.compose(_pos, _quat, _scale);
      this.specRingMesh.setMatrixAt(r2, _mat4);
      this.specRingMesh.setColorAt(r2, this.colGold);

      const spire = this.cSpecCone++;
      _pos.set(x, 36 + bob, z);
      _euler.set(0, -age * 3, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(4.5, 8.0, 4.5);
      _mat4.compose(_pos, _quat, _scale);
      this.specConeMesh.setMatrixAt(spire, _mat4);
      this.specConeMesh.setColorAt(spire, this.colIvory);
    }
  }

  commit() {
    this.#commitMesh(this.glowsMesh, this.cGlow, true, this.glowOpacityAttr);
    this.#commitMesh(this.ringsMesh, this.cRing, true, this.ringOpacityAttr);
    this.#commitMesh(this.specCoreMesh, this.cSpecCore, true, null);
    this.#commitMesh(this.specBodyMesh, this.cSpecBody, true, null);
    this.#commitMesh(this.specRingMesh, this.cSpecRing, true, null);
    this.#commitMesh(this.specConeMesh, this.cSpecCone, true, null);
    this.#commitMesh(this.specWingMesh, this.cSpecWing, true, null);
    this.#commitMesh(this.projStoneMesh, this.cProjStone, true, null);
    this.#commitMesh(this.projSphereMesh, this.cProjSphere, true, null);

    this.#commitMesh(this.desoEyeMesh, this.cDeso, false, this.desoFlashAttr);
    this.#commitMesh(this.desoIrisMesh, this.cDeso, false, null);
    this.#commitMesh(this.desoPupilMesh, this.cDeso, false, null);
    this.#commitMesh(this.desoLeftWingMesh, this.cDeso, false, null);
    this.#commitMesh(this.desoRightWingMesh, this.cDeso, false, null);

    this.#commitMesh(this.jaulaCoreMesh, this.cJaula, false, this.jaulaFlashAttr);
    this.#commitMesh(this.jaulaScleraMesh, this.cJaula, false, null);
    this.#commitMesh(this.jaulaIrisMesh, this.cJaula, false, null);
    this.#commitMesh(this.jaulaSlitMesh, this.cJaula, false, null);
    this.#commitMesh(this.jaulaRibsMesh, this.cRib, false, null);

    this.#commitMesh(this.martirTorsoMesh, this.cMartir, false, this.martirTorsoFlashAttr);
    this.#commitMesh(this.martirSpineMesh, this.cMartir, false, this.martirSpineFlashAttr);
    this.#commitMesh(this.martirEyeMesh, this.cMartir, true, null);
    this.#commitMesh(this.martirArmsMesh, this.cMartirArm, false, null);
    this.#commitMesh(this.martirHalo1Mesh, this.cMartir, false, null);
    this.#commitMesh(this.martirHalo2Mesh, this.cMartir, false, null);
    this.#commitMesh(this.martirLaserMesh, this.cMartirLaser, false, null);

    this.#commitMesh(this.medkitCrystalMesh, this.cMedkit, false, null);
    this.#commitMesh(this.medkitCrossMesh, this.cMedkitCross, false, null);

    this.#commitMesh(this.playerProjMesh, this.cPlayerProj, true, null);
    this.#commitMesh(this.enemyProjMesh, this.cEnemyProj, false, null);
    this.#commitMesh(this.particlesMesh, this.cParticle, true, null);
    this.#commitMesh(this.ghostsMesh, this.cGhost, true, this.ghostOpacityAttr);
  }

  #commitMesh(mesh, count, hasColor, extraAttr) {
    mesh.count = count;
    if (count > 0) {
      mesh.instanceMatrix.needsUpdate = true;
      if (hasColor && mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
      if (extraAttr) {
        extraAttr.needsUpdate = true;
      }
    }
  }

  dispose() {
    for (let i = 0; i < this.allMeshes.length; i++) {
      this.allMeshes[i].dispose();
    }
    this.allMeshes.length = 0;
  }
}
