// Pestaña de Sala en Vivo / Modo Proyector — Limpia, visual e intuitiva

import {
  PLAYER_AVATARS,
  PLAYER_AVATAR_MAP,
  RELICARIO_PALETTE,
  TOTAL_RUN_DURATION
} from '../engine/constants.js';
import { renderQrCodeSvg } from '../engine/qrCodeSvg.js';
import { normalizeRoomCode } from '../engine/liveSync.js';
import { renderAvatarSVG } from '../scene/avatarSVGs.js';
import {
  bindAppNavEvents,
  escapeHtml,
  formatSimpleTime,
  medalColor,
  renderAppNavHtml
} from './domUtils.js';

const DEMO_INITIALS_POOL = [
  'VÍCTOR',
  'LUCÍA',
  'ALEJANDRO',
  'SOFÍA',
  'MATEO',
  'VALERIA',
  'DANIEL',
  'PAULA',
  'HUGO',
  'CLARA',
  'ADRIÁN',
  'ELENA'
];

export function mountDashboardView(root, { store, liveSync, audio, onReturnToStart, onOpenPlayerProfile, onNavigate }) {
  let qrModalOpen = false;
  let roomEditorOpen = false;
  let confirmResetOpen = false;
  let copyFeedback = '';
  let syncFeedback = '';
  let activeToast = null;
  let toastTimeout = null;

  const navigateTab = (tab) => {
    if (onNavigate) {
      onNavigate(tab);
      return;
    }
    if (tab === 'start') onReturnToStart?.();
  };

  const triggerToast = (rec) => {
    activeToast = {
      initials: rec.initials,
      avatar: rec.avatar || 'penitente',
      didSurvive: rec.didSurvive,
      survivedSeconds: rec.survivedSeconds,
      kills: rec.kills
    };
    if (audio) {
      try {
        audio.unlock();
        if (rec.didSurvive) audio.playVictory();
        else audio.playPickup();
      } catch {
        // Ignorar si el navegador bloquea audio
      }
    }
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      activeToast = null;
      render();
    }, 5000);
    render();
  };

  const unsubSync = liveSync.subscribe(() => {
    render();
  });

  const unsubToast = liveSync.onRealtimeRun((rec) => {
    triggerToast(rec);
  });

  const liveTickerTimer = setInterval(() => {
    const st = liveSync.getState();
    if (st.activePlayers.length > 0) {
      updateActiveArenaBars(st.activePlayers);
    }
  }, 1000);

  function updateActiveArenaBars(activePlayers) {
    const now = Date.now();
    activePlayers.forEach((p) => {
      const elapsed = Math.min(TOTAL_RUN_DURATION, Math.max(0, (now - p.startedAt) / 1000));
      const pct = Math.min(100, (elapsed / TOTAL_RUN_DURATION) * 100);
      const rowEl = root.querySelector(`[data-active-client="${CSS.escape(p.clientId)}"]`);
      if (rowEl) {
        const secEl = rowEl.querySelector('.active-arena-sec');
        const fillEl = rowEl.querySelector('.active-arena-bar-fill');
        const killsTag = p.kills > 0 ? `${p.kills} kills · ` : '';
        if (secEl) secEl.textContent = `${killsTag}${formatSimpleTime(elapsed)} / 2:00`;
        if (fillEl) fillEl.style.width = `${pct.toFixed(1)}%`;
      }
    });
  }

  function simulateClassRun() {
    const initials = DEMO_INITIALS_POOL[Math.floor(Math.random() * DEMO_INITIALS_POOL.length)];
    const avatar = PLAYER_AVATARS[Math.floor(Math.random() * PLAYER_AVATARS.length)].id;

    const roll = Math.random();
    let survivedSeconds = 120.0;
    let didSurvive = false;
    let reachedPhase = 1;

    if (roll < 0.25) {
      reachedPhase = 1;
      survivedSeconds = 24 + Math.random() * 15;
    } else if (roll < 0.60) {
      reachedPhase = 2;
      survivedSeconds = 45 + Math.random() * 34;
    } else if (roll < 0.80) {
      reachedPhase = 3;
      survivedSeconds = 84 + Math.random() * 34;
    } else {
      reachedPhase = 3;
      didSurvive = true;
      survivedSeconds = 120.0;
    }

    const kills = Math.round((survivedSeconds / 120) * (36 + Math.random() * 26));
    const averageStress = Math.round(58 + Math.random() * 20);
    const peakStress = Math.min(100, averageStress + 15);
    const medkitsCollected = Math.round(1 + (survivedSeconds / 50) * (1 + Math.random()));

    const saved = store.recordRun({
      initials,
      avatar,
      mode: 'unified',
      survivedSeconds: Number(survivedSeconds.toFixed(1)),
      didSurvive,
      kills,
      averageStress,
      peakStress,
      medkitsCollected,
      reachedPhase,
      playedAt: new Date().toISOString()
    });

    liveSync.publishRunFinish(saved);
    triggerToast(saved);
  }

  const render = () => {
    const syncState = liveSync.getState();
    const totalRuns = store.records.length;
    const uniquePlayers = store.uniquePlayerCount;
    const totalSurvived = store.records.filter((r) => r.didSurvive).length;
    const totalKills = store.records.reduce((acc, r) => acc + (r.kills || 0), 0);

    const profiles = store.playerProfiles({ modeFilter: null, sortBy: 'overallRanking' });
    const top3 = profiles.slice(0, 3);
    const recentRuns = store.records.slice(0, 10);

    const qrSvgSmall = renderQrCodeSvg(syncState.publicUrl, {
      sizePx: 190,
      darkColor: '#080606',
      lightColor: '#F5EFE6',
      margin: 3
    });

    const statusBadge =
      syncState.connectionState === 'live'
        ? `<span class="live-status-pill is-online"><span class="pulse-dot"></span>En vivo</span>`
        : syncState.connectionState === 'connecting'
          ? `<span class="live-status-pill is-connecting"><span class="pulse-dot"></span>Conectando...</span>`
          : `<span class="live-status-pill is-local"><span class="pulse-dot"></span>Sala local</span>`;

    root.innerHTML = `
      <div class="app-page">
        ${renderAppNavHtml({
          activeTab: 'dashboard',
          playerCount: uniquePlayers,
          runCount: totalRuns,
          roomCode: syncState.roomCode
        })}

        <div class="dashboard-shell">
          <header class="dashboard-topbar">
            <div class="dash-brand">
              <div class="dash-title-wrap">
                <div class="dash-kicker-row">
                  <span class="dash-kicker">PANTALLA DE SALA EN TIEMPO REAL</span>
                  ${statusBadge}
                </div>
                <h1 class="dash-main-title">Sala ${escapeHtml(syncState.roomCode)}</h1>
              </div>
            </div>

            <div class="dash-controls">
              <div class="room-pill-group">
                <span class="room-pill-label">Código:</span>
                <strong class="room-pill-code">${escapeHtml(syncState.roomCode)}</strong>
                <button type="button" id="btn-toggle-room-edit" class="btn-room-change">Cambiar</button>
              </div>

              <button type="button" id="btn-expand-qr" class="btn-dash-action btn-dash-gold">
                ⛶ Ampliar QR
              </button>
              <button type="button" id="btn-sync-now" class="btn-dash-action btn-dash-cyan" title="Sincronizar jugadores en curso y partidas recientes ahora mismo">
                ${syncFeedback ? escapeHtml(syncFeedback) : '🔄 Sincronizar'}
              </button>
              <button type="button" id="btn-simulate-run" class="btn-dash-action btn-dash-cyan" title="Añade una partida de prueba">
                ⚡ Partida de prueba
              </button>
              ${totalRuns > 0 ? `
                <button type="button" id="btn-open-reset-room" class="btn-dash-action btn-dash-danger">
                  ↺ Limpiar sala
                </button>
              ` : ''}
            </div>
          </header>

          ${roomEditorOpen ? `
            <div class="room-editor-bar">
              <label for="input-room-code" class="micro-mono-gold">Código de la sala:</label>
              <input
                id="input-room-code"
                class="room-code-input"
                type="text"
                maxlength="12"
                value="${escapeHtml(syncState.roomCode)}"
                placeholder="Ej. CLASE, AULA1"
              />
              <button type="button" id="btn-save-room-code" class="btn-room-apply">Aplicar</button>
              <button type="button" id="btn-cancel-room-code" class="btn-room-cancel">Cancelar</button>
            </div>
          ` : ''}

          ${activeToast ? buildRealtimeToastHtml(activeToast) : ''}

          <main class="dashboard-grid">
            <!-- COLUMNA 1: QR + JUGANDO AHORA -->
            <aside class="dash-col dash-col-left">
              <section class="panel dash-qr-panel" aria-label="Código QR para unirse">
                <div class="panel-head">
                  <h2 class="panel-label gold-label">Únete desde tu móvil</h2>
                  <span class="micro-mono-cyan">Sala ${escapeHtml(syncState.roomCode)}</span>
                </div>

                <div class="qr-card-frame" id="qr-clickable-card" title="Toca para ampliar el código QR">
                  <div class="qr-svg-box">
                    ${qrSvgSmall}
                  </div>
                  <div class="qr-instructions">
                    <span class="qr-step-badge">📱 Escanea con tu cámara</span>
                    <p class="qr-url-display">${escapeHtml(syncState.publicUrl.replace(/^https?:\/\//, ''))}</p>
                    <div class="qr-btn-row">
                      <button type="button" id="btn-copy-url" class="btn-qr-mini">
                        ${copyFeedback ? escapeHtml(copyFeedback) : 'Copiar enlace'}
                      </button>
                      <button type="button" id="btn-qr-fullscreen-inline" class="btn-qr-mini btn-qr-mini-gold">
                        ⛶ Grande
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section class="panel dash-arena-live-panel" aria-label="Jugando ahora">
                <div class="panel-head">
                  <h2 class="panel-label">🔥 Jugando ahora (${syncState.activePlayers.length})</h2>
                </div>

                ${syncState.activePlayers.length === 0
                  ? `<div class="dash-empty-Arena">
                      <p>Nadie en partida en este instante.</p>
                      <small>Cuando alguien pulse "Jugar", saldrá aquí en directo.</small>
                    </div>`
                  : `<div class="active-arena-list">
                      ${syncState.activePlayers.map((p) => buildActiveArenaRowHtml(p)).join('')}
                    </div>`
                }
              </section>
            </aside>

            <!-- COLUMNA 2: PODIO Y RÁNKING EN DIRECTO -->
            <section class="dash-col dash-col-center" aria-label="Podio y clasificación">
              <section class="panel dash-podium-panel" aria-label="Podio Top 3">
                <div class="panel-head">
                  <h2 class="panel-label gold-label">♛ Podio de la sala</h2>
                </div>

                ${top3.length === 0
                  ? `<div class="podium-empty">
                      <p>Aquí aparecerán los 3 mejores jugadores de la sala.</p>
                    </div>`
                  : `<div class="podium-grid">
                      ${top3.map((prof, idx) => buildPodiumCardHtml(prof, idx + 1)).join('')}
                    </div>`
                }
              </section>

              <section class="panel dash-ranking-panel" aria-label="Clasificación general">
                <div class="panel-head">
                  <h2 class="panel-label">Clasificación (${profiles.length})</h2>
                </div>

                ${profiles.length === 0
                  ? `<p class="empty-copy">Esperando la primera partida...</p>`
                  : `<div class="dash-rank-table">
                      ${profiles.map((prof, idx) => buildDashboardRankRowHtml(prof, idx + 1)).join('')}
                    </div>`
                }
              </section>
            </section>

            <!-- COLUMNA 3: RESUMEN DE SALA + ÚLTIMAS PARTIDAS -->
            <aside class="dash-col dash-col-right" aria-label="Actividad de la sala">
              <div class="simple-stats-grid">
                <div class="simple-stat-card">
                  <span class="simple-stat-val" style="color:${RELICARIO_PALETTE.liturgicalGold};">${uniquePlayers}</span>
                  <span class="simple-stat-lbl">Jugadores</span>
                </div>
                <div class="simple-stat-card">
                  <span class="simple-stat-val" style="color:${RELICARIO_PALETTE.ivory};">${totalRuns}</span>
                  <span class="simple-stat-lbl">Partidas</span>
                </div>
                <div class="simple-stat-card">
                  <span class="simple-stat-val" style="color:${RELICARIO_PALETTE.graceJade};">${totalSurvived}</span>
                  <span class="simple-stat-lbl">Victorias (2:00)</span>
                </div>
                <div class="simple-stat-card">
                  <span class="simple-stat-val" style="color:${RELICARIO_PALETTE.coldSilver};">${totalKills}</span>
                  <span class="simple-stat-lbl">Kills totales</span>
                </div>
              </div>

              <section class="panel dash-feed-panel" aria-label="Últimas partidas en directo">
                <div class="panel-head">
                  <h2 class="panel-label">⚡ Últimas partidas</h2>
                </div>

                ${recentRuns.length === 0
                  ? `<p class="empty-copy">Todavía no hay partidas terminadas.</p>`
                  : `<div class="live-feed-list">
                      ${recentRuns.map((rec) => buildLiveFeedItemHtml(rec)).join('')}
                    </div>`
                }

                ${buildPopularAvatarsStrip(store.records)}
              </section>
            </aside>
          </main>

          ${qrModalOpen ? `
            <div id="qr-fullscreen-modal" class="pause-modal qr-giant-modal" role="dialog" aria-modal="true" aria-labelledby="qr-modal-title">
              <div class="qr-giant-card">
                <div class="qr-giant-top">
                  <span class="dash-kicker">SALA ${escapeHtml(syncState.roomCode)}</span>
                  <h2 id="qr-modal-title" class="qr-giant-title">Escanea para jugar</h2>
                  <p class="panel-subcopy">Apunta con la cámara de tu móvil para entrar directamente a la sala</p>
                </div>
                <div class="qr-giant-svg-wrap">
                  ${renderQrCodeSvg(syncState.publicUrl, { sizePx: 340, darkColor: '#080606', lightColor: '#F5EFE6', margin: 3 })}
                </div>
                <p class="qr-giant-url">${escapeHtml(syncState.publicUrl)}</p>
                <button type="button" id="btn-close-qr-modal" class="btn-primary-cta" style="background:${RELICARIO_PALETTE.liturgicalGold}; color:#080606; max-width:280px;">
                  Cerrar
                </button>
              </div>
            </div>
          ` : ''}

          ${confirmResetOpen ? `
            <div id="dash-reset-modal" class="pause-modal" role="dialog" aria-modal="true">
              <div class="pause-card">
                <h2 class="pause-title">¿Limpiar sala ${escapeHtml(syncState.roomCode)}?</h2>
                <p class="panel-subcopy">Se pondrá el marcador de la sala a cero.</p>
                <button type="button" id="btn-confirm-room-reset" class="btn-abort">Sí, limpiar marcador</button>
                <button type="button" id="btn-cancel-room-reset" class="btn-resume-ghost">Cancelar</button>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    bindEvents(syncState);
  };

  function bindEvents(syncState) {
    bindAppNavEvents(root, navigateTab);

    root.querySelector('#btn-expand-qr')?.addEventListener('click', () => {
      qrModalOpen = true;
      render();
    });
    root.querySelector('#btn-qr-fullscreen-inline')?.addEventListener('click', (e) => {
      e.stopPropagation();
      qrModalOpen = true;
      render();
    });
    root.querySelector('#qr-clickable-card')?.addEventListener('click', (e) => {
      if (e.target.closest('#btn-copy-url')) return;
      qrModalOpen = true;
      render();
    });
    root.querySelector('#btn-close-qr-modal')?.addEventListener('click', () => {
      qrModalOpen = false;
      render();
    });
    root.querySelector('#qr-fullscreen-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'qr-fullscreen-modal') {
        qrModalOpen = false;
        render();
      }
    });

    root.querySelector('#btn-copy-url')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(syncState.publicUrl);
        copyFeedback = '¡Copiado!';
      } catch {
        copyFeedback = 'Copia la URL';
      }
      render();
      setTimeout(() => {
        copyFeedback = '';
        render();
      }, 2200);
    });

    root.querySelector('#btn-toggle-room-edit')?.addEventListener('click', () => {
      roomEditorOpen = !roomEditorOpen;
      render();
      root.querySelector('#input-room-code')?.focus();
    });

    root.querySelector('#btn-cancel-room-code')?.addEventListener('click', () => {
      roomEditorOpen = false;
      render();
    });

    const applyRoomChange = () => {
      const val = root.querySelector('#input-room-code')?.value || 'CLASE';
      const nextRoom = normalizeRoomCode(val);
      roomEditorOpen = false;
      liveSync.setRoom(nextRoom);
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.set('room', nextRoom);
        url.searchParams.set('dashboard', '1');
        window.history.replaceState({}, '', url.toString());
      }
      render();
    };

    root.querySelector('#btn-save-room-code')?.addEventListener('click', applyRoomChange);
    root.querySelector('#input-room-code')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') applyRoomChange();
    });

    root.querySelector('#btn-sync-now')?.addEventListener('click', async () => {
      syncFeedback = '⟳ Sincronizando...';
      render();
      await liveSync.forceSyncNow();
      syncFeedback = '✓ Sincronizado';
      render();
      setTimeout(() => {
        syncFeedback = '';
        render();
      }, 2200);
    });

    root.querySelector('#btn-simulate-run')?.addEventListener('click', () => {
      simulateClassRun();
    });

    root.querySelector('#btn-open-reset-room')?.addEventListener('click', () => {
      confirmResetOpen = true;
      render();
    });
    root.querySelector('#btn-cancel-room-reset')?.addEventListener('click', () => {
      confirmResetOpen = false;
      render();
    });
    root.querySelector('#btn-confirm-room-reset')?.addEventListener('click', async () => {
      confirmResetOpen = false;
      await liveSync.publishRoomReset();
      render();
    });

    root.querySelectorAll('[data-open-initials]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (onOpenPlayerProfile) {
          onOpenPlayerProfile(btn.dataset.openInitials);
        }
      });
    });
  }

  render();

  return () => {
    unsubSync();
    unsubToast();
    clearInterval(liveTickerTimer);
    if (toastTimeout) clearTimeout(toastTimeout);
  };
}

