// Dashboard de Proyector en Tiempo Real para la Clase (16:9 Panorámico + QR + Podio + Comparativa 1985 vs 2026 vs Híbrido + Feed en Vivo)

import {
  GAME_MODES,
  GAME_MODE_MAP,
  LEADERBOARD_SORT_METRICS,
  PLAYER_AVATARS,
  PLAYER_AVATAR_MAP,
  RELICARIO_PALETTE,
  stressTierFromIndex
} from '../engine/constants.js';
import { renderQrCodeSvg } from '../engine/qrCodeSvg.js';
import { normalizeRoomCode } from '../engine/liveSync.js';
import { renderAvatarSVG } from '../scene/avatarSVGs.js';
import { escapeHtml, medalColor } from './domUtils.js';

const DEMO_INITIALS_POOL = ['VLF', 'MAR', 'ALE', 'LUC', 'CAR', 'SOF', 'DAN', 'PAU', 'JAV', 'ELN', 'HUG', 'CLA'];

export function mountDashboardView(root, { store, liveSync, audio, onReturnToStart, onOpenPlayerProfile }) {
  let sortMetric = 'overallRanking';
  let modeFilter = null;
  let qrModalOpen = false;
  let roomEditorOpen = false;
  let confirmResetOpen = false;
  let copyFeedback = '';
  let activeToast = null;
  let toastTimeout = null;

  const triggerToast = (rec) => {
    const modeDef = GAME_MODE_MAP[rec.mode] || GAME_MODE_MAP.director2026;
    activeToast = {
      initials: rec.initials,
      avatar: rec.avatar || 'penitente',
      modeTitle: modeDef.shortBadge,
      modeColor: modeDef.accentColor,
      didSurvive: rec.didSurvive,
      survivedSeconds: rec.survivedSeconds,
      kills: rec.kills,
      averageStress: rec.averageStress
    };
    if (audio) {
      try {
        audio.unlock();
        if (rec.didSurvive) audio.playVictory();
        else audio.playPickup();
      } catch {
        // Ignorar si el navegador bloquea audio sin gesto previo
      }
    }
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      activeToast = null;
      render();
    }, 5500);
    render();
  };

  const unsubSync = liveSync.subscribe(() => {
    render();
  });

  const unsubToast = liveSync.onRealtimeRun((rec) => {
    triggerToast(rec);
  });

  // Reloj para actualizar el progreso en vivo de los que están jugando ahora mismo
  const liveTickerTimer = setInterval(() => {
    const st = liveSync.getState();
    if (st.activePlayers.length > 0) {
      updateActiveArenaBars(st.activePlayers);
    }
  }, 1000);

  function updateActiveArenaBars(activePlayers) {
    const now = Date.now();
    activePlayers.forEach((p) => {
      const elapsed = Math.min(60, Math.max(0, (now - p.startedAt) / 1000));
      const pct = Math.min(100, (elapsed / 60) * 100);
      const rowEl = root.querySelector(`[data-active-client="${CSS.escape(p.clientId)}"]`);
      if (rowEl) {
        const secEl = rowEl.querySelector('.active-arena-sec');
        const fillEl = rowEl.querySelector('.active-arena-bar-fill');
        if (secEl) secEl.textContent = `${elapsed.toFixed(0)}s / 60s`;
        if (fillEl) fillEl.style.width = `${pct.toFixed(1)}%`;
      }
    });
  }

  function simulateClassRun() {
    const initials = DEMO_INITIALS_POOL[Math.floor(Math.random() * DEMO_INITIALS_POOL.length)];
    const avatar = PLAYER_AVATARS[Math.floor(Math.random() * PLAYER_AVATARS.length)].id;
    const modes = ['classic1985', 'director2026', 'hybrid1985x2026'];
    const mode = modes[Math.floor(Math.random() * modes.length)];

    let didSurvive = false;
    let survivedSeconds = 30;
    let kills = 20;
    let averageStress = 65;
    let peakStress = 85;
    let medkitsCollected = 1;

    if (mode === 'director2026') {
      didSurvive = Math.random() < 0.68;
      survivedSeconds = didSurvive ? 60 : 41 + Math.random() * 17;
      kills = Math.round(28 + Math.random() * 20);
      averageStress = Math.round(61 + Math.random() * 13); // Zona de flujo 60-75%
      peakStress = Math.min(98, averageStress + Math.round(14 + Math.random() * 14));
      medkitsCollected = Math.round(2 + Math.random() * 2);
    } else if (mode === 'classic1985') {
      didSurvive = Math.random() < 0.25;
      survivedSeconds = didSurvive ? 60 : 22 + Math.random() * 28;
      kills = Math.round(16 + Math.random() * 18);
      averageStress = Math.round(74 + Math.random() * 18);
      peakStress = Math.min(100, averageStress + Math.round(12 + Math.random() * 14));
      medkitsCollected = Math.round(Math.random() * 2);
    } else {
      didSurvive = Math.random() < 0.42;
      survivedSeconds = didSurvive ? 60 : 31 + Math.random() * 24;
      kills = Math.round(24 + Math.random() * 22);
      averageStress = Math.round(69 + Math.random() * 16);
      peakStress = Math.min(100, averageStress + Math.round(13 + Math.random() * 14));
      medkitsCollected = Math.round(1 + Math.random() * 2);
    }

    const saved = store.recordRun({
      initials,
      avatar,
      mode,
      survivedSeconds: Number(survivedSeconds.toFixed(1)),
      didSurvive,
      kills,
      averageStress,
      peakStress,
      medkitsCollected,
      playedAt: new Date().toISOString()
    });

    liveSync.publishRunFinish(saved);
    triggerToast(saved);
  }

  const render = () => {
    const syncState = liveSync.getState();
    const stats1985 = store.stats('classic1985');
    const stats2026 = store.stats('director2026');
    const statsHybrid = store.stats('hybrid1985x2026');

    const totalRuns = store.records.length;
    const uniquePlayers = store.uniquePlayerCount;
    const totalSurvived = store.records.filter((r) => r.didSurvive).length;
    const globalSurvivalPct = totalRuns > 0 ? Math.round((totalSurvived / totalRuns) * 100) : 0;
    const totalKills = store.records.reduce((acc, r) => acc + (r.kills || 0), 0);

    const profiles = store.playerProfiles({ modeFilter, sortBy: sortMetric });
    const top3 = profiles.slice(0, 3);
    const recentRuns = store.records.slice(0, 12);

    const qrSvgSmall = renderQrCodeSvg(syncState.publicUrl, {
      sizePx: 196,
      darkColor: '#080606',
      lightColor: '#F5EFE6',
      margin: 3
    });

    const statusBadge =
      syncState.connectionState === 'live'
        ? `<span class="live-status-pill is-online"><span class="pulse-dot"></span>EN VIVO · NUBE ACTIVA</span>`
        : syncState.connectionState === 'connecting'
          ? `<span class="live-status-pill is-connecting"><span class="pulse-dot"></span>CONECTANDO SALA...</span>`
          : `<span class="live-status-pill is-local"><span class="pulse-dot"></span>MODO LOCAL / RED</span>`;

    root.innerHTML = `
      <div class="dashboard-shell">
        <header class="dashboard-topbar">
          <div class="dash-brand">
            <button type="button" id="btn-dash-back" class="btn-dash-back" title="Volver al juego">
              ‹ Juego
            </button>
            <div class="dash-title-wrap">
              <div class="dash-kicker-row">
                <span class="dash-kicker">PANIC DIRECTOR · PROYECTOR DE CLASE</span>
                ${statusBadge}
              </div>
              <h1 class="dash-main-title">DASHBOARD EN TIEMPO REAL</h1>
            </div>
          </div>

          <div class="dash-controls">
            <div class="room-pill-group">
              <span class="room-pill-label">SALA:</span>
              <strong class="room-pill-code">${escapeHtml(syncState.roomCode)}</strong>
              <button type="button" id="btn-toggle-room-edit" class="btn-room-change">Cambiar</button>
            </div>

            <button type="button" id="btn-expand-qr" class="btn-dash-action btn-dash-gold">
              ⛶ AMPLIAR QR
            </button>
            <button type="button" id="btn-simulate-run" class="btn-dash-action btn-dash-cyan" title="Añade una partida de prueba en tiempo real">
              ⚡ SIMULAR PARTIDA
            </button>
            <button type="button" id="btn-open-reset-room" class="btn-dash-action btn-dash-danger" title="Borra las partidas de la sala para empezar de cero">
              ↺ LIMPIAR SALA
            </button>
          </div>
        </header>

        ${roomEditorOpen ? `
          <div class="room-editor-bar">
            <label for="input-room-code" class="micro-mono-gold">CÓDIGO DE SALA PARA LA CLASE:</label>
            <input
              id="input-room-code"
              class="room-code-input"
              type="text"
              maxlength="12"
              value="${escapeHtml(syncState.roomCode)}"
              placeholder="Ej. CLASE, DAM2, FINAL"
            />
            <button type="button" id="btn-save-room-code" class="btn-room-apply">Aplicar y actualizar QR</button>
            <button type="button" id="btn-cancel-room-code" class="btn-room-cancel">Cancelar</button>
          </div>
        ` : ''}

        ${activeToast ? buildRealtimeToastHtml(activeToast) : ''}

        <main class="dashboard-grid">
          <!-- COLUMNA IZQUIERDA: QR DE ACCESO + EN LA ARENA AHORA + FEED EN VIVO -->
          <aside class="dash-col dash-col-left">
            <section class="panel dash-qr-panel" aria-label="Código QR para unirse en tiempo real">
              <div class="panel-head">
                <h2 class="panel-label gold-label">1. ESCANEA Y JUEGA (60s)</h2>
                <span class="micro-mono-cyan">SALA ${escapeHtml(syncState.roomCode)}</span>
              </div>

              <div class="qr-card-frame" id="qr-clickable-card" title="Haz clic para ampliar el QR a pantalla completa">
                <div class="qr-svg-box">
                  ${qrSvgSmall}
                </div>
                <div class="qr-instructions">
                  <span class="qr-step-badge">📱 APUNTA CON TU CÁMARA</span>
                  <p class="qr-url-display">${escapeHtml(syncState.publicUrl.replace(/^https?:\/\//, ''))}</p>
                  <div class="qr-btn-row">
                    <button type="button" id="btn-copy-url" class="btn-qr-mini">
                      ${copyFeedback ? escapeHtml(copyFeedback) : 'Copiar enlace'}
                    </button>
                    <button type="button" id="btn-qr-fullscreen-inline" class="btn-qr-mini btn-qr-mini-gold">
                      ⛶ Pantalla completa
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section class="panel dash-arena-live-panel" aria-label="Jugadores en la arena ahora mismo">
              <div class="panel-head">
                <h2 class="panel-label">🔥 EN LA ARENA AHORA (${syncState.activePlayers.length})</h2>
                <span class="micro-mono-gold">TIEMPO REAL</span>
              </div>

              ${syncState.activePlayers.length === 0
                ? `<div class="dash-empty-Arena">
                    <p>Ningún alumno en mitad de partida ahora mismo.</p>
                    <small>En cuanto alguien pulse "Iniciar Partida" en su móvil, aparecerá aquí en directo.</small>
                  </div>`
                : `<div class="active-arena-list">
                    ${syncState.activePlayers.map((p) => buildActiveArenaRowHtml(p)).join('')}
                  </div>`
              }
            </section>

            <section class="panel dash-feed-panel" aria-label="Feed de partidas en tiempo real">
              <div class="panel-head">
                <h2 class="panel-label">⚡ ÚLTIMAS PARTIDAS EN VIVO</h2>
                <span class="micro-mono-muted">${totalRuns} REG.</span>
              </div>

              ${recentRuns.length === 0
                ? `<p class="empty-copy">Esperando la primera partida de la clase...</p>`
                : `<div class="live-feed-list">
                    ${recentRuns.map((rec) => buildLiveFeedItemHtml(rec)).join('')}
                  </div>`
              }
            </section>
          </aside>

          <!-- COLUMNA CENTRAL: KPIs DE CLASE + PODIO TOP 3 + RÁNKING EN VIVO -->
          <section class="dash-col dash-col-center" aria-label="Podio y Ránking en tiempo real">
            <div class="dash-kpi-strip">
              <div class="dash-kpi-box">
                <span class="dash-kpi-lbl">JUGADORES</span>
                <strong class="dash-kpi-num" style="color:${RELICARIO_PALETTE.liturgicalGold};">${uniquePlayers}</strong>
                <span class="dash-kpi-sub">en sala ${escapeHtml(syncState.roomCode)}</span>
              </div>
              <div class="dash-kpi-box">
                <span class="dash-kpi-lbl">PARTIDAS</span>
                <strong class="dash-kpi-num" style="color:${RELICARIO_PALETTE.ivory};">${totalRuns}</strong>
                <span class="dash-kpi-sub">${totalSurvived} completadas (60s)</span>
              </div>
              <div class="dash-kpi-box">
                <span class="dash-kpi-lbl">SUPERVIVENCIA</span>
                <strong class="dash-kpi-num" style="color:${RELICARIO_PALETTE.graceJade};">${globalSurvivalPct}%</strong>
                <span class="dash-kpi-sub">tasa global de éxito</span>
              </div>
              <div class="dash-kpi-box">
                <span class="dash-kpi-lbl">BAJAS TOTALES</span>
                <strong class="dash-kpi-num" style="color:${RELICARIO_PALETTE.coldSilver};">${totalKills}</strong>
                <span class="dash-kpi-sub">aberraciones abatidas</span>
              </div>
            </div>

            <section class="panel dash-podium-panel" aria-label="Podio Top 3 de la clase">
              <div class="panel-head">
                <h2 class="panel-label gold-label">♛ PODIO EN VIVO DE LA CLASE</h2>
                <span class="micro-mono-muted">ÍNDICE COMPUESTO DE MEDIAS</span>
              </div>

              ${top3.length === 0
                ? `<div class="podium-empty">
                    <p>El podio se iluminará automáticamente con los 3 mejores jugadores de la clase.</p>
                  </div>`
                : `<div class="podium-grid">
                    ${top3.map((prof, idx) => buildPodiumCardHtml(prof, idx + 1)).join('')}
                  </div>`
              }
            </section>

            <section class="panel dash-ranking-panel" aria-label="Clasificación completa en vivo">
              <div class="dash-ranking-header">
                <div class="panel-head">
                  <h2 class="panel-label">CLASIFICACIÓN GENERAL (${profiles.length} JUGADORES)</h2>
                  <div class="chips-scroll" role="group" aria-label="Filtrar por motor">
                    <button
                      type="button"
                      class="chip-btn dash-mode-filter ${modeFilter === null ? 'is-selected' : ''}"
                      data-mode=""
                      style="${modeFilter === null ? `color:${RELICARIO_PALETTE.coldSilver}; border-color:${RELICARIO_PALETTE.coldSilver}; background:${RELICARIO_PALETTE.coldSilver}26;` : ''}"
                    >Todos</button>
                    ${GAME_MODES.map((m) => {
                      const isSel = modeFilter === m.id;
                      return `
                        <button
                          type="button"
                          class="chip-btn dash-mode-filter ${isSel ? 'is-selected' : ''}"
                          data-mode="${m.id}"
                          style="${isSel ? `color:${m.accentColor}; border-color:${m.accentColor}; background:${m.accentColor}26;` : ''}"
                        >${escapeHtml(m.tableHeader)}</button>
                      `;
                    }).join('')}
                  </div>
                </div>

                <div class="chips-scroll" role="group" aria-label="Ordenar ránking">
                  ${LEADERBOARD_SORT_METRICS.map((m) => {
                    const isSel = sortMetric === m.id;
                    return `
                      <button
                        type="button"
                        class="chip-btn dash-sort-chip ${isSel ? 'is-selected' : ''}"
                        data-sort="${m.id}"
                        style="${isSel ? `color:${RELICARIO_PALETTE.liturgicalGold}; border-color:${RELICARIO_PALETTE.liturgicalGold}; background:${RELICARIO_PALETTE.liturgicalGold}26;` : ''}"
                      >${escapeHtml(m.title)}</button>
                    `;
                  }).join('')}
                </div>
              </div>

              ${profiles.length === 0
                ? `<p class="empty-copy">Aún no hay partidas registradas con este filtro.</p>`
                : `<div class="dash-rank-table">
                    ${profiles.map((prof, idx) => buildDashboardRankRowHtml(prof, idx + 1, sortMetric)).join('')}
                  </div>`
              }
            </section>
          </section>

          <!-- COLUMNA DERECHA: COMPARATIVA CIENTÍFICA 1985 vs 2026 vs HÍBRIDO -->
          <aside class="dash-col dash-col-right" aria-label="Estadísticas comparativas en tiempo real">
            <section class="panel dash-science-panel">
              <div class="panel-head">
                <h2 class="panel-label gold-label">2. TELEMETRÍA COMPARATIVA EN VIVO</h2>
                <span class="micro-mono-cyan">1985 vs 2026 vs HÍBR.</span>
              </div>

              ${buildVisualComparisonBlock('TASA DE SUPERVIVENCIA (60s)', [
                { label: '1985 · Fijo', count: stats1985.runCount, val: stats1985.survivalRatePercent, max: 100, text: stats1985.runCount ? `${Math.round(stats1985.survivalRatePercent)}%` : '—', color: RELICARIO_PALETTE.oldBone },
                { label: '2026 · Director IA', count: stats2026.runCount, val: stats2026.survivalRatePercent, max: 100, text: stats2026.runCount ? `${Math.round(stats2026.survivalRatePercent)}%` : '—', color: RELICARIO_PALETTE.vermilion },
                { label: 'Híbrido 85×26', count: statsHybrid.runCount, val: statsHybrid.survivalRatePercent, max: 100, text: statsHybrid.runCount ? `${Math.round(statsHybrid.survivalRatePercent)}%` : '—', color: RELICARIO_PALETTE.liturgicalGold }
              ])}

              ${buildVisualComparisonBlock('TIEMPO MEDIO DE SUPERVIVENCIA (máx. 60s)', [
                { label: '1985 · Fijo', count: stats1985.runCount, val: stats1985.avgSurvivedSeconds, max: 60, text: stats1985.runCount ? `${stats1985.avgSurvivedSeconds.toFixed(1)}s` : '—', color: RELICARIO_PALETTE.oldBone },
                { label: '2026 · Director IA', count: stats2026.runCount, val: stats2026.avgSurvivedSeconds, max: 60, text: stats2026.runCount ? `${stats2026.avgSurvivedSeconds.toFixed(1)}s` : '—', color: RELICARIO_PALETTE.vermilion },
                { label: 'Híbrido 85×26', count: statsHybrid.runCount, val: statsHybrid.avgSurvivedSeconds, max: 60, text: statsHybrid.runCount ? `${statsHybrid.avgSurvivedSeconds.toFixed(1)}s` : '—', color: RELICARIO_PALETTE.liturgicalGold }
              ])}

              ${buildVisualComparisonBlock('BAJAS MEDIAS POR PARTIDA', [
                { label: '1985 · Fijo', count: stats1985.runCount, val: stats1985.avgKills, max: Math.max(40, stats1985.avgKills, stats2026.avgKills, statsHybrid.avgKills), text: stats1985.runCount ? `${stats1985.avgKills.toFixed(1)}` : '—', color: RELICARIO_PALETTE.oldBone },
                { label: '2026 · Director IA', count: stats2026.runCount, val: stats2026.avgKills, max: Math.max(40, stats1985.avgKills, stats2026.avgKills, statsHybrid.avgKills), text: stats2026.runCount ? `${stats2026.avgKills.toFixed(1)}` : '—', color: RELICARIO_PALETTE.vermilion },
                { label: 'Híbrido 85×26', count: statsHybrid.runCount, val: statsHybrid.avgKills, max: Math.max(40, stats1985.avgKills, stats2026.avgKills, statsHybrid.avgKills), text: statsHybrid.runCount ? `${statsHybrid.avgKills.toFixed(1)}` : '—', color: RELICARIO_PALETTE.liturgicalGold }
              ])}

              <div class="stress-flow-box">
                <div class="stress-flow-head">
                  <span class="micro-mono-gold">ÍNDICE DE ESTRÉS MEDIO VS ZONA DE FLUJO (60–75%)</span>
                </div>
                ${buildStressFlowBar('1985', stats1985)}
                ${buildStressFlowBar('2026', stats2026)}
                ${buildStressFlowBar('HÍBR.', statsHybrid)}
              </div>
            </section>

            <section class="panel dash-insight-panel" aria-label="Conclusión en directo">
              <div class="panel-head">
                <h2 class="panel-label gold-label">CONCLUSIÓN EN DIRECTO</h2>
                <span class="micro-mono-muted">TESIS IA</span>
              </div>
              <p class="dash-insight-copy">
                ${escapeHtml(buildLiveThesisConclusion(stats1985, stats2026, statsHybrid, totalRuns))}
              </p>

              ${buildPopularAvatarsStrip(store.records)}
            </section>
          </aside>
        </main>

        ${qrModalOpen ? `
          <div id="qr-fullscreen-modal" class="pause-modal qr-giant-modal" role="dialog" aria-modal="true" aria-labelledby="qr-modal-title">
            <div class="qr-giant-card">
              <div class="qr-giant-top">
                <span class="dash-kicker">SALA EN TIEMPO REAL: ${escapeHtml(syncState.roomCode)}</span>
                <h2 id="qr-modal-title" class="qr-giant-title">ESCANEA PARA JUGAR EN DIRECTO</h2>
                <p class="panel-subcopy">Al terminar tu ronda de 60 segundos, tu puntuación aparecerá automáticamente en el proyector</p>
              </div>
              <div class="qr-giant-svg-wrap">
                ${renderQrCodeSvg(syncState.publicUrl, { sizePx: 360, darkColor: '#080606', lightColor: '#F5EFE6', margin: 3 })}
              </div>
              <p class="qr-giant-url">${escapeHtml(syncState.publicUrl)}</p>
              <button type="button" id="btn-close-qr-modal" class="btn-primary-cta" style="background:${RELICARIO_PALETTE.liturgicalGold}; color:#080606; max-width:320px;">
                CERRAR Y VER RÁNKING EN VIVO (${uniquePlayers} JUG.)
              </button>
            </div>
          </div>
        ` : ''}

        ${confirmResetOpen ? `
          <div id="dash-reset-modal" class="pause-modal" role="dialog" aria-modal="true">
            <div class="pause-card">
              <h2 class="pause-title">¿LIMPIAR SALA ${escapeHtml(syncState.roomCode)}?</h2>
              <p class="panel-subcopy">Se reiniciará el marcador en vivo de esta sala para comenzar una nueva sesión con la clase.</p>
              <button type="button" id="btn-confirm-room-reset" class="btn-abort">SÍ, REINICIAR MARCADOR DE SALA</button>
              <button type="button" id="btn-cancel-room-reset" class="btn-resume-ghost">CANCELAR</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    bindEvents(syncState);
  };

  function bindEvents(syncState) {
    root.querySelector('#btn-dash-back')?.addEventListener('click', onReturnToStart);

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
        copyFeedback = '¡Enlace copiado!';
      } catch {
        copyFeedback = 'Copia la URL de arriba';
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

    root.querySelectorAll('.dash-mode-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        modeFilter = btn.dataset.mode || null;
        render();
      });
    });

    root.querySelectorAll('.dash-sort-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        sortMetric = btn.dataset.sort;
        render();
      });
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
  const statusColor = toast.didSurvive ? RELICARIO_PALETTE.graceJade : RELICARIO_PALETTE.vermilion;
  const headline = toast.didSurvive
    ? `¡${escapeHtml(toast.initials)} SOBREVIVIÓ LOS 60.0s!`
    : `${escapeHtml(toast.initials)} CAYÓ A LOS ${toast.survivedSeconds.toFixed(1)}s`;

  return `
    <div class="dash-live-toast" role="status" aria-live="polite" style="border-color:${statusColor};">
      <span class="toast-bolt">⚡</span>
      ${renderAvatarSVG(toast.avatar, 32, true)}
      <div class="toast-copy">
        <strong>${headline}</strong>
        <span>
          <b style="color:${toast.modeColor};">${escapeHtml(toast.modeTitle)}</b> ·
          ${toast.kills} bajas · Estrés medio ${Math.round(toast.averageStress)}%
        </span>
      </div>
    </div>
  `;
}

