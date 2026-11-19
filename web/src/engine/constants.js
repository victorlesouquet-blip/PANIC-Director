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
    passiveBadge: '⚡ +20% Cadencia',
    roleSubtitle: 'Mejora básica: +20% velocidad de disparo inicial',
    auraColor: RELICARIO_PALETTE.coldSilver,
    startingBonuses: { rateBonus: 0.20, projSpeedBonus: 35 }
  },
  {
    id: 'inquisidor',
    displayName: 'Inquisidor',
    shortLabel: 'Inquisidor',
    passiveBadge: '🔱 +45% Doble Tiro',
    roleSubtitle: 'Mejora básica: 45% de prob. de disparar 2 balas',
    auraColor: RELICARIO_PALETTE.graceJade,
    startingBonuses: { extraShots: 0.45 }
  },
  {
    id: 'serafin',
    displayName: 'Serafín',
    shortLabel: 'Serafín',
    passiveBadge: '👟 +18% Velocidad',
    roleSubtitle: 'Mejora básica: +18% velocidad de movimiento',
    auraColor: RELICARIO_PALETTE.liturgicalGold,
    startingBonuses: { speedBonus: 0.18 }
  },
  {
    id: 'cuervo',
    displayName: 'Cuervo',
    shortLabel: 'Cuervo',
    passiveBadge: '🧲 Imán + Curas',
    roleSubtitle: 'Mejora básica: gran imán y botiquines curan +12 HP extra',
    auraColor: RELICARIO_PALETTE.vermilion,
    startingBonuses: { radiusBonus: 80, medkitHealBonus: 12 }
  },
  {
    id: 'verdugo',
    displayName: 'Verdugo',
    shortLabel: 'Verdugo',
    passiveBadge: '⚔️ +25% Daño',
    roleSubtitle: 'Mejora básica: +25% de daño por disparo y más empuje',
    auraColor: RELICARIO_PALETTE.emberOrange,
    startingBonuses: { dmgBonus: 0.25, knockBonus: 0.20 }
  },
  {
    id: 'oraculo',
    displayName: 'Oráculo',
    shortLabel: 'Oráculo',
    passiveBadge: '✨ +25% XP',
    roleSubtitle: 'Mejora básica: gana +25% de experiencia para subir antes',
    auraColor: RELICARIO_PALETTE.coldSilver,
    startingBonuses: { xpMultiplier: 1.25 }
  },
  {
    id: 'golem',
    displayName: 'Gólem Óseo',
    shortLabel: 'Gólem',
    passiveBadge: '❤️ 135 Vida',
    roleSubtitle: 'Mejora básica: empieza con 135 de vida máxima',
    auraColor: RELICARIO_PALETTE.vermilion,
    startingBonuses: { maxHpBonus: 35 }
  },
  {
    id: 'espectro',
    displayName: 'Espectro',
    shortLabel: 'Espectro',
    passiveBadge: '🏹 +1 Perforación',
    roleSubtitle: 'Mejora básica: sus balas atraviesan a +1 enemigo',
    auraColor: RELICARIO_PALETTE.graceJade,
    startingBonuses: { pierceBonus: 1.0, scaleBonus: 0.08 }
  },
  {
    id: 'automata',
    displayName: 'Autómata',
    shortLabel: 'Autómata',
    passiveBadge: '⚙️ +12% Daño/Cad.',
    roleSubtitle: 'Mejora básica: +12% de daño y +12% de velocidad de disparo',
    auraColor: RELICARIO_PALETTE.liturgicalGold,
    startingBonuses: { dmgBonus: 0.12, rateBonus: 0.12, projSpeedBonus: 40 }
  },
  {
    id: 'templario',
    displayName: 'Templario',
    shortLabel: 'Templario',
    passiveBadge: '🛡️ +20 Vida/Escudo',
    roleSubtitle: 'Mejora básica: 120 de vida y doble escudo tras recibir daño',
    auraColor: RELICARIO_PALETTE.liturgicalGold,
    startingBonuses: { maxHpBonus: 20, iframeBonus: 0.45 }
  },
  {
    id: 'brujo',
    displayName: 'Brujo',
    shortLabel: 'Brujo',
    passiveBadge: '💥 Explosión',
    roleSubtitle: 'Mejora básica: los enemigos explotan al morir',
    auraColor: RELICARIO_PALETTE.vermilion,
    startingBonuses: { novaDmg: 1.1, novaRadius: 16 }
  },
  {
    id: 'heraldo',
    displayName: 'Heraldo',
    shortLabel: 'Heraldo',
    passiveBadge: '🩸 Robo de Vida',
    roleSubtitle: 'Mejora básica: recupera +2 HP cada 5 kills y +8% velocidad',
    auraColor: RELICARIO_PALETTE.coldSilver,
    startingBonuses: { lifeStealEveryKills: 5, lifeStealAmount: 2, speedBonus: 0.08 }
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
  { id: 'avgKills', title: 'Kills' },
  { id: 'avgTime', title: 'Tiempo' },
  { id: 'survivalRate', title: 'Superv.' },
  { id: 'avgStress', title: 'Estrés' },
  { id: 'alphabetical', title: 'A–Z' }
];

