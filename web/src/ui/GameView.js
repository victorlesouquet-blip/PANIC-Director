// Vista en Partida 3D (Campaña Unificada 2 Minutos / 3 Fases) + Aviso de Cambio de Fase con Pausa de 5s y Cuenta Atrás

import {
  CAMPAIGN_PHASES,
  PLAYER_AVATAR_MAP,
  RELICARIO_PALETTE,
  TOTAL_RUN_DURATION
} from '../engine/constants.js';
import { renderAvatarSVG } from '../scene/avatarSVGs.js';
import { PanicArena3D } from '../scene/PanicArena3D.js';
import { escapeHtml } from './domUtils.js';

function formatCountdown(seconds) {
  const t = Math.max(0, seconds);
  if (t < 9.95) return `${t.toFixed(1)}s`;
  const totalSec = Math.ceil(t);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function mountGameView(root, { initials, avatarId, audio, onFinishRun }) {
  const initialPhase = CAMPAIGN_PHASES[0];
  const avatarDef = PLAYER_AVATAR_MAP[avatarId] || PLAYER_AVATARS_FALLBACK(avatarId);

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
              <span id="hud-mode-pill" class="hud-mode-pill" style="color:${initialPhase.accentColor}; background:${initialPhase.accentColor}2E;">
                ${escapeHtml(initialPhase.hudBadge)}
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
            <h1 class="sr-only">Partida en curso — PANIC DIRECTOR (2 minutos · 3 fases)</h1>
            <span class="hud-kicker">TIEMPO (2 MIN)</span>
            <span id="hud-timer" class="hud-timer-num">2:00</span>
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

        <!-- Barra de progreso de los 3 tramos temporales (0-40s 1985 | 40s-1m20s Híbrido | 1m20s-2m IA 2026) -->
        <div class="hud-phases-bar" aria-label="Progreso por tramos de IA">
          <div class="hud-phase-seg is-active" id="hud-seg-1">
            <span class="hud-seg-label">0-40s · 1985</span>
            <div class="hud-seg-track"><div id="hud-seg-fill-1" class="hud-seg-fill" style="background:${CAMPAIGN_PHASES[0].accentColor}; width:0%;"></div></div>
          </div>
          <div class="hud-phase-seg" id="hud-seg-2">
            <span class="hud-seg-label">40s-1:20 · HÍBR.</span>
            <div class="hud-seg-track"><div id="hud-seg-fill-2" class="hud-seg-fill" style="background:${CAMPAIGN_PHASES[1].accentColor}; width:0%;"></div></div>
          </div>
          <div class="hud-phase-seg" id="hud-seg-3">
            <span class="hud-seg-label">1:20-2:00 · IA 2026</span>
            <div class="hud-seg-track"><div id="hud-seg-fill-3" class="hud-seg-fill" style="background:${CAMPAIGN_PHASES[2].accentColor}; width:0%;"></div></div>
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
            <span id="hud-director-dot" class="hud-director-dot" style="background:${RELICARIO_PALETTE.oldBone};"></span>
            <span id="hud-director-msg" class="hud-director-msg">Regla fija [0-40s] → Escalamiento continuo</span>
          </div>
        </div>
      </header>

      <!-- Aviso gigante de cambio de fase con pausa de ataques durante 5 segundos y cuenta atrás -->
      <div id="phase-transition-overlay" class="phase-transition-overlay" hidden role="alert" aria-live="assertive">
        <div id="phase-transition-card" class="phase-transition-card">
          <span class="phase-tr-badge">⚡ CAMBIO DE MOTOR DE IA · TREGUA SIN ATAQUES</span>
          <span id="phase-tr-kicker" class="phase-tr-kicker">¡FASE SUPERADA!</span>
          <h2 id="phase-tr-title" class="phase-tr-title">FASE 2: MODO HÍBRIDO</h2>
          <p id="phase-tr-desc" class="phase-tr-desc">Prepárate para la siguiente ronda.</p>

          <div class="phase-tr-countdown-box">
            <span class="phase-tr-countdown-label">LA SIGUIENTE RONDA COMIENZA EN</span>
            <strong id="phase-tr-countdown-num" class="phase-tr-countdown-num">5</strong>
            <div class="phase-tr-bar-track">
              <div id="phase-tr-bar-fill" class="phase-tr-bar-fill" style="width:100%;"></div>
            </div>
          </div>
        </div>
      </div>

      <div id="hud-touch-hint" class="hud-touch-hint">
        Arrastra el pulgar o usa WASD / Flechas · Disparo automático · 3 Fases (2 min)
      </div>

      <div id="pause-modal" class="pause-modal" hidden role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <div class="pause-card">
          <h2 id="pause-title" class="pause-title">EXPERIMENTO EN PAUSA</h2>
          <div class="pause-identity">
            ${renderAvatarSVG(avatarDef.id, 28, true)}
            <span>${escapeHtml(initials)} · ${escapeHtml(avatarDef.displayName)} · Campaña 3 Fases (2 min)</span>
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
  const elModePill = root.querySelector('#hud-mode-pill');
  const elHpFill = root.querySelector('#hud-hp-fill');
  const elHpText = root.querySelector('#hud-hp-text');
  const elTimer = root.querySelector('#hud-timer');
  const elKills = root.querySelector('#hud-kills');
  const elSeg1 = root.querySelector('#hud-seg-1');
  const elSeg2 = root.querySelector('#hud-seg-2');
  const elSeg3 = root.querySelector('#hud-seg-3');
  const elSegFill1 = root.querySelector('#hud-seg-fill-1');
  const elSegFill2 = root.querySelector('#hud-seg-fill-2');
  const elSegFill3 = root.querySelector('#hud-seg-fill-3');
  const elStressPanel = root.querySelector('#hud-stress-panel');
  const elStressTier = root.querySelector('#hud-stress-tier');
  const elStressPct = root.querySelector('#hud-stress-pct');
  const elStressFill = root.querySelector('#hud-stress-fill');
  const elDirDot = root.querySelector('#hud-director-dot');
  const elDirMsg = root.querySelector('#hud-director-msg');
  const elTrOverlay = root.querySelector('#phase-transition-overlay');
  const elTrCard = root.querySelector('#phase-transition-card');
  const elTrKicker = root.querySelector('#phase-tr-kicker');
  const elTrTitle = root.querySelector('#phase-tr-title');
  const elTrDesc = root.querySelector('#phase-tr-desc');
  const elTrCountNum = root.querySelector('#phase-tr-countdown-num');
  const elTrBarFill = root.querySelector('#phase-tr-bar-fill');
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
  let lastPhaseId = initialPhase.id;
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
    modeId: 'unified',
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
      // Actualizar fase activa y barra de 3 tramos (0-40s, 40-80s, 80-120s)
      const phase = snap.currentPhase || CAMPAIGN_PHASES[0];
      if (phase.id !== lastPhaseId) {
        lastPhaseId = phase.id;
        elModePill.textContent = phase.hudBadge;
        elModePill.style.color = phase.accentColor;
        elModePill.style.background = `${phase.accentColor}2E`;
      }

      const elapsed = Number(snap.elapsedTime) || TOTAL_RUN_DURATION - snap.timeRemaining;
      const p1Pct = Math.min(100, Math.max(0, (elapsed / 40.0) * 100));
      const p2Pct = Math.min(100, Math.max(0, ((elapsed - 40.0) / 40.0) * 100));
      const p3Pct = Math.min(100, Math.max(0, ((elapsed - 80.0) / 40.0) * 100));
      elSegFill1.style.width = `${p1Pct.toFixed(1)}%`;
      elSegFill2.style.width = `${p2Pct.toFixed(1)}%`;
      elSegFill3.style.width = `${p3Pct.toFixed(1)}%`;
      elSeg1.classList.toggle('is-active', phase.phaseNumber === 1);
      elSeg2.classList.toggle('is-active', phase.phaseNumber === 2);
      elSeg3.classList.toggle('is-active', phase.phaseNumber === 3);

      // Modal de transición de fase (5 segundos de pausa sin ataques y cuenta atrás)
      if (snap.phaseTransition && snap.phaseTransition.active) {
        const tr = snap.phaseTransition;
        elTrOverlay.hidden = false;
        elTrCard.style.borderColor = tr.accentColor;
        elTrKicker.textContent = tr.kicker;
        elTrKicker.style.color = tr.accentColor;
        elTrTitle.textContent = tr.headline;
        elTrDesc.textContent = tr.description;
        const countInt = Math.max(1, Math.ceil(tr.remainingSec));
        elTrCountNum.textContent = `${countInt}`;
        elTrCountNum.style.color = tr.accentColor;
        const ratio = Math.min(100, Math.max(0, (tr.remainingSec / tr.totalSec) * 100));
        elTrBarFill.style.width = `${ratio.toFixed(1)}%`;
        elTrBarFill.style.background = tr.accentColor;
      } else if (!elTrOverlay.hidden) {
        elTrOverlay.hidden = true;
      }

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
      const nextTimeColor = snap.timeRemaining <= 15 ? RELICARIO_PALETTE.vermilion : RELICARIO_PALETTE.ivory;
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
        elDirDot.style.background = phase.id === 'classic1985' ? `${RELICARIO_PALETTE.oldBone}99` : tier.color;
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
