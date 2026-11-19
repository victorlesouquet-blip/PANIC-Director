// Pantalla de Inicio: menú superior de pestañas + nombre + avatar + botón JUGAR

import {
  PLAYER_AVATARS,
  PLAYER_AVATAR_MAP,
  RELICARIO_PALETTE
} from '../engine/constants.js';
import { renderAvatarSVG } from '../scene/avatarSVGs.js';
import { bindAppNavEvents, escapeHtml, renderAppNavHtml } from './domUtils.js';

export function mountStartView(root, state, actions) {
  const avatarDef = PLAYER_AVATAR_MAP[state.selectedAvatar] || PLAYER_AVATARS[0];
  const currentName = String(state.playerName || '').trim();

  root.innerHTML = `
    <div class="app-page">
      ${renderAppNavHtml({
        activeTab: 'start',
        playerCount: state.uniquePlayerCount,
        runCount: state.recordedCount,
        roomCode: state.roomCode
      })}

      <main class="screen-shell start-screen" aria-labelledby="main-title">
        <header class="start-header">
          <svg class="reliquary-emblem" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
            <polygon points="12,1 23,12 12,23 1,12" fill="none" stroke="${RELICARIO_PALETTE.vermilion}" stroke-width="1.9" />
            <ellipse cx="12" cy="12" rx="3.2" ry="4.8" fill="${RELICARIO_PALETTE.liturgicalGold}" />
          </svg>
          <h1 id="main-title" class="hero-title">PANIC DIRECTOR</h1>
          <p class="hero-subtitle">Sobrevive 2 minutos en la arena. La intensidad sube sin parar.</p>
        </header>

        <section class="panel start-setup" aria-label="Tu jugador">
          <label class="panel-label" for="input-player-name">Tu nombre</label>

          <div id="player-name-field-wrap" class="player-name-field-wrap">
            <input
              id="input-player-name"
              class="player-name-input"
              type="text"
              maxlength="18"
              autocomplete="name"
              autocapitalize="words"
              spellcheck="false"
              placeholder="Escribe tu nombre"
              value="${escapeHtml(state.playerName || '')}"
              aria-label="Tu nombre de jugador"
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
            Escribe tu nombre para empezar a jugar.
          </p>

          <button
            type="button"
            id="btn-toggle-avatars"
            class="avatar-chip-btn"
            aria-expanded="false"
            aria-controls="avatar-drawer"
            style="border-color:${avatarDef.auraColor}66;"
          >
            ${renderAvatarSVG(avatarDef.id, 38, true)}
            <span class="avatar-chip-copy">
              <span class="avatar-chip-head">
                <strong>${escapeHtml(avatarDef.displayName)}</strong>
                ${avatarDef.passiveBadge ? `<span class="avatar-passive-pill" style="color:${avatarDef.auraColor}; background:${avatarDef.auraColor}22; border-color:${avatarDef.auraColor}66;">${escapeHtml(avatarDef.passiveBadge)}</span>` : ''}
              </span>
              <small>${escapeHtml(avatarDef.roleSubtitle)}</small>
            </span>
            <span id="avatar-chip-action" class="avatar-chip-action">Cambiar avatar</span>
          </button>

          <div id="avatar-drawer" class="avatar-drawer" hidden>
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
                    ${av.passiveBadge ? `<span class="avatar-tile-passive" style="color:${av.auraColor};">${escapeHtml(av.passiveBadge)}</span>` : ''}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        </section>

        <div class="start-actions">
          <button type="button" id="btn-start-game" class="btn-primary-cta btn-primary-cta--xl">
            ▶ Jugar
          </button>

          <p class="controls-caption">
            <strong>Móvil:</strong> arrastra el pulgar &nbsp;·&nbsp;
            <strong>PC:</strong> WASD o flechas &nbsp;·&nbsp;
            Disparo automático
          </p>

          <div class="start-quick-grid">
            <button type="button" id="btn-open-players" class="btn-outline-card">
              <span class="btn-outline-card-icon">♛</span>
              <span class="btn-outline-card-copy">
                <strong>Ránking</strong>
                <small>${state.uniquePlayerCount} ${state.uniquePlayerCount === 1 ? 'jugador' : 'jugadores'}</small>
              </span>
            </button>
            <button type="button" id="btn-open-stats" class="btn-outline-card">
              <span class="btn-outline-card-icon">▮</span>
              <span class="btn-outline-card-copy">
                <strong>Partidas</strong>
                <small class="stats-count">(${state.recordedCount})</small>
              </span>
            </button>
          </div>
        </div>

        <footer class="start-footer">
          ${state.roomCode ? `
            <span class="start-footer-room">
              <span class="pulse-dot"></span>
              Conectado a sala <strong>${escapeHtml(state.roomCode)}</strong>
            </span>
          ` : '<span></span>'}
          <button type="button" id="btn-open-dashboard" class="text-link-btn">Abrir pantalla de sala ›</button>
        </footer>
      </main>
    </div>
  `;

  bindAppNavEvents(root, actions.onNavigate);

  const nameInput = root.querySelector('#input-player-name');
  const clearBtn = root.querySelector('#btn-clear-player-name');
  const errorMsg = root.querySelector('#player-name-error');
  const fieldWrap = root.querySelector('#player-name-field-wrap');

  const syncNameUi = (rawVal) => {
    const cleaned = String(rawVal || '').replace(/[<>&"']/g, '').slice(0, 18);
    const trimmed = cleaned.trim();
    if (clearBtn) clearBtn.hidden = !trimmed;
    if (trimmed && errorMsg && !errorMsg.hidden) {
      errorMsg.hidden = true;
      fieldWrap?.classList.remove('is-invalid');
    }
    actions.onUpdatePlayerName(cleaned, { skipRerender: true });
  };

  nameInput?.addEventListener('input', (e) => syncNameUi(e.target.value));

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

  const toggleBtn = root.querySelector('#btn-toggle-avatars');
  const drawer = root.querySelector('#avatar-drawer');
  const chipAction = root.querySelector('#avatar-chip-action');
  toggleBtn?.addEventListener('click', () => {
    const willOpen = drawer.hidden;
    drawer.hidden = !willOpen;
    toggleBtn.setAttribute('aria-expanded', String(willOpen));
    if (chipAction) chipAction.textContent = willOpen ? 'Cerrar' : 'Cambiar avatar';
  });

  root.querySelectorAll('.avatar-tile').forEach((btn) => {
    btn.addEventListener('click', () => actions.onSelectAvatar(btn.dataset.avatarId));
  });

  root.querySelector('#btn-start-game')?.addEventListener('click', handleTryStart);
  root.querySelector('#btn-open-stats')?.addEventListener('click', () => actions.onOpenTelemetry());
  root.querySelector('#btn-open-players')?.addEventListener('click', () => actions.onOpenPlayers?.());
  root.querySelector('#btn-open-dashboard')?.addEventListener('click', () => actions.onOpenDashboard?.());
}