// Grados de rareza de las mejoras por color:
// Gris = Común | Verde = Poco común | Azul = Raro | Morado = Épico | Amarillo = Legendario
export const UPGRADE_RARITIES = [
  {
    id: 'common',
    order: 1,
    label: 'COMÚN',
    color: '#9CA3AF',
    bgTint: 'rgba(156, 163, 175, 0.16)',
    borderTint: 'rgba(156, 163, 175, 0.65)',
    glowTint: 'rgba(156, 163, 175, 0.15)',
    baseWeight: 45
  },
  {
    id: 'uncommon',
    order: 2,
    label: 'POCO COMÚN',
    color: '#22C55E',
    bgTint: 'rgba(34, 197, 94, 0.16)',
    borderTint: 'rgba(34, 197, 94, 0.75)',
    glowTint: 'rgba(34, 197, 94, 0.24)',
    baseWeight: 28
  },
  {
    id: 'rare',
    order: 3,
    label: 'RARO',
    color: '#3B82F6',
    bgTint: 'rgba(59, 130, 246, 0.18)',
    borderTint: 'rgba(59, 130, 246, 0.82)',
    glowTint: 'rgba(59, 130, 246, 0.32)',
    baseWeight: 16
  },
  {
    id: 'epic',
    order: 4,
    label: 'ÉPICO',
    color: '#A855F7',
    bgTint: 'rgba(168, 85, 247, 0.20)',
    borderTint: 'rgba(168, 85, 247, 0.88)',
    glowTint: 'rgba(168, 85, 247, 0.40)',
    baseWeight: 8
  },
  {
    id: 'legendary',
    order: 5,
    label: 'LEGENDARIO',
    color: '#FACC15',
    bgTint: 'rgba(250, 204, 21, 0.22)',
    borderTint: 'rgba(250, 204, 21, 0.96)',
    glowTint: 'rgba(250, 204, 21, 0.52)',
    baseWeight: 3
  }
];

export const UPGRADE_RARITY_MAP = Object.fromEntries(UPGRADE_RARITIES.map((r) => [r.id, r]));

