// Directorio de Jugadores, Ránking por Medias y Perfil Estadístico Individual

import {
  GAME_MODES,
  GAME_MODE_MAP,
  LEADERBOARD_SORT_METRICS,
  PLAYER_AVATAR_MAP,
  RELICARIO_PALETTE,
  stressTierFromIndex
} from '../engine/constants.js';
import { renderAvatarSVG } from '../scene/avatarSVGs.js';
import { escapeHtml, formatSpanishDate, medalColor } from './domUtils.js';

export function mountPlayersView(root, { store, initialPlayerInitials = null, onReturnToStart, onUsePlayerSetup }) {
  let selectedModeFilter = null;
  let sortMetric = 'overallRanking';
  let searchText = '';
  let activeProfileInitials = initialPlayerInitials;

  const render = () => {
    if (activeProfileInitials) {
      const profile = store.profile(activeProfileInitials);
      if (profile) {
        renderProfileView(profile);
        return;
      }
      activeProfileInitials = null;
    }
    renderDirectoryView();
  };

  const renderDirectoryView = () => {
    const profiles = store.playerProfiles({ modeFilter: selectedModeFilter, sortBy: sortMetric });
    const rankedEntries = profiles.map((profile, idx) => ({ rank: idx + 1, profile }));
    const query = searchText.trim().toUpperCase();
    const filtered = query ? rankedEntries.filter((e) => e.profile.initials.includes(query)) : rankedEntries;
    const leader = rankedEntries[0] || null;
    const activeSortDef = LEADERBOARD_SORT_METRICS.find((m) => m.id === sortMetric) || LEADERBOARD_SORT_METRICS[0];
    const modeFilterDef = selectedModeFilter ? GAME_MODE_MAP[selectedModeFilter] : null;

    root.innerHTML = `
      <div class="players-layout">
        <nav class="sticky-top-nav" aria-label="Navegación de ránking">
          <button type="button" id="btn-players-home" class="btn-nav-back">‹ Inicio</button>
          <h1 class="nav-title">JUGADORES Y RÁNKING</h1>
          <span class="pill-badge-gold">${store.uniquePlayerCount} JUG.</span>
        </nav>

        <main class="screen-shell players-scroll">
          ${leader ? buildLeaderCardHtml(leader, activeSortDef, modeFilterDef) : ''}

          <section class="filter-block" aria-label="Búsqueda y filtros del ránking">
            <div class="search-field-wrap">
              <span class="search-icon" aria-hidden="true">⌕</span>
              <input
                id="input-player-search"
                class="search-input"
                type="search"
                maxlength="3"
                placeholder="Buscar jugador por iniciales (ej. VLF)..."
                value="${escapeHtml(searchText)}"
                aria-label="Buscar jugador por iniciales"
              />
              ${searchText ? `<button type="button" id="btn-clear-search" class="btn-clear-input" aria-label="Limpiar búsqueda">✕</button>` : ''}
            </div>

            <div class="chips-scroll" role="group" aria-label="Filtrar por motor de IA">
              <button
                type="button"
                id="btn-filter-mode-all"
                class="chip-btn ${selectedModeFilter === null ? 'is-selected' : ''}"
                style="${selectedModeFilter === null ? `color:${RELICARIO_PALETTE.coldSilver}; border-color:${RELICARIO_PALETTE.coldSilver}; background:${RELICARIO_PALETTE.coldSilver}26;` : ''}"
              >Todos</button>
              ${GAME_MODES.map((m) => {
                const isSel = selectedModeFilter === m.id;
                return `
                  <button
                    type="button"
                    id="btn-filter-mode-${m.id}"
                    class="chip-btn filter-mode-chip ${isSel ? 'is-selected' : ''}"
                    data-mode="${m.id}"
                    style="${isSel ? `color:${m.accentColor}; border-color:${m.accentColor}; background:${m.accentColor}26;` : ''}"
                  >${escapeHtml(m.tableHeader)}</button>
                `;
              }).join('')}
            </div>

            <div class="sort-block">
              <span class="micro-mono-muted">ORDENAR RÁNKING POR MEDIAS</span>
              <div class="chips-scroll" role="group" aria-label="Ordenar ránking por medias">
                ${LEADERBOARD_SORT_METRICS.map((m) => {
                  const isSel = sortMetric === m.id;
                  return `
                    <button
                      type="button"
                      id="btn-sort-${m.id}"
                      class="chip-btn sort-metric-chip ${isSel ? 'is-selected' : ''}"
                      data-sort="${m.id}"
                      style="${isSel ? `color:${RELICARIO_PALETTE.liturgicalGold}; border-color:${RELICARIO_PALETTE.liturgicalGold}; background:${RELICARIO_PALETTE.liturgicalGold}26;` : ''}"
                    >${escapeHtml(m.title)}</button>
                  `;
                }).join('')}
              </div>
              <p class="formula-caption">Índice global = Tiempo medio × 10 + Bajas medias × 12 + Superv. % × 2.5</p>
            </div>
          </section>

          ${rankedEntries.length === 0
            ? `<section class="panel empty-panel">
                <h2>Sin jugadores registrados todavía</h2>
                <p class="panel-subcopy">${selectedModeFilter === null
                  ? 'Completa partidas con distintas iniciales para ver el listado de jugadores, sus medias y su perfil individual.'
                  : 'Ningún jugador ha registrado partidas en este modo todavía.'}</p>
              </section>`
            : filtered.length === 0
              ? `<section class="panel empty-panel">
                  <h2>Sin resultados para "${escapeHtml(query)}"</h2>
                  <button type="button" id="btn-empty-clear-search" class="btn-link-cyan">Limpiar búsqueda</button>
                </section>`
              : `<section class="rank-list" aria-label="Lista de jugadores clasificados">
                  ${filtered.map((entry) => buildRankingRowHtml(entry, sortMetric)).join('')}
                </section>`
          }
        </main>
      </div>
    `;

    root.querySelector('#btn-players-home')?.addEventListener('click', onReturnToStart);

    root.querySelector('#btn-leader-profile')?.addEventListener('click', () => {
      if (leader) {
        activeProfileInitials = leader.profile.initials;
        render();
      }
    });

    const searchInput = root.querySelector('#input-player-search');
    searchInput?.addEventListener('input', (e) => {
      const caret = e.target.selectionStart;
      searchText = String(e.target.value || '').toUpperCase().replace(/[^A-Z]/g, '');
      render();
      const restored = root.querySelector('#input-player-search');
      if (restored) {
        restored.focus();
        try {
          restored.setSelectionRange(caret, caret);
        } catch {
          // Ignorar
        }
      }
    });

    root.querySelector('#btn-clear-search')?.addEventListener('click', () => {
      searchText = '';
      render();
    });
    root.querySelector('#btn-empty-clear-search')?.addEventListener('click', () => {
      searchText = '';
      render();
    });

    root.querySelector('#btn-filter-mode-all')?.addEventListener('click', () => {
      selectedModeFilter = null;
      render();
    });

    root.querySelectorAll('.filter-mode-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedModeFilter = btn.dataset.mode;
        render();
      });
    });

    root.querySelectorAll('.sort-metric-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        sortMetric = btn.dataset.sort;
        render();
      });
    });

    root.querySelectorAll('.rank-row-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeProfileInitials = btn.dataset.initials;
        render();
      });
    });
  };

  const renderProfileView = (profile) => {
    const globalRank = store.globalRank(profile.initials);
    const displayAvatarId = profile.favoriteAvatar || profile.latestAvatar;
    const avatarDef = displayAvatarId ? PLAYER_AVATAR_MAP[displayAvatarId] : null;
    const accent = avatarDef?.auraColor || RELICARIO_PALETTE.liturgicalGold;
    const m1985 = profile.statsByMode.classic1985;
    const m2026 = profile.statsByMode.director2026;
    const mHybrid = profile.statsByMode.hybrid1985x2026;
    const stressColor = stressTierFromIndex(profile.avgStress).color;

    root.innerHTML = `
      <div class="players-layout">
        <nav class="sticky-top-nav" aria-label="Navegación de perfil">
          <button type="button" id="btn-back-to-ranking" class="btn-nav-back">‹ Ránking</button>
          <h1 class="nav-title">PERFIL · ${escapeHtml(profile.initials)}</h1>
          ${globalRank
            ? `<span class="pill-badge-rank" style="color:${globalRank === 1 ? RELICARIO_PALETTE.liturgicalGold : RELICARIO_PALETTE.coldSilver}; background:${(globalRank === 1 ? RELICARIO_PALETTE.liturgicalGold : RELICARIO_PALETTE.coldSilver)}2B;">#${globalRank} GLOBAL</span>`
            : '<span></span>'}
        </nav>

        <main class="screen-shell players-scroll">
          <section class="panel" style="border-color:${accent}80;" aria-label="Identidad del jugador">
            <div class="profile-hero-row">
              ${displayAvatarId
                ? renderAvatarSVG(displayAvatarId, 56, true)
                : `<span class="monogram-lg">${escapeHtml(profile.initials)}</span>`}
              <div class="profile-hero-info">
                <div class="profile-name-line">
                  <strong class="profile-initials">${escapeHtml(profile.initials)}</strong>
                  ${avatarDef
                    ? `<span class="mode-badge" style="color:${accent}; background:${accent}29;">${escapeHtml(avatarDef.displayName)}</span>`
                    : ''}
                </div>
                <p class="panel-subcopy">
                  ${profile.runCount} ${profile.runCount === 1 ? 'partida registrada' : 'partidas registradas'} ·
                  ${profile.survivedCount} ${profile.survivedCount === 1 ? 'supervivencia' : 'supervivencias'}
                </p>
                <p class="profile-last-date">Última sesión: ${escapeHtml(formatSpanishDate(profile.lastPlayedAt))}</p>
              </div>
            </div>

            <button type="button" id="btn-play-as-player" class="btn-play-as">
              ▶ JUGAR COMO ${escapeHtml(profile.initials)}
            </button>
          </section>

          <section class="panel-group" aria-label="Medias y récords personales">
            <h2 class="panel-label gold-label">MEDIAS Y RÉCORDS PERSONALES</h2>
            <div class="kpi-grid-2">
              ${kpiCardHtml('TIEMPO MEDIO', `${profile.avgSurvivedSeconds.toFixed(1)}s`, `Récord: ${profile.bestSurvivedSeconds.toFixed(1)}s`, RELICARIO_PALETTE.ivory)}
              ${kpiCardHtml('BAJAS MEDIAS', `${profile.avgKills.toFixed(1)}`, `Récord: ${profile.bestKills} bajas`, RELICARIO_PALETTE.coldSilver)}
              ${kpiCardHtml('SUPERVIVENCIA 60s', `${Math.round(profile.survivalRatePercent)}%`, `${profile.survivedCount} de ${profile.runCount} rondas`, RELICARIO_PALETTE.graceJade)}
              ${kpiCardHtml('PUNTUACIÓN MEDIA', `${Math.round(profile.rankingScore)} pts`, globalRank ? `Puesto #${globalRank} de la clase` : 'Sin clasificar', RELICARIO_PALETTE.liturgicalGold)}
              ${kpiCardHtml('ESTRÉS MEDIO', `${Math.round(profile.avgStress)}%`, `Pico medio: ${Math.round(profile.avgPeakStress)}%`, stressColor)}
              ${kpiCardHtml('CURAS MEDIAS', `${profile.avgMedkits.toFixed(1)}`, 'Botiquines por partida', RELICARIO_PALETTE.graceJade)}
            </div>
          </section>

          <section class="panel" aria-label="Desglose por motor">
            <h2 class="panel-label gold-label">DESGLOSE POR MOTOR (MEDIAS)</h2>
            <div class="comparison-table" role="table">
              <div class="cmp-row cmp-header" role="row">
                <span>MÉTRICA</span>
                <span style="color:${RELICARIO_PALETTE.oldBone};">1985</span>
                <span style="color:${RELICARIO_PALETTE.vermilion};">2026</span>
                <span style="color:${RELICARIO_PALETTE.liturgicalGold};">HÍBR.</span>
              </div>
              ${modeRow('Partidas', `${m1985.runCount}`, `${m2026.runCount}`, `${mHybrid.runCount}`)}
              ${modeRow('Superv. 60s', fmtPct(m1985, m1985.survivalRatePercent), fmtPct(m2026, m2026.survivalRatePercent), fmtPct(mHybrid, mHybrid.survivalRatePercent))}
              ${modeRow('Tiempo medio', fmtSec(m1985, m1985.avgSurvivedSeconds), fmtSec(m2026, m2026.avgSurvivedSeconds), fmtSec(mHybrid, mHybrid.avgSurvivedSeconds))}
              ${modeRow('Bajas medias', fmtNum(m1985, m1985.avgKills), fmtNum(m2026, m2026.avgKills), fmtNum(mHybrid, mHybrid.avgKills))}
              ${modeRow('Estrés medio', fmtPct(m1985, m1985.avgStress), fmtPct(m2026, m2026.avgStress), fmtPct(mHybrid, mHybrid.avgStress))}
              ${modeRow('Estrés pico', fmtPct(m1985, m1985.avgPeakStress), fmtPct(m2026, m2026.avgPeakStress), fmtPct(mHybrid, mHybrid.avgPeakStress))}
            </div>
          </section>

          ${profile.usedAvatars.length > 0 ? `
            <section class="panel-group" aria-label="Avatares utilizados">
              <h2 class="panel-label">AVATARES UTILIZADOS</h2>
              <div class="chips-scroll">
                ${profile.usedAvatars.map((st) => {
                  const av = PLAYER_AVATAR_MAP[st.avatar];
                  if (!av) return '';
                  return `
                    <div class="used-avatar-chip" style="border-color:${av.auraColor}6E;">
                      ${renderAvatarSVG(av.id, 30, true)}
                      <div>
                        <div class="used-av-name">${escapeHtml(av.shortLabel)}</div>
                        <div class="used-av-count" style="color:${av.auraColor};">${st.count} ${st.count === 1 ? 'uso' : 'usos'}</div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </section>
          ` : ''}

          <section class="panel-group" aria-label="Historial de partidas del jugador">
            <h2 class="panel-label">HISTORIAL DE ${escapeHtml(profile.initials)} (${profile.runs.length})</h2>
            <div class="history-list">
              ${profile.runs.map((rec) => buildPlayerRunCardHtml(rec)).join('')}
            </div>
          </section>
        </main>
      </div>
    `;

    root.querySelector('#btn-back-to-ranking')?.addEventListener('click', () => {
      activeProfileInitials = null;
      render();
    });

    root.querySelector('#btn-play-as-player')?.addEventListener('click', () => {
      onUsePlayerSetup(profile.initials, displayAvatarId);
    });
  };

  render();

  const unsub = liveSync
    ? liveSync.subscribe(() => {
        const searchFocused = document.activeElement?.id === 'input-player-search';
        if (!searchFocused) {
          render();
        }
      })
    : null;

  return () => {
    if (unsub) unsub();
  };
}

