// Retratos SVG procedurales 1:1 con AvatarDesignCatalog de ProceduralAssets.swift
// Sistema de coordenadas origen: [-18..18] con +Y arriba (en SVG transformamos con scale(1, -1))

import { PLAYER_AVATAR_MAP, RELICARIO_PALETTE } from '../engine/constants.js';

function poly(pts, fill, stroke, width = 1.4) {
  const p = pts.map(([x, y]) => `${x},${-y}`).join(' ');
  const sw = width > 0 && stroke ? `stroke="${stroke}" stroke-width="${width}" stroke-linejoin="miter"` : 'stroke="none"';
  return `<polygon points="${p}" fill="${fill}" ${sw} />`;
}

function ellipse(cx, cy, rx, ry, fill, stroke = '', width = 0) {
  const sw = width > 0 && stroke ? `stroke="${stroke}" stroke-width="${width}"` : 'stroke="none"';
  return `<ellipse cx="${cx}" cy="${-cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${sw} />`;
}

function rect(x, y, w, h, fill, stroke = '', width = 0, rx = 0) {
  const svgY = -(y + h);
  const sw = width > 0 && stroke ? `stroke="${stroke}" stroke-width="${width}"` : 'stroke="none"';
  const rAttr = rx > 0 ? `rx="${rx}" ry="${rx}"` : '';
  return `<rect x="${x}" y="${svgY}" width="${w}" height="${h}" ${rAttr} fill="${fill}" ${sw} />`;
}