// Catálogo de mejoras sencillas, visuales y escaladas por rareza (Común -> Poco común -> Raro -> Épico -> Legendario)
export const LEVEL_UPGRADES = [
  {
    id: 'damage',
    title: 'Daño de Disparo',
    icon: '⚔️',
    maxRank: 6,
    tiers: {
      common: {
        shortTag: '+18% Daño',
        description: 'Tus disparos hacen un 18% más de daño.',
        dmgBonus: 0.18,
        knockBonus: 0.08
      },
      uncommon: {
        shortTag: '+32% Daño',
        description: 'Tus disparos hacen un 32% más de daño.',
        dmgBonus: 0.32,
        knockBonus: 0.15
      },
      rare: {
        shortTag: '+50% Daño',
        description: 'Tus disparos hacen un 50% más de daño.',
        dmgBonus: 0.50,
        knockBonus: 0.24
      },
      epic: {
        shortTag: '+75% Daño',
        description: 'Tus disparos hacen un 75% más de daño.',
        dmgBonus: 0.75,
        knockBonus: 0.35
      },
      legendary: {
        shortTag: '+115% Daño',
        description: '¡El doble de potencia! +115% de daño por disparo.',
        dmgBonus: 1.15,
        knockBonus: 0.50
      }
    }
  },
  {
    id: 'fireRate',
    title: 'Velocidad de Disparo',
    icon: '⚡',
    maxRank: 6,
    tiers: {
      common: {
        shortTag: '+12% Cadencia',
        description: 'Disparas un 12% más rápido.',
        rateBonus: 0.12,
        projSpeedBonus: 25
      },
      uncommon: {
        shortTag: '+22% Cadencia',
        description: 'Disparas un 22% más rápido.',
        rateBonus: 0.22,
        projSpeedBonus: 45
      },
      rare: {
        shortTag: '+35% Cadencia',
        description: 'Disparas un 35% más rápido.',
        rateBonus: 0.35,
        projSpeedBonus: 70
      },
      epic: {
        shortTag: '+50% Cadencia',
        description: 'Disparas un 50% más rápido.',
        rateBonus: 0.50,
        projSpeedBonus: 100
      },
      legendary: {
        shortTag: '+75% Cadencia',
        description: '¡Ráfaga extrema! Disparas un 75% más rápido.',
        rateBonus: 0.75,
        projSpeedBonus: 145
      }
    }
  },
  {
    id: 'multishot',
    title: 'Multidisparo',
    icon: '🔱',
    maxRank: 5,
    tiers: {
      common: {
        shortTag: '+35% Doble Tiro',
        description: '1 de cada 3 disparos lanza una bala extra.',
        extraShots: 0.35,
        dmgBonus: 0
      },
      uncommon: {
        shortTag: '+55% Doble Tiro',
        description: 'La mitad de tus disparos lanzan una bala extra.',
        extraShots: 0.55,
        dmgBonus: 0.05
      },
      rare: {
        shortTag: '+1 Bala Extra',
        description: 'Disparas +1 bala extra en abanico siempre.',
        extraShots: 1.0,
        dmgBonus: 0.10
      },
      epic: {
        shortTag: '+1 Bala y +25% Daño',
        description: 'Disparas +1 bala extra siempre y +25% de daño.',
        extraShots: 1.0,
        dmgBonus: 0.25
      },
      legendary: {
        shortTag: '+2 Balas Extra',
        description: '¡Disparas +2 balas extra en abanico y +35% de daño!',
        extraShots: 2.0,
        dmgBonus: 0.35
      }
    }
  },
  {
    id: 'pierce',
    title: 'Disparo Perforante',
    icon: '🏹',
    maxRank: 5,
    tiers: {
      common: {
        shortTag: '50% Perforar',
        description: '50% de probabilidad de atravesar a un enemigo.',
        pierceBonus: 0.5,
        dmgBonus: 0,
        scaleBonus: 0.06
      },
      uncommon: {
        shortTag: '+1 Perforación',
        description: 'Tus balas atraviesan a +1 enemigo.',
        pierceBonus: 1.0,
        dmgBonus: 0.08,
        scaleBonus: 0.10
      },
      rare: {
        shortTag: '+1 Perf. y +20% Daño',
        description: 'Tus balas atraviesan a +1 enemigo y hacen +20% daño.',
        pierceBonus: 1.0,
        dmgBonus: 0.20,
        scaleBonus: 0.15
      },
      epic: {
        shortTag: '+2 Perforación',
        description: 'Tus balas atraviesan a +2 enemigos y hacen +30% daño.',
        pierceBonus: 2.0,
        dmgBonus: 0.30,
        scaleBonus: 0.22
      },
      legendary: {
        shortTag: '+3 Perforación',
        description: '¡Tus balas atraviesan a +3 enemigos y hacen +45% daño!',
        pierceBonus: 3.0,
        dmgBonus: 0.45,
        scaleBonus: 0.32
      }
    }
  },
  {
    id: 'moveSpeed',
    title: 'Velocidad',
    icon: '👟',
    maxRank: 5,
    tiers: {
      common: {
        shortTag: '+10% Velocidad',
        description: 'Corres un 10% más rápido.',
        speedBonus: 0.10,
        iframeBonus: 0
      },
      uncommon: {
        shortTag: '+16% Velocidad',
        description: 'Corres un 16% más rápido.',
        speedBonus: 0.16,
        iframeBonus: 0.1
      },
      rare: {
        shortTag: '+24% Velocidad',
        description: 'Corres un 24% más rápido.',
        speedBonus: 0.24,
        iframeBonus: 0.2
      },
      epic: {
        shortTag: '+34% Velocidad',
        description: 'Corres un 34% más rápido y tienes más escudo al ser golpeado.',
        speedBonus: 0.34,
        iframeBonus: 0.35
      },
      legendary: {
        shortTag: '+48% Velocidad',
        description: '¡Velocidad máxima! Corres un 48% más rápido.',
        speedBonus: 0.48,
        iframeBonus: 0.60
      }
    }
  },
  {
    id: 'vitality',
    title: 'Vida y Curación',
    icon: '❤️',
    maxRank: 6,
    tiers: {
      common: {
        shortTag: '+18 HP y +12 Vida Máx',
        description: 'Recuperas 18 de vida ahora y sube tu vida máxima.',
        maxHpBonus: 12,
        healNow: 18
      },
      uncommon: {
        shortTag: '+30 HP y +22 Vida Máx',
        description: 'Recuperas 30 de vida ahora y sube tu vida máxima.',
        maxHpBonus: 22,
        healNow: 30
      },
      rare: {
        shortTag: '+45 HP y +35 Vida Máx',
        description: 'Recuperas 45 de vida ahora y sube tu vida máxima.',
        maxHpBonus: 35,
        healNow: 45
      },
      epic: {
        shortTag: '+70 HP y +55 Vida Máx',
        description: 'Recuperas 70 de vida ahora y gran aumento de vida máxima.',
        maxHpBonus: 55,
        healNow: 70
      },
      legendary: {
        shortTag: '+110 HP y +85 Vida Máx',
        description: '¡Curación total! +110 de vida ahora y +85 de vida máxima.',
        maxHpBonus: 85,
        healNow: 110
      }
    }
  },
  {
    id: 'magnet',
    title: 'Imán de Curas',
    icon: '🧲',
    maxRank: 5,
    tiers: {
      common: {
        shortTag: '+Imán y +10 HP',
        description: 'Atrae botiquines desde más lejos y te cura 10 HP ahora.',
        radiusBonus: 40,
        medkitHealBonus: 6,
        healNow: 10
      },
      uncommon: {
        shortTag: '+Imán y +15 HP',
        description: 'Mayor imán, los botiquines curan más y ganas 15 HP ahora.',
        radiusBonus: 70,
        medkitHealBonus: 10,
        healNow: 15
      },
      rare: {
        shortTag: 'Gran Imán y +22 HP',
        description: 'Doble alcance de imán y recuperas 22 HP al instante.',
        radiusBonus: 110,
        medkitHealBonus: 16,
        healNow: 22
      },
      epic: {
        shortTag: 'Super Imán y +32 HP',
        description: 'Atrae botiquines de muy lejos y recuperas 32 HP ahora.',
        radiusBonus: 160,
        medkitHealBonus: 24,
        healNow: 32
      },
      legendary: {
        shortTag: 'Imán Total y +45 HP',
        description: '¡Atrae curas de toda la arena y recuperas 45 HP ahora!',
        radiusBonus: 260,
        medkitHealBonus: 35,
        healNow: 45
      }
    }
  },
  {
    id: 'nova',
    title: 'Enemigos Explosivos',
    icon: '💥',
    maxRank: 5,
    tiers: {
      common: {
        shortTag: 'Explosión Suave',
        description: 'Los enemigos explotan al morir dañando alrededor.',
        novaDmg: 0.9,
        novaRadius: 12
      },
      uncommon: {
        shortTag: 'Explosión Media',
        description: 'Los enemigos hacen una explosión mayor al morir.',
        novaDmg: 1.6,
        novaRadius: 20
      },
      rare: {
        shortTag: 'Explosión Fuerte',
        description: 'Fuerte explosión en área con cada kill.',
        novaDmg: 2.5,
        novaRadius: 28
      },
      epic: {
        shortTag: 'Gran Explosión',
        description: 'Gran onda explosiva al matar que arrasa grupos.',
        novaDmg: 3.8,
        novaRadius: 38
      },
      legendary: {
        shortTag: 'Supernova',
        description: '¡Cada kill provoca una gran explosión en cadena!',
        novaDmg: 5.8,
        novaRadius: 52
      }
    }
  }
];

export const LEVEL_UPGRADE_MAP = Object.fromEntries(LEVEL_UPGRADES.map((u) => [u.id, u]));
