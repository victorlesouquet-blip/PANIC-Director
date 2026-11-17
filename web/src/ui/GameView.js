// Vista en Partida 3D + HUD Reactivo + Panel de Estrés en vivo + Joystick Flotante y Modal Pausa

import { GAME_MODE_MAP, PLAYER_AVATAR_MAP, RELICARIO_PALETTE } from '../engine/constants.js';
import { renderAvatarSVG } from '../scene/avatarSVGs.js';
import { PanicArena3D } from '../scene/PanicArena3D.js';
import { escapeHtml } from './domUtils.js';

function formatCountdown(seconds) {
  const t = Math.max(0, seconds);
  if (t < 9.95) return `${t.toFixed(1)}s`;
  return `${Math.ceil(t)}s`;
}

export function mountGameView(root, { initials, modeId, avatarId, audio, onFinishRun }) {
  const modeDef = GAME_MODE_MAP[modeId] || GAME_MODE_MAP.director2026;
  const avatarDef = PLAYER_AVATAR_MAP[avatarId] || PLAYER_AVATARS_FALLBACK(avatarId);

  let initialDirectiveMsg = 'IA activa → Leyendo estrés';
  if (modeId === 'classic1985') initialDirectiveMsg = 'Regla fija [0-15s] → Escalamiento continuo';
  else if (modeId === 'hybrid1985x2026') initialDirectiveMsg = 'Mix 85×26 → Reloj fijo + IA';

  let isPaused = false;
  let isMuted = audio?.muted || false;

  root.innerHTML = `
    <div class="game-viewport">
      <div id="arena-stage" class="arena-stage" aria-label="Arena 3D interactiva"></div>

      <div id="panic-vignette" class="panic-vignette" aria-hidden="true"></div>

      <div id="joystick-ring" class="joystick-ring" aria-hidden="true"></div>
      <div id="joystick-knob" class="joystick-knob" aria-hidden="true"></div>

      <header class="hud-overlay">
        <div class="hud-top-bar">
          <div class="hud-player-col">
            <div class="hud-identity-row">
              ${renderAvatarSVG(avatarDef.id, 24, true)}
              <span class="hud-initials">${escapeHtml(initials)}</span>
              <span id="hud-level" class="hud-level-pill">NV.1</span>
              <span class="hud-mode-pill" style="color:${modeDef.accentColor}; background:${modeDef.accentColor}2E;">
                ${escapeHtml(modeDef.shortBadge)}
              </span>
            </div>
            <div class="hud-hp-row">
              <div class="hp-track">
                <div id="hud-hp-fill" class="hp-fill" style="width:100%; background:${RELICARIO_PALETTE.graceJade};"></div>
              </div>
              <span id="hud-hp-text" class="hud-hp-num">100</span>
            </div>
          </div>

          <div class="hud-timer-col">
            <h1 class="sr-only">Partida en curso — PANIC DIRECTOR</h1>
            <span class="hud-kicker">TIEMPO</span>
            <span id="hud-timer" class="hud-timer-num">60s</span>
          </div>

          <div class="hud-right-col">
            <div class="hud-kills-block">
              <span class="hud-kicker">BAJAS</span>
              <span id="hud-kills" class="hud-kills-num">0</span>
            </div>
            <button type="button" id="btn-mute-toggle" class="hud-icon-btn" aria-label="${isMuted ? 'Activar sonido' : 'Silenciar sonido'}" title="${isMuted ? 'Activar sonido' : 'Silenciar sonido'}">
              ${isMuted ? '🔇' : '🔊'}
            </button>
            <button type="button" id="btn-pause-toggle" class="hud-icon-btn" aria-label="Pausar partida" title="Pausar (P / Esc)">
              ❚❚
            </button>
          </div>
        </div>

        <div id="hud-stress-panel" class="hud-stress-panel">
          <div class="hud-stress-head">
            <span class="hud-stress-title">ÍNDICE DE ESTRÉS</span>
            <span id="hud-stress-tier" class="hud-stress-tier-pill" style="color:${RELICARIO_PALETTE.coldSilver}; background:${RELICARIO_PALETTE.coldSilver}2E;">BAJO</span>
            <span id="hud-stress-pct" class="hud-stress-pct" style="color:${RELICARIO_PALETTE.coldSilver};">18 %</span>
          </div>
          <div class="stress-track">
            <div id="hud-stress-fill" class="stress-fill" style="width:18%; background:${RELICARIO_PALETTE.coldSilver};"></div>
          </div>
          <div class="hud-director-line">
            <span id="hud-director-dot" class="hud-director-dot" style="background:${RELICARIO_PALETTE.coldSilver};"></span>
            <span id="hud-director-msg" class="hud-director-msg">${escapeHtml(initialDirectiveMsg)}</span>
          </div>
        </div>
      </header>

      <div id="hud-touch-hint" class="hud-touch-hint">
        Arrastra el pulgar o usa WASD / Flechas · Disparo automático
      </div>

      <div id="pause-modal" class="pause-modal" hidden role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <div class="pause-card">
          <h2 id="pause-title" class="pause-title">EXPERIMENTO EN PAUSA</h2>
          <div class="pause-identity">
            ${renderAvatarSVG(avatarDef.id, 28, true)}
            <span>${escapeHtml(initials)} · ${escapeHtml(avatarDef.displayName)} · ${escapeHtml(modeDef.displayTitle)}</span>
          </div>
          <button type="button" id="btn-resume-game" class="btn-resume">REANUDAR</button>
          <button type="button" id="btn-abort-game" class="btn-abort">FINALIZAR Y REGISTRAR</button>
        </div>
      </div>
    </div>
  `;

  const elStage = root.querySelector('#arena-stage');
  const elVignette = root.querySelector('#panic-vignette');
  const elJoyRing = root.querySelector('#joystick-ring');
  const elJoyKnob = root.querySelector('#joystick-knob');
  const elLevel = root.querySelector('#hud-level');
  const elHpFill = root.querySelector('#hud-hp-fill');
  const elHpText = root.querySelector('#hud-hp-text');
  const elTimer = root.querySelector('#hud-timer');
  const elKills = root.querySelector('#hud-kills');
  const elStressPanel = root.querySelector('#hud-stress-panel');
  const elStressTier = root.querySelector('#hud-stress-tier');
  const elStressPct = root.querySelector('#hud-stress-pct');
  const elStressFill = root.querySelector('#hud-stress-fill');
  const elDirDot = root.querySelector('#hud-director-dot');
  const elDirMsg = root.querySelector('#hud-director-msg');
  const elHint = root.querySelector('#hud-touch-hint');
  const elPauseModal = root.querySelector('#pause-modal');
  const btnPause = root.querySelector('#btn-pause-toggle');
  const btnMute = root.querySelector('#btn-mute-toggle');

  const hintTimeout = window.setTimeout(() => {
    elHint?.classList.add('is-hidden');
  }, 4500);

  let arena = null;

  const setPaused = (nextPaused) => {
    isPaused = nextPaused;
    elPauseModal.hidden = !isPaused;
    btnPause.textContent = isPaused ? '▶' : '❚❚';
    arena?.setUserPaused(isPaused);
  };

  let joyWasActive = false;
  let lastLevel = -1;
  let lastHp = -1;
  let lastHpBg = '';
  let lastHpColor = '';
  let lastTimeStr = '';
  let lastTimeColor = '';
  let lastKills = -1;
  let lastStressPct = -1;
  let lastStressLabel = '';
  let lastStressColor = '';
  let lastDirMsg = '';
  let lastBorderColor = '';
  let lastDanger = false;

  arena = new PanicArena3D({
    container: elStage,
    modeId,
    initials,
    avatarId: avatarDef.id,
    audio,
    onJoystickChange: (joy) => {
      if (!joy.active) {
        if (joyWasActive) {
          joyWasActive = false;
          elJoyRing.style.opacity = '0';
          elJoyKnob.style.opacity = '0';
        }
        return;
      }
      if (!joyWasActive) {
        joyWasActive = true;
        elJoyRing.style.opacity = '0.88';
        elJoyKnob.style.opacity = '0.94';
      }
      elJoyRing.style.transform = `translate3d(${joy.originX - 46}px, ${joy.originY - 46}px, 0)`;
      elJoyKnob.style.transform = `translate3d(${joy.knobX - 18}px, ${joy.knobY - 18}px, 0)`;
    },
    onPauseShortcut: () => {
      setPaused(!isPaused);
    },
    onSnapshotUpdate: (snap) => {
      if (snap.playerLevel !== lastLevel) {
        lastLevel = snap.playerLevel;
        elLevel.textContent = `NV.${snap.playerLevel}`;
      }

      const lowHP = snap.hp <= 30;
      if (snap.hp !== lastHp) {
        lastHp = snap.hp;
        const hpRatio = Math.max(0, Math.min(1, snap.hp / Math.max(1, snap.maxHP)));
        elHpFill.style.width = `${(hpRatio * 100).toFixed(1)}%`;
        elHpText.textContent = `${snap.hp}`;
      }
      const nextHpBg = lowHP ? RELICARIO_PALETTE.vermilion : RELICARIO_PALETTE.graceJade;
      if (nextHpBg !== lastHpBg) {
        lastHpBg = nextHpBg;
        elHpFill.style.background = nextHpBg;
      }
      const nextHpColor = lowHP ? RELICARIO_PALETTE.vermilion : RELICARIO_PALETTE.ivory;
      if (nextHpColor !== lastHpColor) {
        lastHpColor = nextHpColor;
        elHpText.style.color = nextHpColor;
      }

      const nextTimeStr = formatCountdown(snap.timeRemaining);
      if (nextTimeStr !== lastTimeStr) {
        lastTimeStr = nextTimeStr;
        elTimer.textContent = nextTimeStr;
      }
      const nextTimeColor = snap.timeRemaining <= 10 ? RELICARIO_PALETTE.vermilion : RELICARIO_PALETTE.ivory;
      if (nextTimeColor !== lastTimeColor) {
        lastTimeColor = nextTimeColor;
        elTimer.style.color = nextTimeColor;
      }

      if (snap.kills !== lastKills) {
        lastKills = snap.kills;
        elKills.textContent = `${snap.kills}`;
      }

      const stressPct = Math.round(snap.stressIndex);
      const tier = snap.stressTier;
      if (tier.label !== lastStressLabel) {
        lastStressLabel = tier.label;
        elStressTier.textContent = tier.label;
      }
      if (tier.color !== lastStressColor) {
        lastStressColor = tier.color;
        elStressTier.style.color = tier.color;
        elStressTier.style.background = `${tier.color}30`;
        elStressPct.style.color = tier.color;
        elStressFill.style.background = tier.color;
        elDirDot.style.background = modeId === 'classic1985' ? `${RELICARIO_PALETTE.oldBone}99` : tier.color;
      }
      if (stressPct !== lastStressPct) {
        lastStressPct = stressPct;
        elStressPct.textContent = `${stressPct} %`;
        elStressFill.style.width = `${Math.max(4, Math.min(100, snap.stressIndex))}%`;
      }

      if (snap.directorMessage !== lastDirMsg) {
        lastDirMsg = snap.directorMessage;
        elDirMsg.textContent = snap.directorMessage;
      }

      const nextBorderColor = snap.isInterventionActive
        ? `${tier.color}99`
        : 'rgba(255,255,255,0.14)';
      if (nextBorderColor !== lastBorderColor) {
        lastBorderColor = nextBorderColor;
        elStressPanel.style.borderColor = nextBorderColor;
      }

      const nextDanger = snap.stressIndex >= 72 || lowHP;
      if (nextDanger !== lastDanger) {
        lastDanger = nextDanger;
        elVignette.classList.toggle('is-danger', nextDanger);
      }
    },
    onRunCompleted: (record) => {
      window.clearTimeout(hintTimeout);
      onFinishRun(record);
    }
  });

  btnPause.addEventListener('click', () => setPaused(!isPaused));
  root.querySelector('#btn-resume-game').addEventListener('click', () => setPaused(false));
  root.querySelector('#btn-abort-game').addEventListener('click', () => {
    elPauseModal.hidden = true;
    arena.forceAbort();
  });

  btnMute.addEventListener('click', () => {
    isMuted = !isMuted;
    audio?.setMuted(isMuted);
    btnMute.textContent = isMuted ? '🔇' : '🔊';
    btnMute.setAttribute('aria-label', isMuted ? 'Activar sonido' : 'Silenciar sonido');
  });

  return () => {
    window.clearTimeout(hintTimeout);
    arena?.dispose();
  };
}

function PLAYER_AVATARS_FALLBACK() {
  return {
    id: 'penitente',
    displayName: 'Penitente',
    auraColor: RELICARIO_PALETTE.coldSilver
  };
}