function buildActiveArenaRowHtml(p) {
  const modeDef = GAME_MODE_MAP[p.mode] || GAME_MODE_MAP.director2026;
  const elapsed = Math.min(60, Math.max(0, (Date.now() - p.startedAt) / 1000));
  const pct = Math.min(100, (elapsed / 60) * 100);

  return `
    <div class="active-arena-row" data-active-client="${escapeHtml(p.clientId)}">
      <div class="active-arena-top">
        <span class="active-arena-left">
          ${renderAvatarSVG(p.avatar, 24, true)}
          <strong>${escapeHtml(p.initials)}</strong>
          <span class="mode-badge-xs" style="color:${modeDef.accentColor}; background:${modeDef.accentColor}26;">
            ${escapeHtml(modeDef.shortBadge)}
          </span>
        </span>
        <span class="active-arena-sec">${elapsed.toFixed(0)}s / 60s</span>
      </div>
      <div class="active-arena-bar-track">
        <div class="active-arena-bar-fill" style="width:${pct.toFixed(1)}%; background:${modeDef.accentColor};"></div>
      </div>
    </div>
  `;
}

function buildLiveFeedItemHtml(rec) {
  const modeDef = GAME_MODE_MAP[rec.mode] || GAME_MODE_MAP.director2026;
  const statusCol = rec.didSurvive ? RELICARIO_PALETTE.graceJade : RELICARIO_PALETTE.vermilion;

  return `
    <button type="button" class="live-feed-item" data-open-initials="${escapeHtml(rec.initials)}">
      <span class="live-feed-left">
        ${rec.avatar ? renderAvatarSVG(rec.avatar, 24, false) : ''}
        <strong class="live-feed-init">${escapeHtml(rec.initials)}</strong>
        <span class="mode-badge-xs" style="color:${modeDef.accentColor}; background:${modeDef.accentColor}24;">
          ${escapeHtml(modeDef.shortBadge)}
        </span>
      </span>
      <span class="live-feed-right">
        <strong style="color:${statusCol};">${rec.survivedSeconds.toFixed(1)}s</strong>
        <span>${rec.kills}B</span>
        <span class="feed-stress-tag">${Math.round(rec.averageStress)}%</span>
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
      <span class="podium-pts" style="color:${color};">${Math.round(prof.rankingScore)} PTS</span>
      <span class="podium-meta">
        ${prof.avgSurvivedSeconds.toFixed(1)}s · ${prof.avgKills.toFixed(1)}B · ${Math.round(prof.survivalRatePercent)}% sup.
      </span>
    </button>
  `;
}

