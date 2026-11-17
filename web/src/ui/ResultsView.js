// Vista de Resultados, Telemetría Comparativa de Clase (1985 vs 2026 vs Híbrido) y Unificación JSON

import { GAME_MODE_MAP, RELICARIO_PALETTE, stressTierFromIndex } from '../engine/constants.js';
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

export function mountResultsView(root, { lastRecord, store, onPlayAgain, onReturnToStart, onOpenPlayers }) {
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
      ? buildRunSummaryHtml(lastRecord)
      : `
        <header class="panel telemetry-head-card">
          <div>
            <h1 class="telemetry-title">TELEMETRÍA DE CLASE</h1>
            <p class="panel-subcopy">Comparativa acumulada y unificación JSON</p>
          </div>
          <span class="pill-badge-cyan">${totalCount} REG.</span>
        </header>
      `;

    const insightText = buildClassInsightText(stats1985, stats2026, statsHybrid, totalCount);

    root.innerHTML = `
      <div class="results-layout">
        <main class="screen-shell results-scroll">
          ${topSectionHtml}

          <button type="button" id="btn-players-shortcut" class="players-banner-btn">
            <span class="players-banner-icon">★</span>
            <span class="players-banner-text">
              <strong>JUGADORES Y RÁNKING DE MEDIAS</strong>
              <small>${store.uniquePlayerCount} ${store.uniquePlayerCount === 1 ? 'jugador registrado' : 'jugadores registrados'} · Toca para ver perfiles</small>
            </span>
            <span class="chevron-right">›</span>
          </button>

          <section class="panel" aria-label="Comparativa entre los 3 motores de IA">
            <div class="panel-head">
              <h2 class="panel-label gold-label">COMPARATIVA 1985 · 2026 · HÍBR.</h2>
              <span class="micro-mono-muted">EN VIVO</span>
            </div>

            <div class="comparison-table" role="table" aria-label="Tabla comparativa de motores">
              <div class="cmp-row cmp-header" role="row">
                <span role="columnheader">MÉTRICA</span>
                <span role="columnheader" style="color:${RELICARIO_PALETTE.oldBone};">1985</span>
                <span role="columnheader" style="color:${RELICARIO_PALETTE.vermilion};">2026</span>
                <span role="columnheader" style="color:${RELICARIO_PALETTE.liturgicalGold};">HÍBR.</span>
              </div>
              ${comparisonRow('Partidas', `${stats1985.runCount}`, `${stats2026.runCount}`, `${statsHybrid.runCount}`)}
              ${comparisonRow('Superv. 60s', formatStatPct(stats1985, stats1985.survivalRatePercent), formatStatPct(stats2026, stats2026.survivalRatePercent), formatStatPct(statsHybrid, statsHybrid.survivalRatePercent))}
              ${comparisonRow('Tiempo medio', formatStatSec(stats1985, stats1985.avgSurvivedSeconds), formatStatSec(stats2026, stats2026.avgSurvivedSeconds), formatStatSec(statsHybrid, statsHybrid.avgSurvivedSeconds))}
              ${comparisonRow('Bajas medias', formatStatNum(stats1985, stats1985.avgKills), formatStatNum(stats2026, stats2026.avgKills), formatStatNum(statsHybrid, statsHybrid.avgKills))}
              ${comparisonRow('Estrés medio', formatStatPct(stats1985, stats1985.avgStress), formatStatPct(stats2026, stats2026.avgStress), formatStatPct(statsHybrid, statsHybrid.avgStress))}
              ${comparisonRow('Estrés pico', formatStatPct(stats1985, stats1985.avgPeakStress), formatStatPct(stats2026, stats2026.avgPeakStress), formatStatPct(statsHybrid, statsHybrid.avgPeakStress))}
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
              Cada dispositivo guarda sus partidas localmente. Exporta tu JSON o importa el de un compañero para fusionar el ránking sin duplicados.
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
              ? `<p class="empty-copy">Todavía no hay partidas guardadas. Juega una ronda de 60 segundos para registrar datos.</p>`
              : `<div class="history-list">
                  ${store.records.map((rec) => buildHistoryRowHtml(rec)).join('')}
                </div>`
            }
          </section>
        </main>

        <footer class="sticky-bottom-bar">
          <button type="button" id="btn-change-player" class="btn-footer-secondary">CAMBIAR JUGADOR</button>
          ${lastRecord ? `<button type="button" id="btn-play-again" class="btn-footer-primary">REPETIR (60s)</button>` : ''}
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
  };

  render();
}

function buildRunSummaryHtml(rec) {
  const modeDef = GAME_MODE_MAP[rec.mode] || GAME_MODE_MAP.director2026;
  const statusColor = rec.didSurvive ? RELICARIO_PALETTE.graceJade : RELICARIO_PALETTE.vermilion;
  const stressColor = stressTierFromIndex(rec.averageStress).color;

  return `
    <section class="panel" style="border-color:${statusColor}8C;" aria-label="Resumen de última partida">
      <div class="run-summary-top">
        <div class="run-summary-left">
          ${rec.avatar ? renderAvatarSVG(rec.avatar, 28, true) : ''}
          <button type="button" id="btn-open-profile-from-run" class="initials-link-pill">
            <span>${escapeHtml(rec.initials)}</span>
            <span class="mini-icon">☺</span>
          </button>
          <span class="run-mode-label" style="color:${modeDef.accentColor};">${escapeHtml(modeDef.displayTitle)}</span>
        </div>
        <span class="status-pill" style="color:${statusColor}; background:${statusColor}2E;">
          ${rec.didSurvive ? 'COMPLETADA' : 'DERROTA'}
        </span>
      </div>

      <h1 class="result-headline" style="color:${statusColor};">
        ${rec.didSurvive ? '¡SOBREVIVISTE LOS 60s!' : `CAÍDO A LOS ${rec.survivedSeconds.toFixed(1)}s`}
      </h1>

      <div class="kpi-strip-4">
        ${metricPillHtml('TIEMPO', `${rec.survivedSeconds.toFixed(1)}s`, RELICARIO_PALETTE.ivory)}
        ${metricPillHtml('BAJAS', `${rec.kills}`, RELICARIO_PALETTE.coldSilver)}
        ${metricPillHtml('ESTRÉS MEDIO', `${Math.round(rec.averageStress)}%`, stressColor)}
        ${metricPillHtml('CURAS', `${rec.medkitsCollected || 0}`, RELICARIO_PALETTE.graceJade)}
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

function comparisonRow(label, val1985, val2026, valHybrid) {
  return `
    <div class="cmp-row" role="row">
      <span role="cell" class="cmp-label">${escapeHtml(label)}</span>
      <span role="cell" class="cmp-num" style="color:${RELICARIO_PALETTE.oldBone};">${escapeHtml(val1985)}</span>
      <span role="cell" class="cmp-num" style="color:${RELICARIO_PALETTE.ivory};">${escapeHtml(val2026)}</span>
      <span role="cell" class="cmp-num" style="color:${RELICARIO_PALETTE.liturgicalGold};">${escapeHtml(valHybrid)}</span>
    </div>
  `;
}

function buildHistoryRowHtml(rec) {
  const modeDef = GAME_MODE_MAP[rec.mode] || GAME_MODE_MAP.director2026;
  const timeColor = rec.didSurvive ? RELICARIO_PALETTE.graceJade : RELICARIO_PALETTE.vermilion;
  const stressColor = stressTierFromIndex(rec.averageStress).color;

  return `
    <button type="button" class="history-row-btn" data-initials="${escapeHtml(rec.initials)}">
      <span class="hist-left">
        ${rec.avatar ? renderAvatarSVG(rec.avatar, 22, false) : `<span class="monogram-dot">·</span>`}
        <strong class="hist-initials">${escapeHtml(rec.initials)}</strong>
        <span class="mode-badge-sm" style="color:${modeDef.accentColor}; background:${modeDef.accentColor}26;">
          ${escapeHtml(modeDef.shortBadge)}
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
  if (stats1985.runCount > 0 && stats2026.runCount > 0) {
    const delta = stats2026.survivalRatePercent - stats1985.survivalRatePercent;
    const sign = delta >= 0 ? '+' : '';
    const base = `Con ${totalCount} partidas: el Modo 2026 logra ${sign}${Math.round(delta)} pp en supervivencia con ${Math.round(stats2026.avgStress)}% de estrés medio frente al ${Math.round(stats1985.avgStress)}% del Modo 1985.`;
    if (statsHybrid.runCount > 0) {
      return `${base} En Híbrido (${Math.round(statsHybrid.survivalRatePercent)}% superv., ${Math.round(statsHybrid.avgStress)}% estrés) la mezcla eleva el castigo.`;
    }
    return base;
  }
  if (statsHybrid.runCount > 0 && (stats1985.runCount > 0 || stats2026.runCount > 0)) {
    return `El Modo Híbrido registra ${Math.round(statsHybrid.survivalRatePercent)}% de supervivencia y ${Math.round(statsHybrid.avgStress)}% de estrés medio (${statsHybrid.runCount} partidas). Completa pruebas en los 3 motores para la comparativa completa.`;
  }
  return 'Registra partidas en los modos 1985, 2026 e Híbrido con varios compañeros para proyectar la comparativa real en clase.';
}
