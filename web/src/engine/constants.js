// Paleta Relicario de Ceniza y Carmesí + Catálogo exacto de Modos, Avatares y Niveles de Estrés

export const RELICARIO_PALETTE = {
  arenaBG: '#110E0E',
  cardBG: '#191415',
  cardBorder: '#332426',
  basaltSlab: '#1C1616',
  ritualSeal: '#261D1D',
  ivory: '#F5EFE6',
  coldSilver: '#72EFDD',
  projectileCore: '#E0FBFC',
  projectileTrail: '#98C1D9',
  graceJade: '#34F5C5',
  vermilion: '#FF1E42',
  darkFlesh: '#1A1012',
  oldBone: '#E6CCB2',
  visceralCore: '#D90429',
  voidBlack: '#080606',
  liturgicalGold: '#FFB800',
  emberOrange: '#FF6B2B'
};

export const GAME_MODES = [
  {
    id: 'classic1985',
    displayTitle: 'Modo 1985 (Clásico)',
    shortBadge: '1985 · FIJO',
    tableHeader: '1985',
    subtitle: 'Reglas fijas y oleadas implacables que ignoran al jugador',
    accentColor: RELICARIO_PALETTE.oldBone
  },
  {
    id: 'director2026',
    displayTitle: 'Modo 2026 (IA Directora)',
    shortBadge: '2026 · IA',
    tableHeader: '2026',
    subtitle: 'IA Directora que mide tu estrés en vivo y moldea la partida',
    accentColor: RELICARIO_PALETTE.vermilion
  },
  {
    id: 'hybrid1985x2026',
    displayTitle: 'Modo Híbrido (1985 × 2026)',
    shortBadge: '85 × 26 · MIX',
    tableHeader: 'HÍBR.',
    subtitle: 'Oleadas fijas y ráfagas de reloj 1985 mutadas por la IA Directora 2026',
    accentColor: RELICARIO_PALETTE.liturgicalGold
  }
];

export const GAME_MODE_MAP = Object.fromEntries(GAME_MODES.map((m) => [m.id, m]));

export const PLAYER_AVATARS = [
  {
    id: 'penitente',
    displayName: 'Penitente',
    shortLabel: 'Penitente',
    roleSubtitle: 'Capucha de ceniza y ojo consagrado',
    auraColor: RELICARIO_PALETTE.coldSilver
  },
  {
    id: 'inquisidor',
    displayName: 'Inquisidor',
    shortLabel: 'Inquisidor',
    roleSubtitle: 'Cazador de herejías con doble sello',
    auraColor: RELICARIO_PALETTE.graceJade
  },
  {
    id: 'serafin',
    displayName: 'Serafín',
    shortLabel: 'Serafín',
    roleSubtitle: 'Alas de hueso y tercer ojo áureo',
    auraColor: RELICARIO_PALETTE.liturgicalGold
  },
  {
    id: 'cuervo',
    displayName: 'Cuervo',
    shortLabel: 'Cuervo',
    roleSubtitle: 'Máscara de plaga y lentes carmesí',
    auraColor: RELICARIO_PALETTE.vermilion
  },
  {
    id: 'verdugo',
    displayName: 'Verdugo',
    shortLabel: 'Verdugo',
    roleSubtitle: 'Yelmo de hierro y visera de brasa',
    auraColor: RELICARIO_PALETTE.emberOrange
  },
  {
    id: 'oraculo',
    displayName: 'Oráculo',
    shortLabel: 'Oráculo',
    roleSubtitle: 'Tiara lunar y visión espectral',
    auraColor: RELICARIO_PALETTE.coldSilver
  },
  {
    id: 'golem',
    displayName: 'Gólem Óseo',
    shortLabel: 'Gólem',
    roleSubtitle: 'Cráneo astado forjado en osario',
    auraColor: RELICARIO_PALETTE.vermilion
  },
  {
    id: 'espectro',
    displayName: 'Espectro',
    shortLabel: 'Espectro',
    roleSubtitle: 'Sudario errante de tres miradas',
    auraColor: RELICARIO_PALETTE.graceJade
  },
  {
    id: 'automata',
    displayName: 'Autómata',
    shortLabel: 'Autómata',
    roleSubtitle: 'Astrolabio viviente de bronce',
    auraColor: RELICARIO_PALETTE.liturgicalGold
  },
  {
    id: 'templario',
    displayName: 'Templario',
    shortLabel: 'Templario',
    roleSubtitle: 'Gran yelmo sellado en oro y sangre',
    auraColor: RELICARIO_PALETTE.liturgicalGold
  },
  {
    id: 'brujo',
    displayName: 'Brujo',
    shortLabel: 'Brujo',
    roleSubtitle: 'Corona torcida de fuego abisal',
    auraColor: RELICARIO_PALETTE.vermilion
  },
  {
    id: 'heraldo',
    displayName: 'Heraldo',
    shortLabel: 'Heraldo',
    roleSubtitle: 'Efigie nocturna bajo media luna',
    auraColor: RELICARIO_PALETTE.coldSilver
  }
];

export const PLAYER_AVATAR_MAP = Object.fromEntries(PLAYER_AVATARS.map((a) => [a.id, a]));

export const STRESS_TIERS = {
  bajo: { rawValue: 0, label: 'BAJO', color: RELICARIO_PALETTE.coldSilver },
  optimo: { rawValue: 1, label: 'ÓPTIMO', color: RELICARIO_PALETTE.liturgicalGold },
  alto: { rawValue: 2, label: 'ALTO', color: RELICARIO_PALETTE.emberOrange },
  critico: { rawValue: 3, label: 'CRÍTICO', color: RELICARIO_PALETTE.vermilion }
};

export function stressTierFromIndex(index) {
  if (index < 35) return STRESS_TIERS.bajo;
  if (index < 68) return STRESS_TIERS.optimo;
  if (index < 88) return STRESS_TIERS.alto;
  return STRESS_TIERS.critico;
}

export const LEADERBOARD_SORT_METRICS = [
  { id: 'overallRanking', title: 'Ránking' },
  { id: 'avgKills', title: 'Bajas' },
  { id: 'avgTime', title: 'Tiempo' },
  { id: 'survivalRate', title: 'Superv.' },
  { id: 'avgStress', title: 'Estrés' },
  { id: 'alphabetical', title: 'A–Z' }
];