function buildRealtimeToastHtml(toast) {
  const statusColor = toast.didSurvive ? RELICARIO_PALETTE.graceJade : RELICARIO_PALETTE.liturgicalGold;
  const headline = toast.didSurvive
    ? `¡${escapeHtml(toast.initials)} sobrevivió los 2 minutos!`
    : `${escapeHtml(toast.initials)} aguantó ${formatSimpleTime(toast.survivedSeconds)}`;

  return `
    <div class="dash-live-toast" role="status" aria-live="polite" style="border-color:${statusColor};">
      <span class="toast-bolt">⚡</span>
      ${renderAvatarSVG(toast.avatar, 32, true)}
      <div class="toast-copy">
        <strong>${headline}</strong>
        <span>${toast.kills} kills conseguidas</span>
      </div>
    </div>
  `;
}

function buildActiveArenaRowHtml(p) {
  const elapsed = Math.min(TOTAL_RUN_DURATION, Math.max(0, (Date.now() - p.startedAt) / 1000));
  const pct = Math.min(100, (elapsed / TOTAL_RUN_DURATION) * 100);
  const killsTag = p.kills > 0 ? `${p.kills} kills · ` : '';

  return `
    <div class="active-arena-row" data-active-client="${escapeHtml(p.clientId)}">
      <div class="active-arena-top">
        <span class="active-arena-left">
          ${renderAvatarSVG(p.avatar, 24, true)}
          <strong>${escapeHtml(p.initials)}</strong>
        </span>
        <span class="active-arena-sec">${killsTag}${formatSimpleTime(elapsed)} / 2:00</span>
      </div>
      <div class="active-arena-bar-track">
        <div class="active-arena-bar-fill" style="width:${pct.toFixed(1)}%; background:${RELICARIO_PALETTE.graceJade};"></div>
      </div>
    </div>
  `;
}

