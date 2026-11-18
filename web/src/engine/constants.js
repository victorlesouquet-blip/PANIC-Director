// Paleta Relicario de Ceniza y Carmesí + Configuración del Modo Unificado de 2 Minutos (3 Fases de 40s)

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

export const TOTAL_RUN_DURATION = 120.0;
export const PHASE_DURATION = 40.0;
export const PHASE_TRANSITION_DURATION = 5.0;

// Los 3 tramos temporales progresivos de la partida unificada de 2 minutos (0-40s, 40-80s, 80-120s)
export const CAMPAIGN_PHASES = [
  {
    id: 'classic1985',
    phaseNumber: 1,
    startSec: 0,
    endSec: 40,
    durationSec: 40,
    rangeLabel: '0s – 40s',
    clockRangeLabel: '0:00 – 0:40',
    displayTitle: 'Fase 1 · Modo 1985 (Reglas Fijas)',
    shortBadge: 'F1 · 1985 (0-40s)',
    hudBadge: 'FASE 1/3 · 1985 FIJO',
    tableHeader: 'F1 · 1985',
    subtitle: 'Tramo 0s–40s: escalada matemática fija y botiquín programado por reloj',
    transitionKicker: 'TRAMO INICIAL · 0s A 40s',
    transitionHeadline: 'FASE 1: MODO 1985 (CLÁSICO)',
    transitionDescription: 'Las criaturas aparecen siguiendo una fórmula fija por segundo, sin importar tu vida ni tu estrés.',
    accentColor: RELICARIO_PALETTE.oldBone
  },
  {
    id: 'hybrid1985x2026',
    phaseNumber: 2,
    startSec: 40,
    endSec: 80,
    durationSec: 40,
    rangeLabel: '40s – 1m20s',
    clockRangeLabel: '0:40 – 1:20',
    displayTitle: 'Fase 2 · Modo Híbrido (1985 × 2026)',
    shortBadge: 'F2 · HÍBRIDO (40s-1m20s)',
    hudBadge: 'FASE 2/3 · HÍBRIDO',
    tableHeader: 'F2 · HÍBR.',
    subtitle: 'Tramo 40s–1m20s: incremento de dificultad con ráfagas de reloj + lectura de estrés',
    transitionKicker: '¡FASE 1 SUPERADA! · INCREMENTO DE DIFICULTAD (40s – 1m20s)',
    transitionHeadline: 'FASE 2: MODO HÍBRIDO (1985 × 2026)',
    transitionDescription: 'La horda acelera y lanza ráfagas de asedio por reloj, mientras un sistema híbrido empieza a reaccionar a tu Índice de Estrés.',
    accentColor: RELICARIO_PALETTE.liturgicalGold
  },
  {
    id: 'director2026',
    phaseNumber: 3,
    startSec: 80,
    endSec: 120,
    durationSec: 40,
    rangeLabel: '1m20s – 2m00s',
    clockRangeLabel: '1:20 – 2:00',
    displayTitle: 'Fase 3 · Modo IA Directora (2026)',
    shortBadge: 'F3 · IA 2026 (1m20s-2m)',
    hudBadge: 'FASE 3/3 · IA DIRECTORA',
    tableHeader: 'F3 · IA 2026',
    subtitle: 'Tramo 1m20s–2m00s: clímax adaptativo que moldea brechas y curas según tu estrés en vivo',
    transitionKicker: '¡FASE 2 SUPERADA! · CLÍMAX FINAL (1m20s – 2m00s)',
    transitionHeadline: 'FASE 3: IA DIRECTORA 2026',
    transitionDescription: 'Presión máxima. La IA Directora lee tu estrés en tiempo real: abrirá corredores de escape y enviará Gotas de Gracia tácticas cuando estés al límite.',
    accentColor: RELICARIO_PALETTE.vermilion
  }
];

export const GAME_MODES = CAMPAIGN_PHASES;

export const GAME_MODE_MAP = {
  ...Object.fromEntries(CAMPAIGN_PHASES.map((m) => [m.id, m])),
  unified: {
    id: 'unified',
    displayTitle: 'Campaña Unificada (1985 → Híbrido → IA 2026)',
    shortBadge: '3 FASES · 2 MIN',
    tableHeader: '2 MIN',
    subtitle: '0-40s Modo 1985 · 40s-1m20s Híbrido · 1m20s-2m IA Directora',
    accentColor: RELICARIO_PALETTE.vermilion
  }
};

export function getPhaseForElapsedTime(elapsedSeconds) {
  const t = Math.max(0, Number(elapsedSeconds) || 0);
  if (t < 40.0) return CAMPAIGN_PHASES[0];
  if (t < 80.0) return CAMPAIGN_PHASES[1];
  return CAMPAIGN_PHASES[2];
}

export function formatDurationClock(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(s / 60);
  const rem = s - mins * 60;
  if (mins > 0) {
    const wholeSec = Math.floor(rem);
    return `${mins}m ${String(wholeSec).padStart(2, '0')}s`;
  }
  return `${s.toFixed(1)}s`;
}

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
