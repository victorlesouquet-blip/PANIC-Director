// Dashboard de Proyector en Tiempo Real para la Clase (16:9 Panorámico + QR + Podio + Comparativa 1985 vs 2026 vs Híbrido + Feed en Vivo)

import {
  CAMPAIGN_PHASES,
  GAME_MODE_MAP,
  LEADERBOARD_SORT_METRICS,
  PLAYER_AVATARS,
  PLAYER_AVATAR_MAP,
  RELICARIO_PALETTE,
  TOTAL_RUN_DURATION,
  getPhaseForElapsedTime,
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
    const reachedPhase = rec.reachedPhase || (rec.survivedSeconds >= 80 ? 3 : rec.survivedSeconds >= 40 ? 2 : 1);
    const phaseDef = CAMPAIGN_PHASES[Math.min(2, Math.max(0, reachedPhase - 1))];
    activeToast = {
      initials: rec.initials,
      avatar: rec.avatar || 'penitente',
      modeTitle: `FASE ${reachedPhase} · ${phaseDef.shortBadge}`,
      modeColor: phaseDef.accentColor,
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
      const elapsed = Math.min(TOTAL_RUN_DURATION, Math.max(0, (now - p.startedAt) / 1000));
      const pct = Math.min(100, (elapsed / TOTAL_RUN_DURATION) * 100);
      const curPhase = getPhaseForElapsedTime(elapsed);
      const rowEl = root.querySelector(`[data-active-client="${CSS.escape(p.clientId)}"]`);
      if (rowEl) {
        const secEl = rowEl.querySelector('.active-arena-sec');
        const fillEl = rowEl.querySelector('.active-arena-bar-fill');
        const badgeEl = rowEl.querySelector('.active-arena-phase-badge');
        if (secEl) secEl.textContent = `${elapsed.toFixed(0)}s / 120s`;
        if (fillEl) {
          fillEl.style.width = `${pct.toFixed(1)}%`;
          fillEl.style.background = curPhase.accentColor;
        }
        if (badgeEl) {
          badgeEl.textContent = `F${curPhase.phaseNumber}·${curPhase.shortBadge}`;
          badgeEl.style.color = curPhase.accentColor;
          badgeEl.style.background = `${curPhase.accentColor}26`;
        }
      }
    });
  }

  function simulateClassRun() {
    const initials = DEMO_INITIALS_POOL[Math.floor(Math.random() * DEMO_INITIALS_POOL.length)];
    const avatar = PLAYER_AVATARS[Math.floor(Math.random() * PLAYER_AVATARS.length)].id;

    // Simular progresión a través de las 3 fases (0-40s 1985, 40-80s Híbrido, 80-120s IA 2026)
    const roll = Math.random();
    let survivedSeconds = 120.0;
    let didSurvive = false;
    let reachedPhase = 1;

    if (roll < 0.22) {
      // Cae en Fase 1 (0 - 40s)
      reachedPhase = 1;
      survivedSeconds = 22 + Math.random() * 17.5;
    } else if (roll < 0.56) {
      // Supera Fase 1 y cae en Fase 2 (40 - 80s)
      reachedPhase = 2;
      survivedSeconds = 45 + Math.random() * 34.0;
    } else if (roll < 0.78) {
      // Llega a Fase 3 (80 - 120s) pero cae antes de los 120s
      reachedPhase = 3;
      survivedSeconds = 85 + Math.random() * 33.5;
    } else {
      // Sobrevive los 120s completos (las 3 fases)
      reachedPhase = 3;
      didSurvive = true;
      survivedSeconds = 120.0;
    }

    const p1Time = Math.min(40.0, survivedSeconds);
    const p2Time = Math.max(0, Math.min(40.0, survivedSeconds - 40.0));
    const p3Time = Math.max(0, Math.min(40.0, survivedSeconds - 80.0));

    const p1Kills = Math.round((p1Time / 40) * (12 + Math.random() * 8));
    const p2Kills = p2Time > 0 ? Math.round((p2Time / 40) * (16 + Math.random() * 10)) : 0;
    const p3Kills = p3Time > 0 ? Math.round((p3Time / 40) * (20 + Math.random() * 12)) : 0;
    const kills = p1Kills + p2Kills + p3Kills;

    const p1Stress = Math.round(54 + Math.random() * 16);
    const p2Stress = p2Time > 0 ? Math.round(68 + Math.random() * 16) : 0;
    const p3Stress = p3Time > 0 ? Math.round(63 + Math.random() * 11) : 0; // Zona de flujo IA Directora

    const weightedStress =
      (p1Stress * p1Time + p2Stress * p2Time + p3Stress * p3Time) / Math.max(1, survivedSeconds);
    const averageStress = Math.round(weightedStress);
    const peakStress = Math.min(100, Math.max(p1Stress, p2Stress, p3Stress) + Math.round(12 + Math.random() * 12));
    const medkitsCollected = Math.round(1 + (survivedSeconds / 45) * (1 + Math.random()));

    const phaseBreakdown = {
      classic1985: {
        entered: true,
        didSurvive: survivedSeconds >= 40.0,
        survivedSeconds: Number(p1Time.toFixed(1)),
        kills: p1Kills,
        averageStress: p1Stress,
        peakStress: Math.min(100, p1Stress + 12)
      },
      hybrid1985x2026: {
        entered: p2Time > 0,
        didSurvive: survivedSeconds >= 80.0,
        survivedSeconds: Number(p2Time.toFixed(1)),
        kills: p2Kills,
        averageStress: p2Stress,
        peakStress: p2Time > 0 ? Math.min(100, p2Stress + 14) : 0
      },
      director2026: {
        entered: p3Time > 0,
        didSurvive: didSurvive,
        survivedSeconds: Number(p3Time.toFixed(1)),
        kills: p3Kills,
        averageStress: p3Stress,
        peakStress: p3Time > 0 ? Math.min(100, p3Stress + 11) : 0
      }
    };

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
      phaseBreakdown,
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
                <span class="dash-kicker">PANIC DIRECTOR · PROYECTOR DE CLASE · 2 MIN (3 FASES)</span>
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
            <button type="button" id="btn-simulate-run" class="btn-dash-action btn-dash-cyan" title="Añade una partida de prueba de 3 fases en tiempo real">
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
                <h2 class="panel-label gold-label">1. ESCANEA Y JUEGA (2 MIN · 3 FASES)</h2>
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
                <span class="dash-kpi-sub">${totalSurvived} victorias (2 min)</span>
              </div>
              <div class="dash-kpi-box">
                <span class="dash-kpi-lbl">SUPERVIVENCIA 2M</span>
                <strong class="dash-kpi-num" style="color:${RELICARIO_PALETTE.graceJade};">${globalSurvivalPct}%</strong>
                <span class="dash-kpi-sub">completan las 3 fases</span>
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
                  <div class="chips-scroll" role="group" aria-label="Filtrar por fase">
                    <button
                      type="button"
                      class="chip-btn dash-mode-filter ${modeFilter === null ? 'is-selected' : ''}"
                      data-mode=""
                      style="${modeFilter === null ? `color:${RELICARIO_PALETTE.coldSilver}; border-color:${RELICARIO_PALETTE.coldSilver}; background:${RELICARIO_PALETTE.coldSilver}26;` : ''}"
                    >Todas</button>
                    ${CAMPAIGN_PHASES.map((m) => {
                      const isSel = modeFilter === m.id;
                      return `
                        <button
                          type="button"
                          class="chip-btn dash-mode-filter ${isSel ? 'is-selected' : ''}"
                          data-mode="${m.id}"
                          style="${isSel ? `color:${m.accentColor}; border-color:${m.accentColor}; background:${m.accentColor}26;` : ''}"
                        >F${m.phaseNumber}·${escapeHtml(m.tableHeader)}</button>
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

          <!-- COLUMNA DERECHA: COMPARATIVA CIENTÍFICA POR FASE (0-40s vs 40-80s vs 80-120s) -->
          <aside class="dash-col dash-col-right" aria-label="Estadísticas comparativas por fase en tiempo real">
            <section class="panel dash-science-panel">
              <div class="panel-head">
                <h2 class="panel-label gold-label">2. TELEMETRÍA POR FASE EN VIVO</h2>
                <span class="micro-mono-cyan">0-40s · 40s-1:20 · 1:20-2:00</span>
              </div>

              ${buildVisualComparisonBlock('TASA DE SUPERACIÓN DE CADA FASE (40s POR TRAMO)', [
                { label: 'F1 · 1985 (0–40s)', count: stats1985.runCount, val: stats1985.survivalRatePercent, max: 100, text: stats1985.runCount ? `${Math.round(stats1985.survivalRatePercent)}%` : '—', color: RELICARIO_PALETTE.oldBone },
                { label: 'F2 · Híbrido (40s–1:20)', count: statsHybrid.runCount, val: statsHybrid.survivalRatePercent, max: 100, text: statsHybrid.runCount ? `${Math.round(statsHybrid.survivalRatePercent)}%` : '—', color: RELICARIO_PALETTE.liturgicalGold },
                { label: 'F3 · IA 2026 (1:20–2:00)', count: stats2026.runCount, val: stats2026.survivalRatePercent, max: 100, text: stats2026.runCount ? `${Math.round(stats2026.survivalRatePercent)}%` : '—', color: RELICARIO_PALETTE.vermilion }
              ])}

              ${buildVisualComparisonBlock('TIEMPO MEDIO EN CADA FASE (máx. 40s)', [
                { label: 'F1 · 1985 (0–40s)', count: stats1985.runCount, val: stats1985.avgSurvivedSeconds, max: 40, text: stats1985.runCount ? `${stats1985.avgSurvivedSeconds.toFixed(1)}s` : '—', color: RELICARIO_PALETTE.oldBone },
                { label: 'F2 · Híbrido (40s–1:20)', count: statsHybrid.runCount, val: statsHybrid.avgSurvivedSeconds, max: 40, text: statsHybrid.runCount ? `${statsHybrid.avgSurvivedSeconds.toFixed(1)}s` : '—', color: RELICARIO_PALETTE.liturgicalGold },
                { label: 'F3 · IA 2026 (1:20–2:00)', count: stats2026.runCount, val: stats2026.avgSurvivedSeconds, max: 40, text: stats2026.runCount ? `${stats2026.avgSurvivedSeconds.toFixed(1)}s` : '—', color: RELICARIO_PALETTE.vermilion }
              ])}

              ${buildVisualComparisonBlock('BAJAS MEDIAS EN CADA FASE', [
                { label: 'F1 · 1985 (0–40s)', count: stats1985.runCount, val: stats1985.avgKills, max: Math.max(25, stats1985.avgKills, stats2026.avgKills, statsHybrid.avgKills), text: stats1985.runCount ? `${stats1985.avgKills.toFixed(1)}` : '—', color: RELICARIO_PALETTE.oldBone },
                { label: 'F2 · Híbrido (40s–1:20)', count: statsHybrid.runCount, val: statsHybrid.avgKills, max: Math.max(25, stats1985.avgKills, stats2026.avgKills, statsHybrid.avgKills), text: statsHybrid.runCount ? `${statsHybrid.avgKills.toFixed(1)}` : '—', color: RELICARIO_PALETTE.liturgicalGold },
                { label: 'F3 · IA 2026 (1:20–2:00)', count: stats2026.runCount, val: stats2026.avgKills, max: Math.max(25, stats1985.avgKills, stats2026.avgKills, statsHybrid.avgKills), text: stats2026.runCount ? `${stats2026.avgKills.toFixed(1)}` : '—', color: RELICARIO_PALETTE.vermilion }
              ])}

              <div class="stress-flow-box">
                <div class="stress-flow-head">
                  <span class="micro-mono-gold">ESTRÉS MEDIO POR FASE VS ZONA DE FLUJO (60–75%)</span>
                </div>
                ${buildStressFlowBar('F1·85', stats1985)}
                ${buildStressFlowBar('F2·HÍB', statsHybrid)}
                ${buildStressFlowBar('F3·IA', stats2026)}
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
                <p class="panel-subcopy">Partida única de 2 minutos con 3 fases (1985 → Híbrido → IA Directora) y pausa de 5s entre rondas</p>
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
    ? `¡${escapeHtml(toast.initials)} SOBREVIVIÓ LOS 2 MINUTOS!`
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
  const elapsed = Math.min(TOTAL_RUN_DURATION, Math.max(0, (Date.now() - p.startedAt) / 1000));
  const pct = Math.min(100, (elapsed / TOTAL_RUN_DURATION) * 100);
  const curPhase = getPhaseForElapsedTime(elapsed);

  return `
    <div class="active-arena-row" data-active-client="${escapeHtml(p.clientId)}">
      <div class="active-arena-top">
        <span class="active-arena-left">
          ${renderAvatarSVG(p.avatar, 24, true)}
          <strong>${escapeHtml(p.initials)}</strong>
          <span class="mode-badge-xs active-arena-phase-badge" style="color:${curPhase.accentColor}; background:${curPhase.accentColor}26;">
            F${curPhase.phaseNumber}·${escapeHtml(curPhase.shortBadge)}
          </span>
        </span>
        <span class="active-arena-sec">${elapsed.toFixed(0)}s / 120s</span>
      </div>
      <div class="active-arena-bar-track">
        <div class="active-arena-bar-fill" style="width:${pct.toFixed(1)}%; background:${curPhase.accentColor};"></div>
      </div>
    </div>
  `;
}

function buildLiveFeedItemHtml(rec) {
  const reachedPhase = rec.reachedPhase || (rec.survivedSeconds >= 80 ? 3 : rec.survivedSeconds >= 40 ? 2 : 1);
  const phaseDef = CAMPAIGN_PHASES[Math.min(2, Math.max(0, reachedPhase - 1))];
  const statusCol = rec.didSurvive ? RELICARIO_PALETTE.graceJade : RELICARIO_PALETTE.vermilion;

  return `
    <button type="button" class="live-feed-item" data-open-initials="${escapeHtml(rec.initials)}">
      <span class="live-feed-left">
        ${rec.avatar ? renderAvatarSVG(rec.avatar, 24, false) : ''}
        <strong class="live-feed-init">${escapeHtml(rec.initials)}</strong>
        <span class="mode-badge-xs" style="color:${phaseDef.accentColor}; background:${phaseDef.accentColor}24;">
          F${reachedPhase}·${escapeHtml(phaseDef.shortBadge)}
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
    return 'Escanea el código QR con los móviles de la clase o pulsa "⚡ Simular Partida" para ver en directo la evolución del jugador a través de las 3 fases (0–40s 1985, 40s–1m20s Híbrido y 1m20s–2m00s IA Directora).';
  }
  if (s85.runCount > 0 && (sHyb.runCount > 0 || s26.runCount > 0)) {
    return `Con ${total} partidas en vivo: el ${Math.round(s85.survivalRatePercent)}% supera la Fase 1 (1985, estrés ${Math.round(s85.avgStress)}%), el ${Math.round(sHyb.survivalRatePercent)}% supera la Fase 2 (Híbrido, estrés ${Math.round(sHyb.avgStress)}%) y en la Fase 3 el Director IA 2026 regula el estrés medio al ${Math.round(s26.avgStress)}% con un ${Math.round(s26.survivalRatePercent)}% de victoria final.`;
  }
  return `Registradas ${total} partidas en vivo. Cada partida recorre las 3 fases progresivas de 40 segundos con una pausa de preparación de 5 segundos entre rondas.`;
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
