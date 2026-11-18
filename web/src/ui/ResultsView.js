// Vista de Resultados, Telemetría Comparativa de Clase (1985 vs 2026 vs Híbrido) y Unificación JSON

import { CAMPAIGN_PHASES, GAME_MODE_MAP, RELICARIO_PALETTE, stressTierFromIndex } from '../engine/constants.js';
import { renderAvatarSVG } from '../scene/avatarSVGs.js';
import { escapeHtml } from './domUtils.js';

function formatStatPct(stats, val) {
  return stats.runCount > 0 ? `${Math.round(val)}%` : '—';
}

function formatStatSec(stats, val) {
  return stats.runCount > 0 ? `${val.toFixed(1)}s` : '—';
}

function formatStatNum(stats, val) {
  return stats.runCount > 0 ? `${val.toFixed(1)}` : '—';
}

export function mountResultsView(
  root,
  { lastRecord, store, liveSync = null, roomCode = 'CLASE', onPlayAgain, onReturnToStart, onOpenPlayers, onOpenDashboard }
) {
  let syncNotice = '';
  let syncError = false;
  let pasteDrawerOpen = false;
  let confirmResetOpen = false;

  const render = () => {
    const stats1985 = store.stats('classic1985');
    const stats2026 = store.stats('director2026');
    const statsHybrid = store.stats('hybrid1985x2026');
    const totalCount = store.records.length;

    const topSectionHtml = lastRecord
      ? buildRunSummaryHtml(lastRecord, roomCode)
      : `
        <header class="panel telemetry-head-card">
          <div>
            <h1 class="telemetry-title">TELEMETRÍA DE CLASE</h1>
            <p class="panel-subcopy">Sala en vivo: <strong>${escapeHtml(roomCode)}</strong> · Campaña 2 Min (3 Fases)</p>
          </div>
          <span class="pill-badge-cyan">${totalCount} REG.</span>
        </header>
      `;

    const insightText = buildClassInsightText(stats1985, stats2026, statsHybrid, totalCount);

    root.innerHTML = `
      <div class="results-layout">
        <main class="screen-shell results-scroll">
          ${topSectionHtml}

          <button type="button" id="btn-dashboard-shortcut" class="btn-projector-banner">
            <span class="projector-icon">📺</span>
            <span class="projector-copy">
              <strong>DASHBOARD EN VIVO · SALA ${escapeHtml(roomCode)}</strong>
              <small>Ver código QR, podio y estadísticas en tiempo real</small>
            </span>
            <span class="chevron-right">›</span>
          </button>

          <button type="button" id="btn-players-shortcut" class="players-banner-btn">
            <span class="players-banner-icon">★</span>
            <span class="players-banner-text">
              <strong>JUGADORES Y RÁNKING DE MEDIAS</strong>
              <small>${store.uniquePlayerCount} ${store.uniquePlayerCount === 1 ? 'jugador registrado' : 'jugadores registrados'} · Toca para ver perfiles</small>
            </span>
            <span class="chevron-right">›</span>
          </button>

          <section class="panel" aria-label="Comparativa entre las 3 fases de IA">
            <div class="panel-head">
              <h2 class="panel-label gold-label">COMPARATIVA POR FASE · 1985 · HÍBR. · 2026</h2>
              <span class="micro-mono-muted">EN VIVO</span>
            </div>

            <div class="comparison-table" role="table" aria-label="Tabla comparativa de motores">
              <div class="cmp-row cmp-header" role="row">
                <span role="columnheader">MÉTRICA</span>
                <span role="columnheader" style="color:${RELICARIO_PALETTE.oldBone};">F1·1985</span>
                <span role="columnheader" style="color:${RELICARIO_PALETTE.liturgicalGold};">F2·HÍBR.</span>
                <span role="columnheader" style="color:${RELICARIO_PALETTE.vermilion};">F3·2026</span>
              </div>
              ${comparisonRow('Incursiones', `${stats1985.runCount}`, `${statsHybrid.runCount}`, `${stats2026.runCount}`)}
              ${comparisonRow('Fase superada', formatStatPct(stats1985, stats1985.survivalRatePercent), formatStatPct(statsHybrid, statsHybrid.survivalRatePercent), formatStatPct(stats2026, stats2026.survivalRatePercent))}
              ${comparisonRow('Tiempo medio', formatStatSec(stats1985, stats1985.avgSurvivedSeconds), formatStatSec(statsHybrid, statsHybrid.avgSurvivedSeconds), formatStatSec(stats2026, stats2026.avgSurvivedSeconds))}
              ${comparisonRow('Bajas medias', formatStatNum(stats1985, stats1985.avgKills), formatStatNum(statsHybrid, statsHybrid.avgKills), formatStatNum(stats2026, stats2026.avgKills))}
              ${comparisonRow('Estrés medio', formatStatPct(stats1985, stats1985.avgStress), formatStatPct(statsHybrid, statsHybrid.avgStress), formatStatPct(stats2026, stats2026.avgStress))}
              ${comparisonRow('Estrés pico', formatStatPct(stats1985, stats1985.avgPeakStress), formatStatPct(statsHybrid, statsHybrid.avgPeakStress), formatStatPct(stats2026, stats2026.avgPeakStress))}
            </div>
          </section>

          <aside class="insight-banner" aria-label="Lectura de clase">
            <span class="insight-icon">∿</span>
            <p>${escapeHtml(insightText)}</p>
          </aside>

          <section id="class-sync-section" class="panel" aria-label="Unificar partidas de toda la clase">
            <div class="panel-head">
              <h2 class="panel-label">UNIFICAR DATOS DE LA CLASE (JSON)</h2>
              <span class="micro-mono-cyan">MULTI-DISPOSITIVO</span>
            </div>
            <p class="panel-subcopy">
              Además de la sincronización en directo por sala, puedes exportar o fusionar manualmente un archivo JSON.
            </p>
            <div class="sync-actions-grid">
              <button type="button" id="btn-copy-json" class="btn-sync">Copiar mi JSON</button>
              <button type="button" id="btn-download-json" class="btn-sync">Descargar .json</button>
              <button type="button" id="btn-import-file" class="btn-sync btn-sync-accent">Cargar archivo .json</button>
              <button type="button" id="btn-toggle-paste-json" class="btn-sync btn-sync-accent">Pegar JSON aquí</button>
            </div>
            <input id="input-import-file" type="file" accept=".json,application/json" hidden />

            ${pasteDrawerOpen ? `
              <div class="paste-drawer">
                <label class="sr-only" for="textarea-import-json">Pega aquí el JSON exportado</label>
                <textarea id="textarea-import-json" class="json-textarea" rows="3" placeholder="Pega aquí el texto JSON de otro compañero..."></textarea>
                <button type="button" id="btn-merge-pasted-json" class="btn-merge-confirm">Fusionar en la tabla y ránking</button>
              </div>
            ` : ''}

            ${syncNotice ? `<p class="sync-notice ${syncError ? 'is-error' : ''}" role="status">${escapeHtml(syncNotice)}</p>` : ''}
          </section>

          <section class="panel-group" aria-label="Historial reciente">
            <div class="panel-head">
              <h2 class="panel-label">HISTORIAL DE PARTIDAS (${totalCount})</h2>
              ${totalCount > 0 ? `<button type="button" id="btn-ask-reset" class="btn-link-danger">Reiniciar datos</button>` : ''}
            </div>

            ${totalCount === 0
              ? `<p class="empty-copy">Todavía no hay partidas guardadas. Juega una partida de 2 minutos (3 fases) para registrar datos.</p>`
              : `<div class="history-list">
                  ${store.records.map((rec) => buildHistoryRowHtml(rec)).join('')}
                </div>`
            }
          </section>
        </main>

        <footer class="sticky-bottom-bar">
          <button type="button" id="btn-change-player" class="btn-footer-secondary">CAMBIAR JUGADOR</button>
          ${lastRecord ? `<button type="button" id="btn-play-again" class="btn-footer-primary">REPETIR (2 MIN)</button>` : ''}
        </footer>

        ${confirmResetOpen ? `
          <div id="reset-confirm-dialog" class="pause-modal" role="dialog" aria-modal="true" aria-labelledby="reset-dialog-title">
            <div class="pause-card">
              <h2 id="reset-dialog-title" class="pause-title">¿BORRAR TELEMETRÍA?</h2>
              <p class="panel-subcopy">Se eliminarán todas las partidas y el ránking local de este navegador.</p>
              <button type="button" id="btn-confirm-reset" class="btn-abort">BORRAR REGISTROS</button>
              <button type="button" id="btn-cancel-reset" class="btn-resume-ghost">CANCELAR</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    bindEvents();
  };

  const bindEvents = () => {
    root.querySelector('#btn-open-profile-from-run')?.addEventListener('click', () => {
      if (lastRecord) onOpenPlayers(lastRecord.initials);
    });

    root.querySelector('#btn-dashboard-shortcut')?.addEventListener('click', () => onOpenDashboard?.());
    root.querySelector('#btn-players-shortcut')?.addEventListener('click', () => onOpenPlayers(null));

    root.querySelectorAll('.history-row-btn').forEach((btn) => {
      btn.addEventListener('click', () => onOpenPlayers(btn.dataset.initials));
    });

    root.querySelector('#btn-change-player')?.addEventListener('click', onReturnToStart);
    root.querySelector('#btn-play-again')?.addEventListener('click', onPlayAgain);

    // Exportar / Importar clase
    root.querySelector('#btn-copy-json')?.addEventListener('click', async () => {
      if (store.records.length === 0) {
        syncError = true;
        syncNotice = 'Aún no hay partidas que exportar.';
        render();
        return;
      }
      try {
        await navigator.clipboard.writeText(store.exportJSON());
        syncError = false;
        syncNotice = `JSON con ${store.records.length} partidas copiado al portapapeles.`;
      } catch {
        syncError = true;
        syncNotice = 'No se pudo acceder al portapapeles. Usa "Descargar .json".';
      }
      render();
    });

    root.querySelector('#btn-download-json')?.addEventListener('click', () => {
      if (store.records.length === 0) {
        syncError = true;
        syncNotice = 'Aún no hay partidas que descargar.';
        render();
        return;
      }
      const blob = new Blob([store.exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `panic-director-telemetria-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      syncError = false;
      syncNotice = `Descargado archivo con ${store.records.length} registros.`;
      render();
    });

    const fileInput = root.querySelector('#input-import-file');
    root.querySelector('#btn-import-file')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const added = store.importAndMergeJSON(text);
        syncError = false;
        syncNotice = added > 0
          ? `Se fusionaron ${added} partidas nuevas en la comparativa y el ránking.`
          : 'Archivo leído: todas las partidas ya estaban registradas.';
      } catch {
        syncError = true;
        syncNotice = 'Archivo JSON inválido o con formato incompatible.';
      }
      render();
    });

    root.querySelector('#btn-toggle-paste-json')?.addEventListener('click', () => {
      pasteDrawerOpen = !pasteDrawerOpen;
      render();
    });

    root.querySelector('#btn-merge-pasted-json')?.addEventListener('click', () => {
      const raw = root.querySelector('#textarea-import-json')?.value || '';
      try {
        const added = store.importAndMergeJSON(raw);
        syncError = false;
        syncNotice = added > 0
          ? `¡Listo! Se fusionaron ${added} partidas nuevas.`
          : 'Las partidas pegadas ya figuraban en este navegador.';
        pasteDrawerOpen = false;
      } catch {
        syncError = true;
        syncNotice = 'JSON no válido. Asegúrate de pegar el texto completo.';
      }
      render();
    });

    root.querySelector('#btn-ask-reset')?.addEventListener('click', () => {
      confirmResetOpen = true;
      render();
    });

    root.querySelector('#btn-cancel-reset')?.addEventListener('click', () => {
      confirmResetOpen = false;
      render();
    });

    root.querySelector('#btn-confirm-reset')?.addEventListener('click', () => {
      store.clearAll();
      confirmResetOpen = false;
      syncNotice = '';
      render();
    });

    root.querySelector('#btn-force-resync')?.addEventListener('click', async () => {
      if (liveSync) {
        await liveSync.publishRoomSnapshot();
        if (lastRecord) await liveSync.publishRunFinish(lastRecord);
        syncError = false;
        syncNotice = `Sincronizadas ${store.records.length} partidas con la sala ${roomCode}.`;
        render();
      }
    });
  };

  render();

  const unsub = liveSync
    ? liveSync.subscribe(() => {
        if (!pasteDrawerOpen && !confirmResetOpen) {
          render();
        }
      })
    : null;

  return () => {
    if (unsub) unsub();
  };
}

function buildRunSummaryHtml(rec, roomCode = 'CLASE') {
  const modeDef = GAME_MODE_MAP[rec.mode] || GAME_MODE_MAP.unified;
  const statusColor = rec.didSurvive ? RELICARIO_PALETTE.graceJade : RELICARIO_PALETTE.vermilion;
  const stressColor = stressTierFromIndex(rec.averageStress).color;
  const reachedPhase = rec.reachedPhase || (rec.survivedSeconds >= 80 ? 3 : rec.survivedSeconds >= 40 ? 2 : 1);

  const phaseBreakdownHtml = rec.phaseBreakdown
    ? `
      <div class="run-phases-mini-grid">
        ${CAMPAIGN_PHASES.map((ph) => {
          const st = rec.phaseBreakdown[ph.id];
          const entered = st?.entered;
          return `
            <div class="run-phase-mini-card" style="border-color:${entered ? ph.accentColor : 'rgba(255,255,255,0.12)'}; opacity:${entered ? '1' : '0.48'};">
              <span class="run-phase-mini-hdr" style="color:${ph.accentColor};">F${ph.phaseNumber} · ${escapeHtml(ph.shortBadge)}</span>
              <strong class="run-phase-mini-val">${entered ? `${Number(st.survivedSeconds).toFixed(1)}s · ${st.kills}B` : 'No alcanzada'}</strong>
              <span class="run-phase-mini-sub">${entered ? `Estrés ${Math.round(st.averageStress)}%` : escapeHtml(ph.windowLabel)}</span>
            </div>
          `;
        }).join('')}
      </div>
    `
    : '';

  return `
    <section class="panel" style="border-color:${statusColor}8C;" aria-label="Resumen de última partida">
      <div class="run-summary-top">
        <div class="run-summary-left">
          ${rec.avatar ? renderAvatarSVG(rec.avatar, 28, true) : ''}
          <button type="button" id="btn-open-profile-from-run" class="initials-link-pill">
            <span>${escapeHtml(rec.initials)}</span>
            <span class="mini-icon">☺</span>
          </button>
          <span class="run-mode-label" style="color:${modeDef.accentColor};">FASE ${reachedPhase}/3 ALCANZADA</span>
        </div>
        <span class="status-pill" style="color:${statusColor}; background:${statusColor}2E;">
          ${rec.didSurvive ? 'VICTORIA 2:00' : `FASE ${reachedPhase}`}
        </span>
      </div>

      <h1 class="result-headline" style="color:${statusColor};">
        ${rec.didSurvive ? '¡SOBREVIVISTE LOS 2 MINUTOS!' : `CAÍDO A LOS ${rec.survivedSeconds.toFixed(1)}s`}
      </h1>

      <div class="kpi-strip-4">
        ${metricPillHtml('TIEMPO', `${rec.survivedSeconds.toFixed(1)}s`, RELICARIO_PALETTE.ivory)}
        ${metricPillHtml('BAJAS', `${rec.kills}`, RELICARIO_PALETTE.coldSilver)}
        ${metricPillHtml('ESTRÉS MEDIO', `${Math.round(rec.averageStress)}%`, stressColor)}
        ${metricPillHtml('CURAS', `${rec.medkitsCollected || 0}`, RELICARIO_PALETTE.graceJade)}
      </div>

      ${phaseBreakdownHtml}

      <div class="run-live-synced-note">
        <span class="pulse-dot"></span>
        <span>Enviado en vivo a la sala <strong>${escapeHtml(roomCode)}</strong></span>
        <button type="button" id="btn-force-resync" class="btn-resync-inline">Re-enviar</button>
      </div>
    </section>
  `;
}

function metricPillHtml(label, value, color) {
  return `
    <div class="metric-cell">
      <span class="metric-label">${label}</span>
      <span class="metric-val" style="color:${color};">${escapeHtml(value)}</span>
    </div>
  `;
}

function comparisonRow(label, val1985, valHybrid, val2026) {
  return `
    <div class="cmp-row" role="row">
      <span role="cell" class="cmp-label">${escapeHtml(label)}</span>
      <span role="cell" class="cmp-num" style="color:${RELICARIO_PALETTE.oldBone};">${escapeHtml(val1985)}</span>
      <span role="cell" class="cmp-num" style="color:${RELICARIO_PALETTE.liturgicalGold};">${escapeHtml(valHybrid)}</span>
      <span role="cell" class="cmp-num" style="color:${RELICARIO_PALETTE.ivory};">${escapeHtml(val2026)}</span>
    </div>
  `;
}

function buildHistoryRowHtml(rec) {
  const reachedPhase = rec.reachedPhase || (rec.survivedSeconds >= 80 ? 3 : rec.survivedSeconds >= 40 ? 2 : 1);
  const phaseDef = CAMPAIGN_PHASES[Math.min(2, Math.max(0, reachedPhase - 1))];
  const timeColor = rec.didSurvive ? RELICARIO_PALETTE.graceJade : RELICARIO_PALETTE.vermilion;
  const stressColor = stressTierFromIndex(rec.averageStress).color;

  return `
    <button type="button" class="history-row-btn" data-initials="${escapeHtml(rec.initials)}">
      <span class="hist-left">
        ${rec.avatar ? renderAvatarSVG(rec.avatar, 22, false) : `<span class="monogram-dot">·</span>`}
        <strong class="hist-initials">${escapeHtml(rec.initials)}</strong>
        <span class="mode-badge-sm" style="color:${phaseDef.accentColor}; background:${phaseDef.accentColor}26;">
          F${reachedPhase}·${escapeHtml(phaseDef.shortBadge)}
        </span>
      </span>
      <span class="hist-right">
        <span class="hist-sec" style="color:${timeColor};">${rec.survivedSeconds.toFixed(1)}s</span>
        <span class="hist-kills">${rec.kills}B</span>
        <span class="hist-stress" style="color:${stressColor};">${Math.round(rec.averageStress)}%</span>
        <span class="chevron-right">›</span>
      </span>
    </button>
  `;
}

function buildClassInsightText(stats1985, stats2026, statsHybrid, totalCount) {
  if (stats1985.runCount > 0 && (statsHybrid.runCount > 0 || stats2026.runCount > 0)) {
    return `Con ${totalCount} partidas registradas: la Fase 1 (1985) se supera el ${Math.round(stats1985.survivalRatePercent)}% de las veces (${Math.round(stats1985.avgStress)}% estrés), la Fase 2 (Híbrido) el ${Math.round(statsHybrid.survivalRatePercent)}% (${Math.round(statsHybrid.avgStress)}% estrés) y la Fase 3 (IA Directora) el ${Math.round(stats2026.survivalRatePercent)}% (${Math.round(stats2026.avgStress)}% estrés).`;
  }
  return 'Cada partida de 2 minutos atraviesa las 3 fases (0-40s Modo 1985, 40s-1m20s Híbrido y 1m20s-2m00s IA Directora) y alimenta automáticamente esta comparativa.';
}
