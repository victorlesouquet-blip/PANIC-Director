// Pestaña de Partidas y Resultados:
//  - Resumen directo y claro al terminar de jugar
//  - Resumen general intuitivo de la clase (sin tablas complejas por fases)
//  - Historial reciente y opciones plegables

import { RELICARIO_PALETTE } from '../engine/constants.js';
import { renderAvatarSVG } from '../scene/avatarSVGs.js';
import { bindAppNavEvents, escapeHtml, formatSimpleTime, renderAppNavHtml } from './domUtils.js';

const HISTORY_PREVIEW = 6;

export function mountResultsView(
  root,
  {
    lastRecord,
    store,
    liveSync = null,
    roomCode = 'CLASE',
    onPlayAgain,
    onReturnToStart,
    onOpenPlayers,
    onOpenDashboard,
    onNavigate
  }
) {
  let syncNotice = '';
  let syncError = false;
  let pasteDrawerOpen = false;
  let confirmResetOpen = false;
  let showAllHistory = false;
  let moreOpen = false;

  const navigateTab = (tab) => {
    if (onNavigate) {
      onNavigate(tab);
      return;
    }
    if (tab === 'start') onReturnToStart?.();
    else if (tab === 'players') onOpenPlayers?.(null);
    else if (tab === 'dashboard') onOpenDashboard?.();
  };

  const render = () => {
    const totalCount = store.records.length;
    const survivedCount = store.records.filter((r) => r.didSurvive).length;
    const bestTime = totalCount > 0 ? Math.max(...store.records.map((r) => r.survivedSeconds || 0)) : 0;
    const avgKills =
      totalCount > 0
        ? Math.round(store.records.reduce((s, r) => s + (r.kills || 0), 0) / totalCount)
        : 0;

    const records = showAllHistory ? store.records : store.records.slice(0, HISTORY_PREVIEW);
    const hiddenCount = totalCount - HISTORY_PREVIEW;

    root.innerHTML = `
      <div class="app-page results-layout">
        ${renderAppNavHtml({
          activeTab: 'results',
          playerCount: store.uniquePlayerCount,
          runCount: totalCount,
          roomCode
        })}

        <main class="screen-shell results-scroll">
          ${lastRecord ? buildRunSummaryHtml(lastRecord, roomCode) : ''}

          <section class="panel" aria-label="Resumen general">
            <div class="panel-head">
              <h1 class="telemetry-title">Resumen de partidas</h1>
              <span class="pill-badge-cyan">${totalCount} ${totalCount === 1 ? 'partida' : 'partidas'}</span>
            </div>

            <div class="simple-stats-grid">
              <div class="simple-stat-card">
                <span class="simple-stat-val" style="color:${RELICARIO_PALETTE.ivory};">${totalCount}</span>
                <span class="simple-stat-lbl">Jugadas</span>
              </div>
              <div class="simple-stat-card">
                <span class="simple-stat-val" style="color:${RELICARIO_PALETTE.graceJade};">${survivedCount}</span>
                <span class="simple-stat-lbl">Victorias (2:00)</span>
              </div>
              <div class="simple-stat-card">
                <span class="simple-stat-val" style="color:${RELICARIO_PALETTE.liturgicalGold};">${totalCount > 0 ? formatSimpleTime(bestTime) : '—'}</span>
                <span class="simple-stat-lbl">Mejor tiempo</span>
              </div>
              <div class="simple-stat-card">
                <span class="simple-stat-val" style="color:${RELICARIO_PALETTE.coldSilver};">${totalCount > 0 ? avgKills : '—'}</span>
                <span class="simple-stat-lbl">Kills medias</span>
              </div>
            </div>

            <button type="button" id="btn-players-shortcut" class="players-banner-btn">
              <span class="players-banner-icon">♛</span>
              <span class="players-banner-text">
                <strong>Ver clasificación de jugadores</strong>
                <small>${store.uniquePlayerCount} ${store.uniquePlayerCount === 1 ? 'jugador en el ránking' : 'jugadores en el ránking'}</small>
              </span>
              <span class="chevron-right">›</span>
            </button>
          </section>

          <section class="panel-group" aria-label="Últimas partidas">
            <div class="panel-head">
              <h2 class="panel-label">Últimas partidas</h2>
            </div>
            ${totalCount === 0
              ? `<div class="panel empty-panel">
                  <p class="empty-copy">Todavía no hay partidas guardadas. ¡Juega la primera!</p>
                </div>`
              : `<div class="history-list">${records.map((rec) => buildHistoryRowHtml(rec)).join('')}</div>
                 ${hiddenCount > 0
                   ? `<button type="button" id="btn-toggle-history" class="text-link-btn center-link">${showAllHistory ? 'Mostrar menos' : `Ver las ${totalCount} partidas`}</button>`
                   : ''}`
            }
          </section>

          <details id="more-options" class="more-options" ${moreOpen ? 'open' : ''}>
            <summary>Opciones de datos y sala</summary>
            <div class="more-options-body">
              <p class="panel-subcopy">Comparte partidas por archivo o gestiona los datos de la sala <strong>${escapeHtml(roomCode)}</strong>.</p>

              <button type="button" id="btn-dashboard-shortcut" class="btn-sync btn-sync-accent btn-block">📺 Abrir vista de sala / proyector</button>

              <div class="sync-actions-grid">
                <button type="button" id="btn-copy-json" class="btn-sync">Copiar datos</button>
                <button type="button" id="btn-download-json" class="btn-sync">Descargar .json</button>
                <button type="button" id="btn-import-file" class="btn-sync btn-sync-accent">Cargar archivo</button>
                <button type="button" id="btn-toggle-paste-json" class="btn-sync btn-sync-accent">Pegar datos</button>
              </div>
              <input id="input-import-file" type="file" accept=".json,application/json" hidden />

              ${pasteDrawerOpen ? `
                <div class="paste-drawer">
                  <label class="sr-only" for="textarea-import-json">Pega aquí el JSON exportado</label>
                  <textarea id="textarea-import-json" class="json-textarea" rows="3" placeholder="Pega aquí los datos copiados de otro dispositivo..."></textarea>
                  <button type="button" id="btn-merge-pasted-json" class="btn-merge-confirm">Añadir partidas</button>
                </div>
              ` : ''}

              ${syncNotice ? `<p class="sync-notice ${syncError ? 'is-error' : ''}" role="status">${escapeHtml(syncNotice)}</p>` : ''}

              ${liveSync ? `<button type="button" id="btn-force-resync" class="btn-sync btn-block">Sincronizar ahora con la sala</button>` : ''}
              ${totalCount > 0 ? `<button type="button" id="btn-ask-reset" class="btn-link-danger center-link">Borrar historial de este navegador</button>` : ''}
            </div>
          </details>
        </main>

        <footer class="sticky-bottom-bar">
          <button type="button" id="btn-change-player" class="btn-footer-secondary">${lastRecord ? 'Cambiar jugador' : 'Ir a Inicio'}</button>
          <button type="button" id="btn-play-again" class="btn-footer-primary">▶ ${lastRecord ? 'Jugar otra vez' : 'Jugar ahora'}</button>
        </footer>

        ${confirmResetOpen ? `
          <div id="reset-confirm-dialog" class="pause-modal" role="dialog" aria-modal="true" aria-labelledby="reset-dialog-title">
            <div class="pause-card">
              <h2 id="reset-dialog-title" class="pause-title">¿Borrar historial?</h2>
              <p class="panel-subcopy">Se eliminarán las partidas guardadas en este navegador.</p>
              <button type="button" id="btn-confirm-reset" class="btn-abort">Sí, borrar todo</button>
              <button type="button" id="btn-cancel-reset" class="btn-resume-ghost">Cancelar</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    bindEvents();
  };

  const bindEvents = () => {
    bindAppNavEvents(root, navigateTab);

    root.querySelector('#btn-open-profile-from-run')?.addEventListener('click', () => {
      if (lastRecord) onOpenPlayers(lastRecord.initials);
    });

    root.querySelector('#btn-dashboard-shortcut')?.addEventListener('click', () => onOpenDashboard?.());
    root.querySelector('#btn-players-shortcut')?.addEventListener('click', () => onOpenPlayers(null));

    root.querySelectorAll('.history-row-btn').forEach((btn) => {
      btn.addEventListener('click', () => onOpenPlayers(btn.dataset.initials));
    });

    root.querySelector('#btn-toggle-history')?.addEventListener('click', () => {
      showAllHistory = !showAllHistory;
      render();
    });

    root.querySelector('#more-options')?.addEventListener('toggle', (e) => {
      moreOpen = e.target.open;
    });

    root.querySelector('#btn-change-player')?.addEventListener('click', onReturnToStart);
    root.querySelector('#btn-play-again')?.addEventListener('click', onPlayAgain);

    // Exportar / Importar
    root.querySelector('#btn-copy-json')?.addEventListener('click', async () => {
      if (store.records.length === 0) {
        syncError = true;
        syncNotice = 'Aún no hay partidas que copiar.';
        render();
        return;
      }
      try {
        await navigator.clipboard.writeText(store.exportJSON());
        syncError = false;
        syncNotice = `${store.records.length} partidas copiadas al portapapeles.`;
      } catch {
        syncError = true;
        syncNotice = 'No se pudo copiar. Usa "Descargar .json".';
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
      a.download = `panic-director-partidas-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      syncError = false;
      syncNotice = `Archivo descargado con ${store.records.length} partidas.`;
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
          ? `Se añadieron ${added} partidas nuevas.`
          : 'Todas las partidas del archivo ya estaban guardadas.';
      } catch {
        syncError = true;
        syncNotice = 'Archivo no válido.';
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
          ? `Listo: se añadieron ${added} partidas nuevas.`
          : 'Esas partidas ya estaban guardadas.';
        pasteDrawerOpen = false;
      } catch {
        syncError = true;
        syncNotice = 'Datos no válidos. Pega el texto completo.';
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
  const statusColor = rec.didSurvive ? RELICARIO_PALETTE.graceJade : RELICARIO_PALETTE.vermilion;
  const progressPct = Math.min(100, Math.round((rec.survivedSeconds / 120) * 100));

  return `
    <section class="panel run-card" style="border-color:${statusColor}8C;" aria-label="Resumen de tu partida">
      <div class="run-summary-top">
        <div class="run-summary-left">
          ${rec.avatar ? renderAvatarSVG(rec.avatar, 30, true) : ''}
          <button type="button" id="btn-open-profile-from-run" class="initials-link-pill" title="Ver mi perfil">
            <span>${escapeHtml(rec.initials)}</span>
          </button>
        </div>
        <span class="status-pill" style="color:${statusColor}; background:${statusColor}26;">
          ${rec.didSurvive ? '★ ¡Victoria!' : `${progressPct}% completado`}
        </span>
      </div>

      <h2 class="result-headline" style="color:${statusColor};">
        ${rec.didSurvive ? '¡Sobreviviste los 2 minutos!' : `Aguantaste ${formatSimpleTime(rec.survivedSeconds)}`}
      </h2>

      <div class="kpi-strip-3">
        ${metricPillHtml('Tiempo', formatSimpleTime(rec.survivedSeconds), RELICARIO_PALETTE.ivory)}
        ${metricPillHtml('Kills', `${rec.kills}`, RELICARIO_PALETTE.coldSilver)}
        ${metricPillHtml('Curas', `${rec.medkitsCollected || 0}`, RELICARIO_PALETTE.graceJade)}
      </div>

      <p class="run-live-note">
        <span class="pulse-dot"></span>
        Resultado enviado a la sala <strong>${escapeHtml(roomCode)}</strong>
      </p>
    </section>
  `;
}

function metricPillHtml(label, value, color) {
  return `
    <div class="metric-cell">
      <span class="metric-label">${escapeHtml(label)}</span>
      <span class="metric-val" style="color:${color};">${escapeHtml(value)}</span>
    </div>
  `;
}

function buildHistoryRowHtml(rec) {
  const timeColor = rec.didSurvive ? RELICARIO_PALETTE.graceJade : RELICARIO_PALETTE.ivory;

  return `
    <button type="button" class="history-row-btn" data-initials="${escapeHtml(rec.initials)}">
      <span class="hist-left">
        ${rec.avatar ? renderAvatarSVG(rec.avatar, 24, false) : `<span class="monogram-dot">·</span>`}
        <strong class="hist-initials">${escapeHtml(rec.initials)}</strong>
        ${rec.didSurvive ? `<span class="mode-badge-sm" style="color:${RELICARIO_PALETTE.graceJade}; background:${RELICARIO_PALETTE.graceJade}22;">★ Victoria</span>` : ''}
      </span>
      <span class="hist-right">
        <span class="hist-sec" style="color:${timeColor};">${formatSimpleTime(rec.survivedSeconds)}</span>
        <span class="hist-kills">${rec.kills} kills</span>
        <span class="chevron-right">›</span>
      </span>
    </button>
  `;
}