function buildDashboardRankRowHtml(prof, rank, sortMetric) {
  const rColor = medalColor(rank);
  const avatarId = prof.favoriteAvatar || prof.latestAvatar || 'penitente';
  const stressCol = stressTierFromIndex(prof.avgStress).color;

  return `
    <button type="button" class="dash-rank-row" data-open-initials="${escapeHtml(prof.initials)}">
      <span class="dash-rank-pos" style="color:${rColor}; background:${rColor}22;">#${rank}</span>
      ${renderAvatarSVG(avatarId, 28, rank <= 3)}
      <span class="dash-rank-ident">
        <strong>${escapeHtml(prof.initials)}</strong>
        <small>${prof.runCount} ${prof.runCount === 1 ? 'ronda' : 'rondas'}</small>
      </span>
      <span class="dash-rank-stat ${sortMetric === 'avgTime' ? 'is-hi' : ''}">${prof.avgSurvivedSeconds.toFixed(1)}s</span>
      <span class="dash-rank-stat ${sortMetric === 'avgKills' ? 'is-hi' : ''}">${prof.avgKills.toFixed(1)} B</span>
      <span class="dash-rank-stat ${sortMetric === 'survivalRate' ? 'is-hi' : ''}" style="color:${RELICARIO_PALETTE.graceJade};">${Math.round(prof.survivalRatePercent)}%</span>
      <span class="dash-rank-stat ${sortMetric === 'avgStress' ? 'is-hi' : ''}" style="color:${stressCol};">${Math.round(prof.avgStress)}%</span>
      <strong class="dash-rank-pts" style="color:${RELICARIO_PALETTE.liturgicalGold};">${Math.round(prof.rankingScore)} pts</strong>
    </button>
  `;
}