function buildLeaderCardHtml(leader, sortDef, modeFilterDef) {
  const p = leader.profile;
  return `
    <button type="button" id="btn-leader-profile" class="leader-card-btn">
      ${p.favoriteAvatar
        ? renderAvatarSVG(p.favoriteAvatar, 42, true)
        : `<span class="monogram-md">${escapeHtml(p.initials.slice(0, 2))}</span>`}
      <span class="leader-info">
        <span class="leader-top-tag">
          <span class="leader-tag-gold">LÍDER #1 · ${escapeHtml(sortDef.title.toUpperCase())}</span>
          ${modeFilterDef ? `<span class="mode-badge-xs" style="color:${modeFilterDef.accentColor}; background:${modeFilterDef.accentColor}2E;">${escapeHtml(modeFilterDef.tableHeader)}</span>` : ''}
        </span>
        <strong class="leader-main">${escapeHtml(p.initials)} · ${Math.round(p.rankingScore)} pts</strong>
        <small class="leader-stats">${p.avgSurvivedSeconds.toFixed(1)}s medio · ${p.avgKills.toFixed(1)} bajas/part. · ${Math.round(p.survivalRatePercent)}% superv.</small>
      </span>
      <span class="leader-crown" aria-hidden="true">♛</span>
    </button>
  `;
}