const AVATAR_SHAPES = {
  penitente: [
    poly([[-13, -13], [13, -13], [8, -2], [-8, -2]], '#1D1619', RELICARIO_PALETTE.coldSilver, 1.5),
    poly([[-10, -4], [0, 15], [10, -4], [6, -8], [-6, -8]], '#100C0E', RELICARIO_PALETTE.ivory, 1.6),
    ellipse(0, 0.3, 5.2, 5.1, RELICARIO_PALETTE.voidBlack, 'rgba(114,239,221,0.45)', 0.9),
    ellipse(0, 0.8, 1.7, 3.2, RELICARIO_PALETTE.liturgicalGold, RELICARIO_PALETTE.ivory, 0.7)
  ],
  inquisidor: [
    poly([[-12, -14], [12, -14], [9, -3], [-9, -3]], '#20151A', RELICARIO_PALETTE.graceJade, 1.5),
    poly([[-16, 2], [0, 6.5], [16, 2], [0, -2.5]], '#120D0F', RELICARIO_PALETTE.ivory, 1.5),
    poly([[-6.5, 2], [-4.5, 14.5], [4.5, 14.5], [6.5, 2]], '#1E1619', RELICARIO_PALETTE.graceJade, 1.4),
    rect(-2.6, 4.5, 5.2, 3.0, RELICARIO_PALETTE.ivory, RELICARIO_PALETTE.coldSilver, 0.8),
    ellipse(-3.3, -3.9, 1.5, 1.3, RELICARIO_PALETTE.graceJade),
    ellipse(3.3, -3.9, 1.5, 1.3, RELICARIO_PALETTE.graceJade)
  ],
  serafin: [
    poly([[-4, -3], [-16, 10], [-13, 2], [-16, -4], [-11, -5], [-14, -11], [-4, -8]], RELICARIO_PALETTE.ivory, RELICARIO_PALETTE.liturgicalGold, 1.3),
    poly([[4, -3], [16, 10], [13, 2], [16, -4], [11, -5], [14, -11], [4, -8]], RELICARIO_PALETTE.ivory, RELICARIO_PALETTE.liturgicalGold, 1.3),
    ellipse(0, 0, 6.5, 10.5, '#22181B', RELICARIO_PALETTE.liturgicalGold, 1.6),
    rect(-6.5, -3.2, 13, 3.6, RELICARIO_PALETTE.vermilion, RELICARIO_PALETTE.oldBone, 0.7),
    poly([[0, 8.2], [3.2, 4.2], [0, 0.5], [-3.2, 4.2]], RELICARIO_PALETTE.liturgicalGold, RELICARIO_PALETTE.ivory, 0.8)
  ],
  cuervo: [
    poly([[-14, -13], [14, -13], [10, -1], [-10, -1]], '#181215', RELICARIO_PALETTE.vermilion, 1.5),
    ellipse(0, 5.0, 8.5, 8.5, '#110C0E', RELICARIO_PALETTE.oldBone, 1.4),
    poly([[-5.2, 0.5], [5.2, 0.5], [3.5, -5.5], [0.8, -14.5], [-2.5, -7.0]], RELICARIO_PALETTE.oldBone, RELICARIO_PALETTE.ivory, 1.3),
    ellipse(-3.6, 4.4, 2.2, 2.2, RELICARIO_PALETTE.vermilion, RELICARIO_PALETTE.liturgicalGold, 1.0),
    ellipse(3.6, 4.4, 2.2, 2.2, RELICARIO_PALETTE.vermilion, RELICARIO_PALETTE.liturgicalGold, 1.0)
  ],
  verdugo: [
    poly([[-15.5, -10], [-11, -3], [11, -3], [15.5, -10], [11, -13.5], [-11, -13.5]], '#28242D', RELICARIO_PALETTE.emberOrange, 1.5),
    poly([[-9.5, -8.5], [-8.5, 13.5], [8.5, 13.5], [9.5, -8.5], [0, -12.5]], '#16151B', RELICARIO_PALETTE.coldSilver, 1.5),
    rect(-7.5, 2.5, 15, 4.2, '#3A3845', RELICARIO_PALETTE.coldSilver, 0.9),
    rect(-5.8, -1.6, 11.6, 2.6, RELICARIO_PALETTE.emberOrange, RELICARIO_PALETTE.liturgicalGold, 0.8)
  ],
  oraculo: [
    poly([[-12.5, -14], [12.5, -14], [7.5, 3], [-7.5, 3]], '#171B26', RELICARIO_PALETTE.coldSilver, 1.5),
    poly([[-5, 6], [-14, 14.5], [-9.5, 4.5]], RELICARIO_PALETTE.liturgicalGold, RELICARIO_PALETTE.ivory, 1.1),
    poly([[5, 6], [14, 14.5], [9.5, 4.5]], RELICARIO_PALETTE.liturgicalGold, RELICARIO_PALETTE.ivory, 1.1),
    ellipse(0, 1.25, 6.2, 7.75, RELICARIO_PALETTE.ivory, RELICARIO_PALETTE.liturgicalGold, 1.4),
    poly([[0, 7.2], [2.4, 4.4], [0, 1.8], [-2.4, 4.4]], RELICARIO_PALETTE.liturgicalGold),
    ellipse(-2.9, -0.5, 1.3, 1.3, RELICARIO_PALETTE.coldSilver),
    ellipse(2.9, -0.5, 1.3, 1.3, RELICARIO_PALETTE.coldSilver)
  ],
  golem: [
    poly([[-15.5, -12], [-12, -2], [12, -2], [15.5, -12], [8, -14], [-8, -14]], '#3D2F2A', RELICARIO_PALETTE.oldBone, 1.5),
    poly([[-9.5, -3], [-13.5, 13.5], [-4.5, 9], [4.5, 9], [13.5, 13.5], [9.5, -3], [5.5, -10.5], [-5.5, -10.5]], RELICARIO_PALETTE.oldBone, RELICARIO_PALETTE.vermilion, 1.5),
    ellipse(-3.6, 2.1, 1.8, 1.9, RELICARIO_PALETTE.vermilion, RELICARIO_PALETTE.voidBlack, 0.8),
    ellipse(3.6, 2.1, 1.8, 1.9, RELICARIO_PALETTE.vermilion, RELICARIO_PALETTE.voidBlack, 0.8),
    rect(-4.2, -6.8, 8.4, 2.2, RELICARIO_PALETTE.visceralCore, RELICARIO_PALETTE.voidBlack, 0.7)
  ],
  espectro: [
    poly([[0, 14.5], [11, 2], [13.5, -14], [5.5, -8.5], [0, -14.5], [-5.5, -8.5], [-13.5, -14], [-11, 2]], '#0E1924', RELICARIO_PALETTE.graceJade, 1.6),
    ellipse(0, 2.75, 5.8, 6.25, RELICARIO_PALETTE.voidBlack, 'rgba(114,239,221,0.5)', 0.9),
    ellipse(-2.9, 4.4, 1.3, 1.4, RELICARIO_PALETTE.graceJade),
    ellipse(2.9, 4.4, 1.3, 1.4, RELICARIO_PALETTE.graceJade),
    ellipse(0, 0, 1.4, 1.5, RELICARIO_PALETTE.graceJade)
  ],
  automata: (() => {
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = i * (Math.PI / 4);
      pts.push([+(Math.cos(a) * 14.5).toFixed(2), +(Math.sin(a) * 14.5).toFixed(2)]);
      const aNext = a + Math.PI / 8;
      pts.push([+(Math.cos(aNext) * 10.8).toFixed(2), +(Math.sin(aNext) * 10.8).toFixed(2)]);
    }
    return [
      poly(pts, '#2B2114', RELICARIO_PALETTE.liturgicalGold, 1.3),
      rect(-9, -9, 18, 18, '#3D2D19', RELICARIO_PALETTE.ivory, 1.4, 5),
      ellipse(0, 0, 4.8, 4.8, RELICARIO_PALETTE.coldSilver, RELICARIO_PALETTE.voidBlack, 1.1),
      ellipse(0, 0, 1.8, 1.8, RELICARIO_PALETTE.ivory)
    ];
  })(),
  templario: [
    poly([[-14, -12.5], [14, -12.5], [11.5, -2.5], [-11.5, -2.5]], '#2E2D34', RELICARIO_PALETTE.ivory, 1.4),
    rect(-3.2, -12.5, 6.4, 9.5, RELICARIO_PALETTE.visceralCore, RELICARIO_PALETTE.liturgicalGold, 0.9),
    poly([[-8.5, -5.5], [-7.5, 11.5], [0, 14.5], [7.5, 11.5], [8.5, -5.5], [0, -9.5]], RELICARIO_PALETTE.ivory, RELICARIO_PALETTE.coldSilver, 1.5),
    rect(-6.5, 1.5, 13, 2.6, RELICARIO_PALETTE.liturgicalGold, RELICARIO_PALETTE.voidBlack, 0.8),
    rect(-1.5, -6.5, 3.0, 17.5, RELICARIO_PALETTE.liturgicalGold, RELICARIO_PALETTE.voidBlack, 0.8),
    rect(-5.4, -1.4, 3.0, 2.2, RELICARIO_PALETTE.emberOrange),
    rect(2.4, -1.4, 3.0, 2.2, RELICARIO_PALETTE.emberOrange)
  ],
  brujo: [
    poly([[-14, -12], [-11.5, 4], [-5, -2], [5, -2], [11.5, 4], [14, -12], [0, -14.5]], '#280910', RELICARIO_PALETTE.vermilion, 1.5),
    poly([[-7.5, -7], [-10.5, 14.5], [-3.5, 7], [0, 11], [3.5, 7], [10.5, 14.5], [7.5, -7], [0, -10.5]], '#130609', RELICARIO_PALETTE.vermilion, 1.5),
    poly([[0, 6.2], [2.4, 3.6], [0, 1.0], [-2.4, 3.6]], RELICARIO_PALETTE.liturgicalGold),
    ellipse(-3.3, -0.9, 1.7, 1.3, RELICARIO_PALETTE.ivory, RELICARIO_PALETTE.vermilion, 0.8),
    ellipse(3.3, -0.9, 1.7, 1.3, RELICARIO_PALETTE.ivory, RELICARIO_PALETTE.vermilion, 0.8)
  ],
  heraldo: [
    poly([[-12.5, -14], [12.5, -14], [7.5, 0], [-7.5, 0]], '#0E0E16', RELICARIO_PALETTE.coldSilver, 1.5),
    poly([[-15, 12.5], [-7, 7.5], [0, 5.5], [7, 7.5], [15, 12.5], [10, 4.5], [0, 2.5], [-10, 4.5]], RELICARIO_PALETTE.coldSilver, RELICARIO_PALETTE.ivory, 1.1),
    poly([[0, 10.5], [7.2, 0.5], [0, -9.5], [-7.2, 0.5]], RELICARIO_PALETTE.voidBlack, RELICARIO_PALETTE.graceJade, 1.5),
    poly([[-3.2, 3.2], [-1.4, 1.4], [-3.2, -0.4], [-5.0, 1.4]], RELICARIO_PALETTE.graceJade),
    poly([[3.2, 3.2], [5.0, 1.4], [3.2, -0.4], [1.4, 1.4]], RELICARIO_PALETTE.graceJade)
  ]
};

export function renderAvatarSVG(avatarId, size = 36, showAuraRing = true) {
  const av = PLAYER_AVATAR_MAP[avatarId] || PLAYER_AVATAR_MAP.penitente;
  const shapes = (AVATAR_SHAPES[av.id] || AVATAR_SHAPES.penitente).join('');
  const auraStyle = showAuraRing
    ? `background: radial-gradient(circle, ${av.auraColor}38 0%, rgba(17,14,14,0.92) 74%); border-radius: 999px;`
    : '';
  return `<svg width="${size}" height="${size}" viewBox="-18 -18 36 36" style="${auraStyle} display:block; flex-shrink:0;" aria-hidden="true">${shapes}</svg>`;
}