function buildLiveFeedItemHtml(rec) {
  const statusCol = rec.didSurvive ? RELICARIO_PALETTE.graceJade : RELICARIO_PALETTE.ivory;

  return `
    <button type="button" class="live-feed-item" data-open-initials="${escapeHtml(rec.initials)}">
      <span class="live-feed-left">
        ${rec.avatar ? renderAvatarSVG(rec.avatar, 24, false) : ''}
        <strong class="live-feed-init">${escapeHtml(rec.initials)}</strong>
        ${rec.didSurvive ? `<span class="mode-badge-xs" style="color:${RELICARIO_PALETTE.graceJade}; background:${RELICARIO_PALETTE.graceJade}22;">★ Victoria</span>` : ''}
      </span>
      <span class="live-feed-right">
        <strong style="color:${statusCol};">${formatSimpleTime(rec.survivedSeconds)}</strong>
        <span>${rec.kills} kills</span>
      </span>
    </button>
  `;
}

function buildPodiumCardHtml(prof, rank) {
  const color = medalColor(rank);
  const avatarId = prof.favoriteAvatar || prof.latestAvatar || 'penitente';
  const crown = rank === 1 ? '♛ #1 ORO' : rank === 2 ? '★ #2 PLATA' : '◆ #3 BRONCE';

  return `
    <button
      type="button"
      class="podium-card podium-rank-${rank}"
      data-open-initials="${escapeHtml(prof.initials)}"
      style="border-color:${color}88;"
    >
      <span class="podium-medal-tag" style="color:${color}; background:${color}24;">${crown}</span>
      <div class="podium-avatar-wrap">
        ${renderAvatarSVG(avatarId, rank === 1 ? 52 : 44, true)}
      </div>
      <strong class="podium-initials">${escapeHtml(prof.initials)}</strong>
      <span class="podium-pts" style="color:${color};">${Math.round(prof.rankingScore)} pts</span>
      <span class="podium-meta">
        Mejor: ${formatSimpleTime(prof.bestSurvivedSeconds)} · ${Math.round(prof.avgKills)} kills
      </span>
    </button>
  `;
}

