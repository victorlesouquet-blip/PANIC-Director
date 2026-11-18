// Pantalla de Inicio (Nombre de Jugador, 12 Avatares 3D, Campaña Progresiva 3 Fases y Accesos de Telemetría)

import {
  CAMPAIGN_PHASES,
  PLAYER_AVATARS,
  PLAYER_AVATAR_MAP,
  RELICARIO_PALETTE
} from '../engine/constants.js';
import { renderAvatarSVG } from '../scene/avatarSVGs.js';
import { escapeHtml } from './domUtils.js';

export function mountStartView(root, state, actions) {
  const avatarDef = PLAYER_AVATAR_MAP[state.selectedAvatar] || PLAYER_AVATARS[0];
  const currentName = String(state.playerName || '').trim();

  root.innerHTML = `
    <main class="screen-shell start-screen" aria-labelledby="main-title">
      <header class="start-header">
        <div class="emblem-row">
          <svg class="reliquary-emblem" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <polygon points="12,1 23,12 12,23 1,12" fill="none" stroke="${RELICARIO_PALETTE.vermilion}" stroke-width="1.9" />
            <ellipse cx="12" cy="12" rx="3.2" ry="4.8" fill="${RELICARIO_PALETTE.liturgicalGold}" />
          </svg>
          <span class="kicker-text">LABORATORIO DE IA · EDICIÓN 3D · 2 MIN (3 FASES)</span>
        </div>
        <h1 id="main-title" class="hero-title">PANIC DIRECTOR</h1>
        <p class="hero-subtitle">Relicario de Ceniza y Carmesí</p>
        ${state.roomCode ? `
          <div class="start-live-room-bar">
            <span class="pulse-dot"></span>
            <span>SALA EN TIEMPO REAL: <strong>${escapeHtml(state.roomCode)}</strong></span>
          </div>
        ` : ''}
      </header>

      <section class="panel player-name-panel" aria-label="Nombre del jugador">
        <div class="panel-head">
          <label class="panel-label" for="input-player-name">TU NOMBRE DE JUGADOR</label>
          <span class="micro-mono-gold">RÁNKING EN VIVO</span>
        </div>

        <div id="player-name-field-wrap" class="player-name-field-wrap">
          <span class="player-name-icon" aria-hidden="true">☺</span>
          <input
            id="input-player-name"
            class="player-name-input"
            type="text"
            maxlength="18"
            autocomplete="name"
            autocapitalize="words"
            spellcheck="false"
            placeholder="Escribe tu nombre (ej. Víctor, Lucía...)"
            value="${escapeHtml(state.playerName || '')}"
            aria-label="Escribe tu nombre de jugador"
          />
          <button
            type="button"
            id="btn-clear-player-name"
            class="player-name-clear-btn"
            aria-label="Borrar nombre"
            ${currentName ? '' : 'hidden'}
          >✕</button>
        </div>

        <p id="player-name-error" class="player-name-error-msg" hidden role="alert">
          ⚠️ Escribe tu nombre arriba para aparecer en el ránking en tiempo real de la clase.
        </p>

        <div class="player-name-preview-bar">
          ${renderAvatarSVG(avatarDef.id, 22, true)}
          <span>En el proyector saldrás como: <strong id="player-name-preview-text" style="color:${RELICARIO_PALETTE.ivory};">${escapeHtml(currentName ? currentName.toUpperCase() : 'TU NOMBRE')}</strong></span>
        </div>
      </section>

      <section class="panel" aria-label="Selección de avatar">
        <div class="panel-head">
          <h2 class="panel-label">ELIGE TU AVATAR 3D</h2>
          <span class="micro-mono-gold">12 ARQUETIPOS</span>
        </div>

        <div class="avatar-preview-strip" style="border-color: ${avatarDef.auraColor}66;">
          <div class="avatar-preview-frame" style="border-color: ${avatarDef.auraColor};">
            ${renderAvatarSVG(avatarDef.id, 48, true)}
          </div>
          <div class="avatar-preview-info">
            <div class="avatar-preview-name">${escapeHtml(avatarDef.displayName.toUpperCase())}</div>
            <div class="avatar-preview-desc">${escapeHtml(avatarDef.roleSubtitle)}</div>
          </div>
        </div>

        <div class="avatar-grid" role="radiogroup" aria-label="Avatares disponibles">
          ${PLAYER_AVATARS.map((av) => {
            const isSel = av.id === state.selectedAvatar;
            return `
              <button
                type="button"
                id="btn-avatar-${av.id}"
                class="avatar-tile ${isSel ? 'is-selected' : ''}"
                data-avatar-id="${av.id}"
                role="radio"
                aria-checked="${isSel ? 'true' : 'false'}"
                style="${isSel ? `border-color:${av.auraColor}; background:${av.auraColor}24;` : ''}"
              >
                ${renderAvatarSVG(av.id, 34, isSel)}
                <span class="avatar-tile-label">${escapeHtml(av.shortLabel)}</span>
              </button>
            `;
          }).join('')}
        </div>
      </section>

      <section class="panel campaign-roadmap-panel" aria-label="Modo Único Progresivo de 2 Minutos">
        <div class="panel-head">
          <h2 class="panel-label gold-label">MODO ÚNICO · EVOLUCIÓN 3 FASES (2 MIN)</h2>
          <span class="micro-mono-cyan">DIFICULTAD CRECIENTE</span>
        </div>

        <div class="campaign-timeline">
          ${CAMPAIGN_PHASES.map((ph, idx) => `
            <div class="campaign-step" style="border-left-color:${ph.accentColor};">
              <div class="campaign-step-top">
                <span class="campaign-step-time" style="color:${ph.accentColor}; background:${ph.accentColor}24;">
                  ${escapeHtml(ph.windowLabel)}
                </span>
                <strong class="campaign-step-title">${escapeHtml(ph.displayTitle)}</strong>
                <span class="campaign-step-badge" style="color:${ph.accentColor};">F${ph.phaseNumber}</span>
              </div>
              <p class="campaign-step-sub">${escapeHtml(ph.subtitle)}</p>
            </div>
            ${idx < CAMPAIGN_PHASES.length - 1 ? `
              <div class="campaign-truce-divider" aria-label="Pausa de transición de 5 segundos">
                <span>⏱ PAUSA DE 5s CON CUENTA ATRÁS · SIN ATAQUES AL CAMBIAR DE FASE</span>
              </div>
            ` : ''}
          `).join('')}
        </div>
      </section>

      <div class="start-actions">
        <button
          type="button"
          id="btn-start-game"
          class="btn-primary-cta"
          style="background:${RELICARIO_PALETTE.vermilion}; color:${RELICARIO_PALETTE.ivory};"
        >
          ▶ INICIAR PARTIDA 3D (2 MIN · 3 FASES)
        </button>

        <p class="controls-caption">
          <strong>Móvil:</strong> arrastra el pulgar donde quieras &nbsp;·&nbsp;
          <strong>PC:</strong> WASD / Flechas o ratón &nbsp;·&nbsp;
          <strong>Auto-disparo</strong>
        </p>

        <nav class="secondary-nav-row" aria-label="Pantallas de datos">
          <button type="button" id="btn-open-telemetry" class="btn-secondary-nav btn-nav-cyan">
            <span>▮ Telemetría (${state.recordedCount})</span>
          </button>
          <button type="button" id="btn-open-players" class="btn-secondary-nav btn-nav-gold">
            <span>★ Jugadores (${state.uniquePlayerCount})</span>
          </button>
        </nav>

        <button type="button" id="btn-open-dashboard" class="btn-projector-banner">
          <span class="projector-icon">📺</span>
          <span class="projector-copy">
            <strong>DASHBOARD EN VIVO DE CLASE (QR + RÁNKING)</strong>
            <small>Pantalla panorámica para proyectar en clase en tiempo real</small>
          </span>
          <span class="chevron-right">›</span>
        </button>
      </div>
    </main>
  `;

  const nameInput = root.querySelector('#input-player-name');
  const clearBtn = root.querySelector('#btn-clear-player-name');
  const previewText = root.querySelector('#player-name-preview-text');
  const errorMsg = root.querySelector('#player-name-error');
  const fieldWrap = root.querySelector('#player-name-field-wrap');

  const syncNameUi = (rawVal) => {
    const cleaned = String(rawVal || '').replace(/[<>&"']/g, '').slice(0, 18);
    const trimmed = cleaned.trim();
    if (previewText) {
      previewText.textContent = trimmed ? trimmed.toUpperCase() : 'TU NOMBRE';
    }
    if (clearBtn) {
      clearBtn.hidden = !trimmed;
    }
    if (trimmed && errorMsg && !errorMsg.hidden) {
      errorMsg.hidden = true;
      fieldWrap?.classList.remove('is-invalid');
    }
    actions.onUpdatePlayerName(cleaned, { skipRerender: true });
  };

  nameInput?.addEventListener('input', (e) => {
    syncNameUi(e.target.value);
  });

  clearBtn?.addEventListener('click', () => {
    if (nameInput) {
      nameInput.value = '';
      syncNameUi('');
      nameInput.focus();
    }
  });

  const handleTryStart = () => {
    const current = String(nameInput?.value || '').trim();
    if (!current) {
      if (errorMsg) errorMsg.hidden = false;
      fieldWrap?.classList.add('is-invalid');
      nameInput?.focus();
      nameInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    actions.onUpdatePlayerName(current, { skipRerender: true });
    actions.onStartGame();
  };

  nameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTryStart();
    }
  });

  // Avatares
  root.querySelectorAll('.avatar-tile').forEach((btn) => {
    btn.addEventListener('click', () => {
      actions.onSelectAvatar(btn.dataset.avatarId);
    });
  });

  // Iniciar / Navegación
  root.querySelector('#btn-start-game').addEventListener('click', handleTryStart);
  root.querySelector('#btn-open-telemetry').addEventListener('click', () => actions.onOpenTelemetry());
  root.querySelector('#btn-open-players').addEventListener('click', () => actions.onOpenPlayers());
  root.querySelector('#btn-open-dashboard')?.addEventListener('click', () => actions.onOpenDashboard?.());
}
