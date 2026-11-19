// Pestaña de Ránking y Perfiles de Jugador — Vista limpia, visual e intuitiva

import {
  PLAYER_AVATAR_MAP,
  RELICARIO_PALETTE
} from '../engine/constants.js';
import { renderAvatarSVG } from '../scene/avatarSVGs.js';
import {
  bindAppNavEvents,
  escapeHtml,
  formatSimpleTime,
  formatSpanishDate,
  medalColor,
  renderAppNavHtml
} from './domUtils.js';

const SIMPLE_SORT_OPTIONS = [
  { id: 'overallRanking', title: 'Puntos' },
  { id: 'avgTime', title: 'Tiempo' },
  { id: 'avgKills', title: 'Kills' },
  { id: 'alphabetical', title: 'A–Z' }
];

export function mountPlayersView(
  root,
  { store, liveSync = null, initialPlayerInitials = null, onReturnToStart, onUsePlayerSetup, onNavigate }
) {
  let sortMetric = 'overallRanking';
  let searchText = '';
  let activeProfileInitials = initialPlayerInitials;

  const navigateTab = (tab) => {
    if (tab === 'players' && activeProfileInitials) {
      activeProfileInitials = null;
      render();
      return;
    }
    if (onNavigate) {
      onNavigate(tab);
      return;
    }
    if (tab === 'start') onReturnToStart?.();
  };

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
    const profiles = store.playerProfiles({ modeFilter: null, sortBy: sortMetric });
    const rankedEntries = profiles.map((profile, idx) => ({ rank: idx + 1, profile }));
    const query = searchText.trim().toUpperCase();
    const filtered = query ? rankedEntries.filter((e) => e.profile.initials.includes(query)) : rankedEntries;
    const top3 = !query ? profiles.slice(0, 3) : [];
    const roomCode = liveSync?.roomCode || 'CLASE';

    root.innerHTML = `
      <div class="app-page players-layout">
        ${renderAppNavHtml({
          activeTab: 'players',
          playerCount: store.uniquePlayerCount,
          runCount: store.records.length,
          roomCode
        })}

        <main class="screen-shell players-scroll">
          <header class="stats-head">
            <div>
              <h1 class="telemetry-title">Ránking de jugadores</h1>
              <p class="panel-subcopy">${store.uniquePlayerCount} ${store.uniquePlayerCount === 1 ? 'jugador registrado' : 'jugadores registrados'}</p>
            </div>
          </header>

          ${top3.length > 0 ? `
            <section class="podium-grid" aria-label="Podio Top 3">
              ${top3.map((prof, idx) => buildMiniPodiumCardHtml(prof, idx + 1)).join('')}
            </section>
          ` : ''}

          <section class="filter-block" aria-label="Búsqueda y orden">
            <div class="search-field-wrap">
              <span class="search-icon" aria-hidden="true">⌕</span>
              <input
                id="input-player-search"
                class="search-input"
                type="search"
                maxlength="18"
                placeholder="Buscar jugador..."
                value="${escapeHtml(searchText)}"
                aria-label="Buscar jugador por nombre"
              />
              ${searchText ? `<button type="button" id="btn-clear-search" class="btn-clear-input" aria-label="Limpiar búsqueda">✕</button>` : ''}
            </div>

            <div class="sort-pills-row" role="group" aria-label="Ordenar por">
              <span class="sort-pills-label">Ordenar:</span>
              <div class="chips-scroll">
                ${SIMPLE_SORT_OPTIONS.map((m) => {
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
            </div>
          </section>

          ${rankedEntries.length === 0
            ? `<section class="panel empty-panel">
                <h2>Aún no hay jugadores</h2>
                <p class="panel-subcopy">En cuanto se juegue la primera partida, aquí aparecerá el ránking.</p>
              </section>`
            : filtered.length === 0
              ? `<section class="panel empty-panel">
                  <h2>No se encontró "${escapeHtml(query)}"</h2>
                  <button type="button" id="btn-empty-clear-search" class="btn-link-cyan">Ver todos</button>
                </section>`
              : `<section class="rank-list" aria-label="Clasificación de jugadores">
                  ${filtered.map((entry) => buildCleanRankingRowHtml(entry)).join('')}
                </section>`
          }
        </main>
      </div>
    `;

    bindAppNavEvents(root, navigateTab);

    const searchInput = root.querySelector('#input-player-search');
    searchInput?.addEventListener('input', (e) => {
      const caret = e.target.selectionStart;
      searchText = String(e.target.value || '').toUpperCase().replace(/[<>&"']/g, '').slice(0, 18);
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

    root.querySelectorAll('.sort-metric-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        sortMetric = btn.dataset.sort;
        render();
      });
    });

    root.querySelectorAll('[data-player-initials]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeProfileInitials = btn.dataset.playerInitials;
        render();
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
    });
  };

  const renderProfileView = (profile) => {
    const globalRank = store.globalRank(profile.initials);
    const displayAvatarId = profile.favoriteAvatar || profile.latestAvatar;
    const avatarDef = displayAvatarId ? PLAYER_AVATAR_MAP[displayAvatarId] : null;
    const accent = avatarDef?.auraColor || RELICARIO_PALETTE.liturgicalGold;
    const roomCode = liveSync?.roomCode || 'CLASE';

    root.innerHTML = `
      <div class="app-page players-layout">
        ${renderAppNavHtml({
          activeTab: 'players',
          playerCount: store.uniquePlayerCount,
          runCount: store.records.length,
          roomCode
        })}

        <main class="screen-shell players-scroll">
          <div class="profile-back-bar">
            <button type="button" id="btn-back-to-ranking" class="btn-nav-back">‹ Volver al ránking</button>
            ${globalRank
              ? `<span class="pill-badge-rank" style="color:${medalColor(globalRank)}; background:${medalColor(globalRank)}26;">Puesto #${globalRank}</span>`
              : ''}
          </div>

          <section class="panel" style="border-color:${accent}80;" aria-label="Ficha del jugador">
            <div class="profile-hero-row">
              ${displayAvatarId
                ? renderAvatarSVG(displayAvatarId, 56, true)
                : `<span class="monogram-lg">${escapeHtml(profile.initials.slice(0, 2))}</span>`}
              <div class="profile-hero-info">
                <div class="profile-name-line">
                  <strong class="profile-initials">${escapeHtml(profile.initials)}</strong>
                  ${avatarDef
                    ? `<span class="mode-badge" style="color:${accent}; background:${accent}29;">${escapeHtml(avatarDef.displayName)}</span>`
                    : ''}
                </div>
                <p class="panel-subcopy">
                  ${profile.runCount} ${profile.runCount === 1 ? 'partida jugada' : 'partidas jugadas'} ·
                  ${profile.survivedCount} ${profile.survivedCount === 1 ? 'victoria' : 'victorias'}
                </p>
              </div>
            </div>

            <div class="simple-stats-grid">
              <div class="simple-stat-card">
                <span class="simple-stat-val" style="color:${RELICARIO_PALETTE.liturgicalGold};">${Math.round(profile.rankingScore)}</span>
                <span class="simple-stat-lbl">Puntos</span>
              </div>
              <div class="simple-stat-card">
                <span class="simple-stat-val" style="color:${RELICARIO_PALETTE.ivory};">${formatSimpleTime(profile.bestSurvivedSeconds)}</span>
                <span class="simple-stat-lbl">Mejor tiempo</span>
              </div>
              <div class="simple-stat-card">
                <span class="simple-stat-val" style="color:${RELICARIO_PALETTE.coldSilver};">${profile.bestKills}</span>
                <span class="simple-stat-lbl">Récord kills</span>
              </div>
              <div class="simple-stat-card">
                <span class="simple-stat-val" style="color:${RELICARIO_PALETTE.graceJade};">${formatSimpleTime(profile.avgSurvivedSeconds)}</span>
                <span class="simple-stat-lbl">Tiempo medio</span>
              </div>
            </div>

            <button type="button" id="btn-play-as-player" class="btn-play-as">
              ▶ Jugar como ${escapeHtml(profile.initials)}
            </button>
          </section>

          <section class="panel-group" aria-label="Partidas del jugador">
            <h2 class="panel-label">Partidas de ${escapeHtml(profile.initials)} (${profile.runs.length})</h2>
            <div class="history-list">
              ${profile.runs.map((rec) => buildPlayerRunRowHtml(rec)).join('')}
            </div>
          </section>
        </main>
      </div>
    `;

    bindAppNavEvents(root, navigateTab);

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

function buildMiniPodiumCardHtml(prof, rank) {
  const color = medalColor(rank);
  const avatarId = prof.favoriteAvatar || prof.latestAvatar || 'penitente';
  const crown = rank === 1 ? '♛ #1' : rank === 2 ? '★ #2' : '◆ #3';

  return `
    <button
      type="button"
      class="podium-card podium-rank-${rank}"
      data-player-initials="${escapeHtml(prof.initials)}"
      style="border-color:${color}88;"
    >
      <span class="podium-medal-tag" style="color:${color}; background:${color}24;">${crown}</span>
      ${renderAvatarSVG(avatarId, rank === 1 ? 46 : 40, true)}
      <strong class="podium-initials">${escapeHtml(prof.initials)}</strong>
      <span class="podium-pts" style="color:${color};">${Math.round(prof.rankingScore)} pts</span>
      <span class="podium-meta">Mejor: ${formatSimpleTime(prof.bestSurvivedSeconds)}</span>
    </button>
  `;
}

function buildCleanRankingRowHtml(entry) {
  const p = entry.profile;
  const rColor = medalColor(entry.rank);
  const avatarId = p.favoriteAvatar || p.latestAvatar;

  return `
    <button
      type="button"
      class="rank-row-btn rank-row-btn--clean"
      data-player-initials="${escapeHtml(p.initials)}"
      style="${entry.rank === 1 ? `border-color:${RELICARIO_PALETTE.liturgicalGold}8C;` : ''}"
    >
      <div class="rank-row-top">
        <span class="rank-badge" style="color:${rColor}; background:${rColor}29;">#${entry.rank}</span>
        ${avatarId
          ? renderAvatarSVG(avatarId, 34, true)
          : `<span class="monogram-sm">${escapeHtml(p.initials.slice(0, 2))}</span>`}
        <div class="rank-identity">
          <strong class="rank-initials">${escapeHtml(p.initials)}</strong>
          <span class="rank-runs-line">
            Mejor: <strong>${formatSimpleTime(p.bestSurvivedSeconds)}</strong> ·
            Media: ${Math.round(p.avgKills)} kills ·
            ${p.runCount} ${p.runCount === 1 ? 'partida' : 'partidas'}
          </span>
        </div>
        <div class="rank-pts-block">
          <strong class="rank-pts-num">${Math.round(p.rankingScore)}</strong>
          <span class="rank-pts-label">PTS</span>
        </div>
        <span class="chevron-right">›</span>
      </div>
    </button>
  `;
}

function buildPlayerRunRowHtml(rec) {
  const statusCol = rec.didSurvive ? RELICARIO_PALETTE.graceJade : RELICARIO_PALETTE.ivory;

  return `
    <div class="history-row-btn" style="cursor:default;">
      <span class="hist-left">
        ${rec.avatar ? renderAvatarSVG(rec.avatar, 22, false) : ''}
        <strong class="hist-sec" style="color:${statusCol};">${formatSimpleTime(rec.survivedSeconds)}</strong>
        ${rec.didSurvive ? `<span class="mode-badge-sm" style="color:${RELICARIO_PALETTE.graceJade}; background:${RELICARIO_PALETTE.graceJade}22;">★ Victoria</span>` : ''}
      </span>
      <span class="hist-right">
        <span class="hist-kills">${rec.kills} kills</span>
        <span class="run-date-label">${escapeHtml(formatSpanishDate(rec.playedAt))}</span>
      </span>
    </div>
  `;
}