function buildDashboardRankRowHtml(prof, rank) {
  const rColor = medalColor(rank);
  const avatarId = prof.favoriteAvatar || prof.latestAvatar || 'penitente';

  return `
    <button type="button" class="dash-rank-row dash-rank-row--clean" data-open-initials="${escapeHtml(prof.initials)}">
      <span class="dash-rank-pos" style="color:${rColor}; background:${rColor}22;">#${rank}</span>
      ${renderAvatarSVG(avatarId, 28, rank <= 3)}
      <span class="dash-rank-ident">
        <strong>${escapeHtml(prof.initials)}</strong>
        <small>${prof.runCount} ${prof.runCount === 1 ? 'partida' : 'partidas'}</small>
      </span>
      <span class="dash-rank-stat">Mejor: ${formatSimpleTime(prof.bestSurvivedSeconds)}</span>
      <span class="dash-rank-stat">${Math.round(prof.avgKills)} kills</span>
      <strong class="dash-rank-pts" style="color:${RELICARIO_PALETTE.liturgicalGold};">${Math.round(prof.rankingScore)} pts</strong>
    </button>
  `;
}

function buildPopularAvatarsStrip(records) {
  if (!records || records.length === 0) return '';
  const counts = new Map();
  for (const r of records) {
    if (!r.avatar) continue;
    counts.set(r.avatar, (counts.get(r.avatar) || 0) + 1);
  }
  const topAvatars = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  if (topAvatars.length === 0) return '';

  return `
    <div class="popular-avatars-block">
      <span class="micro-mono-muted">AVATARES MÁS ELEGIDOS</span>
      <div class="popular-avatars-row">
        ${topAvatars
          .map(([id, cnt]) => {
            const av = PLAYER_AVATAR_MAP[id];
            if (!av) return '';
            return `
              <span class="pop-av-chip">
                ${renderAvatarSVG(id, 18, false)}
                <span>${escapeHtml(av.shortLabel)}</span>
                <strong style="color:${av.auraColor};">×${cnt}</strong>
              </span>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}