function buildRankingRowHtml(entry, sortMetric) {
  const p = entry.profile;
  const rColor = medalColor(entry.rank);
  const favDef = p.favoriteAvatar ? PLAYER_AVATAR_MAP[p.favoriteAvatar] : null;
  const favLabel = favDef ? favDef.shortLabel : 'Clásico';
  const favColor = favDef ? favDef.auraColor : RELICARIO_PALETTE.oldBone;
  const stressCol = stressTierFromIndex(p.avgStress).color;

  return `
    <button
      type="button"
      class="rank-row-btn"
      data-initials="${escapeHtml(p.initials)}"
      style="${entry.rank === 1 ? `border-color:${RELICARIO_PALETTE.liturgicalGold}8C;` : ''}"
    >
      <div class="rank-row-top">
        <span class="rank-badge" style="color:${rColor}; background:${rColor}29;">#${entry.rank}</span>
        ${p.favoriteAvatar
          ? renderAvatarSVG(p.favoriteAvatar, 34, true)
          : `<span class="monogram-sm">${escapeHtml(p.initials.slice(0, 2))}</span>`}
        <div class="rank-identity">
          <div class="rank-name-line">
            <strong class="rank-initials">${escapeHtml(p.initials)}</strong>
            <span class="mode-badge-xs" style="color:${favColor}; background:${favColor}29;">${escapeHtml(favLabel)}</span>
          </div>
          <span class="rank-runs-line">${p.runCount} ${p.runCount === 1 ? 'partida' : 'partidas'} · ${p.survivedCount} ${p.survivedCount === 1 ? 'superv.' : 'supervs.'}</span>
        </div>
        <div class="rank-pts-block">
          <strong class="rank-pts-num">${Math.round(p.rankingScore)}</strong>
          <span class="rank-pts-label">PTS</span>
        </div>
        <span class="chevron-right">›</span>
      </div>

      <div class="rank-averages-grid">
        ${avgCellHtml('T. MEDIO', `${p.avgSurvivedSeconds.toFixed(1)}s`, RELICARIO_PALETTE.ivory, sortMetric === 'avgTime')}
        ${avgCellHtml('BAJAS MED.', `${p.avgKills.toFixed(1)}`, RELICARIO_PALETTE.coldSilver, sortMetric === 'avgKills')}
        ${avgCellHtml('SUPERV.', `${Math.round(p.survivalRatePercent)}%`, RELICARIO_PALETTE.graceJade, sortMetric === 'survivalRate')}
        ${avgCellHtml('ESTRÉS MED.', `${Math.round(p.avgStress)}%`, stressCol, sortMetric === 'avgStress')}
      </div>
    </button>
  `;
}