function buildVisualComparisonBlock(title, rows) {
  return `
    <div class="science-metric-block">
      <div class="science-metric-title">${escapeHtml(title)}</div>
      <div class="science-bars">
        ${rows
          .map((r) => {
            const pct = r.count > 0 && r.max > 0 ? Math.min(100, Math.max(4, (r.val / r.max) * 100)) : 0;
            return `
              <div class="science-bar-row">
                <div class="science-bar-labels">
                  <span style="color:${r.color}; font-weight:700;">${escapeHtml(r.label)} <small>(${r.count})</small></span>
                  <strong style="color:${r.color};">${escapeHtml(r.text)}</strong>
                </div>
                <div class="science-bar-track">
                  <div class="science-bar-fill" style="width:${pct.toFixed(1)}%; background:${r.color};"></div>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function buildStressFlowBar(shortLabel, stats) {
  const avg = stats.runCount > 0 ? Math.min(100, Math.max(0, stats.avgStress)) : 0;
  const peak = stats.runCount > 0 ? Math.min(100, Math.max(0, stats.avgPeakStress)) : 0;
  const tierColor = stats.runCount > 0 ? stressTierFromIndex(avg).color : 'rgba(230,204,178,0.4)';

  return `
    <div class="flow-row">
      <span class="flow-mode-lbl">${escapeHtml(shortLabel)}</span>
      <div class="flow-track" title="Zona óptima de Flujo: 60% a 75%">
        <div class="flow-target-band" style="left:60%; width:15%;"></div>
        ${stats.runCount > 0 ? `
          <div class="flow-avg-bar" style="width:${avg.toFixed(1)}%; background:${tierColor};"></div>
          <div class="flow-peak-marker" style="left:${peak.toFixed(1)}%;" title="Pico medio: ${Math.round(peak)}%"></div>
        ` : ''}
      </div>
      <span class="flow-val" style="color:${tierColor};">
        ${stats.runCount > 0 ? `${Math.round(avg)}%` : '—'}
      </span>
    </div>
  `;
}

function buildLiveThesisConclusion(s85, s26, sHyb, total) {
  if (total === 0) {
    return 'Escanea el código QR con los móviles de la clase o pulsa "⚡ Simular Partida" para ver cómo se construye en vivo la comparativa entre las reglas fijas de 1985 y el Director IA de 2026.';
  }
  if (s85.runCount > 0 && s26.runCount > 0) {
    const diffSurv = Math.round(s26.survivalRatePercent - s85.survivalRatePercent);
    const sign = diffSurv >= 0 ? `+${diffSurv}` : `${diffSurv}`;
    return `Con ${total} partidas en vivo: el Director IA 2026 registra ${Math.round(s26.survivalRatePercent)}% de supervivencia (${sign} pp vs 1985) manteniendo un estrés medio de ${Math.round(s26.avgStress)}% y ${s26.avgSurvivedSeconds.toFixed(1)}s de aguante medio, frente a los ${s85.avgSurvivedSeconds.toFixed(1)}s del motor fijo de 1985.`;
  }
  return `Registradas ${total} partidas en vivo. Pide a varios alumnos que prueben tanto el Modo 1985 como el Modo 2026 para contrastar en directo la tasa de supervivencia y la curva de estrés.`;
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
      <span class="micro-mono-muted">AVATARES MÁS ELEGIDOS EN CLASE</span>
      <div class="popular-avatars-row">
        ${topAvatars
          .map(([avId, count]) => {
            const def = PLAYER_AVATAR_MAP[avId];
            if (!def) return '';
            return `
              <span class="pop-av-chip" style="border-color:${def.auraColor}66;">
                ${renderAvatarSVG(avId, 20, true)}
                <span>${escapeHtml(def.shortLabel)}</span>
                <b style="color:${def.auraColor};">${count}</b>
              </span>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}
