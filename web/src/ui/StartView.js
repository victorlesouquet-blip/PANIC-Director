// Pantalla de Inicio Recreativa (Iniciales, 12 Avatares 3D, 3 Motores de IA y Accesos de Telemetría)

import {
  GAME_MODES,
  GAME_MODE_MAP,
  PLAYER_AVATARS,
  PLAYER_AVATAR_MAP,
  RELICARIO_PALETTE
} from '../engine/constants.js';
import { renderAvatarSVG } from '../scene/avatarSVGs.js';
import { escapeHtml } from './domUtils.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function mountStartView(root, state, actions) {
  const modeDef = GAME_MODE_MAP[state.selectedMode] || GAME_MODES[1];
  const avatarDef = PLAYER_AVATAR_MAP[state.selectedAvatar] || PLAYER_AVATARS[0];
  const initialsArr = [...state.initialsChars];

  const startFg = state.selectedMode === 'director2026' ? RELICARIO_PALETTE.ivory : '#080606';

  root.innerHTML = `
    <main class="screen-shell start-screen" aria-labelledby="main-title">
      <header class="start-header">
        <div class="emblem-row">
          <svg class="reliquary-emblem" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <polygon points="12,1 23,12 12,23 1,12" fill="none" stroke="${RELICARIO_PALETTE.vermilion}" stroke-width="1.9" />
            <ellipse cx="12" cy="12" rx="3.2" ry="4.8" fill="${RELICARIO_PALETTE.liturgicalGold}" />
          </svg>
          <span class="kicker-text">LABORATORIO DE IA · EDICIÓN 3D · 60s</span>
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

      <section class="panel" aria-label="Iniciales del jugador">
        <div class="panel-head">
          <h2 class="panel-label">INICIALES DEL JUGADOR</h2>
          <label class="direct-input-wrap" for="input-initials-direct">
            <span class="micro-mono-muted">TECLADO</span>
            <input
              id="input-initials-direct"
              class="direct-initials-input"
              type="text"
              maxlength="3"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              value="${escapeHtml(initialsArr.join(''))}"
              aria-label="Escribir 3 iniciales"
            />
          </label>
        </div>

        <div class="wheels-row" role="group" aria-label="Ruleta de iniciales arcade">
          ${initialsArr
            .map(
              (ch, idx) => `
              <div class="letter-wheel" data-wheel-index="${idx}">
                <button type="button" id="btn-wheel-up-${idx}" class="wheel-step" data-step="1" data-idx="${idx}" aria-label="Siguiente letra posición ${idx + 1}">▲</button>
                <button type="button" id="btn-wheel-letter-${idx}" class="wheel-char" data-step="1" data-idx="${idx}" aria-label="Letra ${idx + 1}: ${escapeHtml(ch)}">${escapeHtml(ch)}</button>
                <button type="button" id="btn-wheel-down-${idx}" class="wheel-step" data-step="-1" data-idx="${idx}" aria-label="Letra anterior posición ${idx + 1}">▼</button>
              </div>
            `
            )
            .join('')}
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

      <section class="panel-group" aria-label="Selección de motor de IA">
        <h2 class="panel-label standalone-label">SELECCIONA MOTOR DE IA</h2>
        <div class="mode-list" role="radiogroup" aria-label="Motores de IA">
          ${GAME_MODES.map((m) => {
            const isSel = m.id === state.selectedMode;
            return `
              <button
                type="button"
                id="btn-mode-${m.id}"
                class="mode-card ${isSel ? 'is-selected' : ''}"
                data-mode-id="${m.id}"
                role="radio"
                aria-checked="${isSel ? 'true' : 'false'}"
                style="${isSel ? `border-color:${m.accentColor}; background:${m.accentColor}19;` : ''}"
              >
                <span class="mode-radio" style="border-color:${isSel ? m.accentColor : 'rgba(255,255,255,0.28)'}">
                  ${isSel ? `<span class="mode-radio-dot" style="background:${m.accentColor}"></span>` : ''}
                </span>
                <span class="mode-copy">
                  <span class="mode-top-row">
                    <span class="mode-title">${escapeHtml(m.displayTitle)}</span>
                    <span class="mode-badge" style="color:${m.accentColor}; background:${m.accentColor}26;">${escapeHtml(m.shortBadge)}</span>
                  </span>
                  <span class="mode-sub">${escapeHtml(m.subtitle)}</span>
                </span>
              </button>
            `;
          }).join('')}
        </div>
      </section>

      <div class="start-actions">
        <button
          type="button"
          id="btn-start-game"
          class="btn-primary-cta"
          style="background:${modeDef.accentColor}; color:${startFg};"
        >
          ▶ INICIAR PARTIDA 3D (60s)
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

  // Eventos de ruleta arcade
  root.querySelectorAll('.wheel-step, .wheel-char').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const step = Number(btn.dataset.step);
      const curIdx = Math.max(0, ALPHABET.indexOf(state.initialsChars[idx]));
      const nextIdx = (curIdx + step + ALPHABET.length) % ALPHABET.length;
      state.initialsChars[idx] = ALPHABET[nextIdx];
      actions.onUpdateInitials([...state.initialsChars]);
    });
  });

  // Entrada directa por teclado físico / móvil
  const directInput = root.querySelector('#input-initials-direct');
  directInput.addEventListener('input', (e) => {
    const cleaned = String(e.target.value || '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 3);
    e.target.value = cleaned;
    if (cleaned.length > 0) {
      const padded = cleaned.padEnd(3, state.initialsChars.join('').slice(cleaned.length) || 'A');
      const nextChars = [padded[0] || 'A', padded[1] || 'A', padded[2] || 'A'];
      actions.onUpdateInitials(nextChars, { skipRerender: true });
      nextChars.forEach((ch, idx) => {
        const el = root.querySelector(`#btn-wheel-letter-${idx}`);
        if (el) el.textContent = ch;
      });
    }
  });

  // Avatares
  root.querySelectorAll('.avatar-tile').forEach((btn) => {
    btn.addEventListener('click', () => {
      actions.onSelectAvatar(btn.dataset.avatarId);
    });
  });

  // Motores
  root.querySelectorAll('.mode-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      actions.onSelectMode(btn.dataset.modeId);
    });
  });

  // Iniciar / Navegación
  root.querySelector('#btn-start-game').addEventListener('click', () => actions.onStartGame());
  root.querySelector('#btn-open-telemetry').addEventListener('click', () => actions.onOpenTelemetry());
  root.querySelector('#btn-open-players').addEventListener('click', () => actions.onOpenPlayers());
  root.querySelector('#btn-open-dashboard')?.addEventListener('click', () => actions.onOpenDashboard?.());
}