function avgCellHtml(label, value, color, highlighted) {
  return `
    <span class="avg-cell ${highlighted ? 'is-highlighted' : ''}" style="${highlighted ? `background:${color}22; border-color:${color}80;` : ''}">
      <span class="avg-cell-lbl">${label}</span>
      <span class="avg-cell-val" style="color:${color};">${escapeHtml(value)}</span>
    </span>
  `;
}

function kpiCardHtml(title, value, subtitle, color) {
  return `
    <div class="kpi-card">
      <span class="kpi-card-title">${title}</span>
      <strong class="kpi-card-value" style="color:${color};">${escapeHtml(value)}</strong>
      <span class="kpi-card-sub">${escapeHtml(subtitle)}</span>
    </div>
  `;
}

function modeRow(label, v85, v26, vHyb) {
  return `
    <div class="cmp-row" role="row">
      <span class="cmp-label">${escapeHtml(label)}</span>
      <span class="cmp-num" style="color:${RELICARIO_PALETTE.oldBone};">${escapeHtml(v85)}</span>
      <span class="cmp-num" style="color:${RELICARIO_PALETTE.ivory};">${escapeHtml(v26)}</span>
      <span class="cmp-num" style="color:${RELICARIO_PALETTE.liturgicalGold};">${escapeHtml(vHyb)}</span>
    </div>
  `;
}

