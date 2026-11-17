// Almacén de Telemetría de Clase, Ránking por Medias y Perfiles de Jugador (localStorage + fusión JSON)

import { GAME_MODES } from './constants.js';

const STORAGE_KEY = 'panic_director_web_telemetry_v1';

export function normalizeInitials(raw) {
  const cleaned = String(raw || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (!cleaned) return '---';
  return cleaned.slice(0, 3).padEnd(3, 'A');
}

export function aggregateModeStats(records, modeId) {
  const filtered = records.filter((r) => r.mode === modeId);
  if (filtered.length === 0) {
    return {
      mode: modeId,
      runCount: 0,
      survivalRatePercent: 0,
      avgSurvivedSeconds: 0,
      avgKills: 0,
      avgStress: 0,
      avgPeakStress: 0
    };
  }

  const count = filtered.length;
  const survivedCount = filtered.filter((r) => r.didSurvive).length;
  const totalTime = filtered.reduce((acc, r) => acc + r.survivedSeconds, 0);
  const totalKills = filtered.reduce((acc, r) => acc + r.kills, 0);
  const totalAvgStress = filtered.reduce((acc, r) => acc + r.averageStress, 0);
  const totalPeakStress = filtered.reduce((acc, r) => acc + r.peakStress, 0);

  return {
    mode: modeId,
    runCount: count,
    survivalRatePercent: (survivedCount / count) * 100.0,
    avgSurvivedSeconds: totalTime / count,
    avgKills: totalKills / count,
    avgStress: totalAvgStress / count,
    avgPeakStress: totalPeakStress / count
  };
}

export function buildPlayerProfile(initials, runs) {
  if (!runs || runs.length === 0) return null;
  const sortedRuns = [...runs].sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
  const count = sortedRuns.length;
  const survivedCount = sortedRuns.filter((r) => r.didSurvive).length;
  const survivalRatePercent = (survivedCount / count) * 100.0;

  const avgSurvivedSeconds = sortedRuns.reduce((s, r) => s + r.survivedSeconds, 0) / count;
  const bestSurvivedSeconds = sortedRuns.reduce((m, r) => Math.max(m, r.survivedSeconds), 0);
  const avgKills = sortedRuns.reduce((s, r) => s + r.kills, 0) / count;
  const bestKills = sortedRuns.reduce((m, r) => Math.max(m, r.kills), 0);
  const avgStress = sortedRuns.reduce((s, r) => s + r.averageStress, 0) / count;
  const avgPeakStress = sortedRuns.reduce((s, r) => s + r.peakStress, 0) / count;
  const avgMedkits = sortedRuns.reduce((s, r) => s + (r.medkitsCollected || 0), 0) / count;

  // Índice compuesto exacto de rendimiento medio
  const rankingScore = avgSurvivedSeconds * 10.0 + avgKills * 12.0 + survivalRatePercent * 2.5;

  const avatarCounts = new Map();
  const latestIndexByAvatar = new Map();
  sortedRuns.forEach((run, idx) => {
    if (!run.avatar) return;
    avatarCounts.set(run.avatar, (avatarCounts.get(run.avatar) || 0) + 1);
    if (!latestIndexByAvatar.has(run.avatar)) {
      latestIndexByAvatar.set(run.avatar, idx);
    }
  });

  const usedAvatars = Array.from(avatarCounts.entries())
    .map(([avatar, usageCount]) => ({ avatar, count: usageCount }))
    .sort((lhs, rhs) => {
      if (lhs.count !== rhs.count) return rhs.count - lhs.count;
      return (latestIndexByAvatar.get(lhs.avatar) ?? 9999) - (latestIndexByAvatar.get(rhs.avatar) ?? 9999);
    });

  const statsByMode = {};
  for (const m of GAME_MODES) {
    statsByMode[m.id] = aggregateModeStats(sortedRuns, m.id);
  }

  return {
    initials,
    runCount: count,
    survivedCount,
    survivalRatePercent,
    avgSurvivedSeconds,
    bestSurvivedSeconds,
    avgKills,
    bestKills,
    avgStress,
    avgPeakStress,
    avgMedkits,
    rankingScore,
    favoriteAvatar: usedAvatars[0]?.avatar || null,
    latestAvatar: sortedRuns.find((r) => Boolean(r.avatar))?.avatar || null,
    usedAvatars,
    statsByMode,
    runs: sortedRuns,
    lastPlayedAt: sortedRuns[0]?.playedAt || new Date().toISOString()
  };
}

export class TelemetryStore {
  constructor(storage = typeof window !== 'undefined' ? window.localStorage : null) {
    this.storage = storage;
    this.records = [];
    this.load();
  }

  get uniquePlayerCount() {
    return new Set(this.records.map((r) => normalizeInitials(r.initials))).size;
  }

  recordRun(record) {
    const cleanRecord = {
      id: record.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      initials: normalizeInitials(record.initials),
      avatar: record.avatar || null,
      mode: record.mode,
      survivedSeconds: Number(record.survivedSeconds) || 0,
      didSurvive: Boolean(record.didSurvive),
      kills: Number(record.kills) || 0,
      averageStress: Number(record.averageStress) || 0,
      peakStress: Number(record.peakStress) || 0,
      medkitsCollected: Number(record.medkitsCollected) || 0,
      playedAt: record.playedAt || new Date().toISOString()
    };
    this.records.unshift(cleanRecord);
    this.save();
    return cleanRecord;
  }

  stats(modeId) {
    return aggregateModeStats(this.records, modeId);
  }

  playerProfiles({ modeFilter = null, sortBy = 'overallRanking' } = {}) {
    const scoped = modeFilter ? this.records.filter((r) => r.mode === modeFilter) : this.records;
    const grouped = new Map();
    for (const r of scoped) {
      const key = normalizeInitials(r.initials);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(r);
    }

    const profiles = [];
    for (const [initials, playerRuns] of grouped.entries()) {
      const p = buildPlayerProfile(initials, playerRuns);
      if (p) profiles.push(p);
    }

    return profiles.sort((lhs, rhs) => {
      switch (sortBy) {
        case 'overallRanking':
          if (Math.abs(lhs.rankingScore - rhs.rankingScore) > 0.01) {
            return rhs.rankingScore - lhs.rankingScore;
          }
          if (Math.abs(lhs.avgSurvivedSeconds - rhs.avgSurvivedSeconds) > 0.01) {
            return rhs.avgSurvivedSeconds - lhs.avgSurvivedSeconds;
          }
          return lhs.initials.localeCompare(rhs.initials);

        case 'avgKills':
          if (Math.abs(lhs.avgKills - rhs.avgKills) > 0.01) {
            return rhs.avgKills - lhs.avgKills;
          }
          if (lhs.bestKills !== rhs.bestKills) {
            return rhs.bestKills - lhs.bestKills;
          }
          return lhs.initials.localeCompare(rhs.initials);

        case 'avgTime':
          if (Math.abs(lhs.avgSurvivedSeconds - rhs.avgSurvivedSeconds) > 0.01) {
            return rhs.avgSurvivedSeconds - lhs.avgSurvivedSeconds;
          }
          if (Math.abs(lhs.bestSurvivedSeconds - rhs.bestSurvivedSeconds) > 0.01) {
            return rhs.bestSurvivedSeconds - lhs.bestSurvivedSeconds;
          }
          return lhs.initials.localeCompare(rhs.initials);

        case 'survivalRate':
          if (Math.abs(lhs.survivalRatePercent - rhs.survivalRatePercent) > 0.01) {
            return rhs.survivalRatePercent - lhs.survivalRatePercent;
          }
          if (Math.abs(lhs.avgSurvivedSeconds - rhs.avgSurvivedSeconds) > 0.01) {
            return rhs.avgSurvivedSeconds - lhs.avgSurvivedSeconds;
          }
          return lhs.initials.localeCompare(rhs.initials);

        case 'avgStress':
          if (Math.abs(lhs.avgStress - rhs.avgStress) > 0.01) {
            return rhs.avgStress - lhs.avgStress;
          }
          if (Math.abs(lhs.avgPeakStress - rhs.avgPeakStress) > 0.01) {
            return rhs.avgPeakStress - lhs.avgPeakStress;
          }
          return lhs.initials.localeCompare(rhs.initials);

        case 'alphabetical':
        default:
          return lhs.initials.localeCompare(rhs.initials);
      }
    });
  }

  profile(initials) {
    const normalized = normalizeInitials(initials);
    const matching = this.records.filter((r) => normalizeInitials(r.initials) === normalized);
    return buildPlayerProfile(normalized, matching);
  }

  globalRank(initials) {
    const normalized = normalizeInitials(initials);
    const ranked = this.playerProfiles({ modeFilter: null, sortBy: 'overallRanking' });
    const idx = ranked.findIndex((p) => p.initials === normalized);
    return idx >= 0 ? idx + 1 : null;
  }

  exportJSON() {
    return JSON.stringify(this.records);
  }

  importAndMergeJSON(rawText) {
    const parsed = JSON.parse(rawText);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const existingIds = new Set(this.records.map((r) => r.id));
    let added = 0;

    for (const item of list) {
      if (!item || typeof item !== 'object' || !item.mode) continue;
      if (item.id && existingIds.has(item.id)) continue;
      const normalized = {
        id: item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        initials: normalizeInitials(item.initials),
        avatar: item.avatar || null,
        mode: item.mode,
        survivedSeconds: Number(item.survivedSeconds) || 0,
        didSurvive: Boolean(item.didSurvive),
        kills: Number(item.kills) || 0,
        averageStress: Number(item.averageStress) || 0,
        peakStress: Number(item.peakStress) || 0,
        medkitsCollected: Number(item.medkitsCollected) || 0,
        playedAt: item.playedAt || new Date().toISOString()
      };
      this.records.push(normalized);
      existingIds.add(normalized.id);
      added += 1;
    }

    if (added > 0) {
      this.records.sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
      this.save();
    }
    return added;
  }

  clearAll() {
    this.records = [];
    if (this.storage) {
      try {
        this.storage.removeItem(STORAGE_KEY);
      } catch {
        // Ignorar errores de almacenamiento restringido
      }
    }
  }

  load() {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const decoded = JSON.parse(raw);
      if (Array.isArray(decoded)) {
        this.records = decoded;
      }
    } catch {
      this.records = [];
    }
  }

  save() {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.records));
    } catch {
      // Ignorar cuota llena o modo privado
    }
  }
}