function buildPlayerRunCardHtml(rec) {
  const modeDef = GAME_MODE_MAP[rec.mode] || GAME_MODE_MAP.director2026;
  const statusCol = rec.didSurvive ? RELICARIO_PALETTE.graceJade : RELICARIO_PALETTE.vermilion;
  const stressCol = stressTierFromIndex(rec.averageStress).color;

  return `
    <div class="player-run-card">
      <div class="player-run-top">
        <div class="player-run-badges">
          ${rec.avatar ? renderAvatarSVG(rec.avatar, 22, false) : ''}
          <span class="mode-badge-sm" style="color:${modeDef.accentColor}; background:${modeDef.accentColor}26;">${escapeHtml(modeDef.shortBadge)}</span>
          <span class="run-status-tag" style="color:${statusCol};">${rec.didSurvive ? 'COMPLETADA' : 'CAÍDA'}</span>
        </div>
        <span class="run-date-label">${escapeHtml(formatSpanishDate(rec.playedAt))}</span>
      </div>
      <div class="player-run-stats">
        <strong style="color:${statusCol};">${rec.survivedSeconds.toFixed(1)}s</strong>
        <span style="color:${RELICARIO_PALETTE.coldSilver};">${rec.kills} bajas</span>
        <span style="color:${stressCol};">Estrés ${Math.round(rec.averageStress)}% (pico ${Math.round(rec.peakStress)}%)</span>
        ${rec.medkitsCollected > 0 ? `<strong class="medkit-tag">+${rec.medkitsCollected}C</strong>` : ''}
      </div>
    </div>
  `;
}

function fmtPct(m, val) {
  return m.runCount > 0 ? `${Math.round(val)}%` : '—';
}
function fmtSec(m, val) {
  return m.runCount > 0 ? `${val.toFixed(1)}s` : '—';
}
function fmtNum(m, val) {
  return m.runCount > 0 ? `${val.toFixed(1)}` : '—';
}
