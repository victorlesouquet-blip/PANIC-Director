// Vista en Partida 3D — HUD con Barra de IA/Estrés en vivo, Barra de Boss y Mejoras Visuales por Rareza

import {
  LEVEL_UPGRADES,
  PLAYER_AVATAR_MAP,
  RELICARIO_PALETTE,
  TOTAL_RUN_DURATION,
  UPGRADE_RARITIES,
  UPGRADE_RARITY_MAP
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

function renderActiveUpgradePills(upgradeRanks, upgradeBestRarity = {}, avatarDef = null) {
  const items = [];
  if (avatarDef?.passiveBadge) {
    items.push(`
      <span
        class="hud-upg-chip"
        style="border-color:${avatarDef.auraColor}88; background:${avatarDef.auraColor}22;"
        title="Mejora básica de ${escapeHtml(avatarDef.displayName)}: ${escapeHtml(avatarDef.roleSubtitle || '')}"
      >
        <strong style="color:${avatarDef.auraColor};">${escapeHtml(avatarDef.passiveBadge)}</strong>
      </span>
    `);
  }
  if (!upgradeRanks) return items.join('');
  for (const u of LEVEL_UPGRADES) {
    const rank = upgradeRanks[u.id] || 0;
    if (rank > 0) {
      const bestRarityId = upgradeBestRarity?.[u.id] || 'common';
      const rarityDef = UPGRADE_RARITY_MAP[bestRarityId] || UPGRADE_RARITIES[0];
      items.push(`
        <span
          class="hud-upg-chip"
          style="border-color:${rarityDef.borderTint}; background:${rarityDef.bgTint};"
          title="${escapeHtml(u.title)} (${escapeHtml(rarityDef.label)} · Nv. ${rank})"
        >
          <span>${u.icon}</span>
          <strong style="color:${rarityDef.color};">×${rank}</strong>
        </span>
      `);
    }
  }
  return items.join('');
}

export function mountGameView(root, { initials, avatarId, audio, onProgressRun, onFinishRun }) {
  const avatarDef = PLAYER_AVATAR_MAP[avatarId] || PLAYER_AVATARS_FALLBACK();

  let isPaused = false;
  let isMuted = audio?.muted || false;

  root.innerHTML = `
    <div class="game-viewport">
      <div id="arena-stage" class="arena-stage" aria-label="Arena 3D interactiva"></div>

      <div id="panic-vignette" class="panic-vignette" aria-hidden="true"></div>

      <div id="joystick-ring" class="joystick-ring" aria-hidden="true"></div>
      <div id="joystick-knob" class="joystick-knob" aria-hidden="true"></div>

      <header class="hud-overlay hud-overlay--clean">
        <div class="hud-top-bar hud-top-bar--clean">
          <div class="hud-player-col">
            <div class="hud-identity-row">
              ${renderAvatarSVG(avatarDef.id, 24, true)}
              <span class="hud-initials">${escapeHtml(initials)}</span>
              <span id="hud-level" class="hud-level-pill">Nv. 1</span>
            </div>
            <div class="hud-hp-row" aria-label="Vida">
              <span class="hud-heart-icon" aria-hidden="true">♥</span>
              <div class="hp-track hp-track--wide">
                <div id="hud-hp-fill" class="hp-fill" style="width:100%; background:${RELICARIO_PALETTE.graceJade};"></div>
              </div>
              <span id="hud-hp-text" class="hud-hp-num">100</span>
            </div>
            <div class="hud-xp-row" aria-label="Progreso de nivel">
              <div class="xp-mini-track">
                <div id="hud-xp-fill" class="xp-mini-fill" style="width:0%;"></div>
              </div>
            </div>
          </div>

          <div class="hud-timer-col">
            <h1 class="sr-only">Partida en curso — PANIC DIRECTOR</h1>
            <span id="hud-timer" class="hud-timer-num">2:00</span>
            <div class="hud-run-progress-track" aria-hidden="true">
              <div id="hud-run-progress-fill" class="hud-run-progress-fill" style="width:0%;"></div>
            </div>
          </div>

          <div class="hud-right-col">
            <div class="hud-kills-block" aria-label="Kills">
              <span id="hud-kills" class="hud-kills-num">0</span>
              <span class="hud-kicker">kills</span>
            </div>
            <button type="button" id="btn-mute-toggle" class="hud-icon-btn" aria-label="${isMuted ? 'Activar sonido' : 'Silenciar sonido'}" title="${isMuted ? 'Activar sonido' : 'Silenciar sonido'}">
              ${isMuted ? '🔇' : '🔊'}
            </button>
            <button type="button" id="btn-pause-toggle" class="hud-icon-btn" aria-label="Pausar partida" title="Pausar (P / Esc)">
              ❚❚
            </button>
          </div>
        </div>

        <!-- Barra de Vida del Boss (visible cuando hay un Jefe en la arena) -->
        <div id="hud-boss-bar" class="hud-boss-bar" hidden aria-label="Salud del Jefe">
          <div class="hud-boss-top">
            <span id="hud-boss-title" class="hud-boss-title">💀 JEFE · COLOSO DE CENIZA</span>
            <span id="hud-boss-hp-text" class="hud-boss-hp-text">100 / 100</span>
          </div>
          <div class="hud-boss-track">
            <div id="hud-boss-fill" class="hud-boss-fill" style="width:100%;"></div>
          </div>
        </div>

        <!-- Barra de IA Directora y Estrés en Vivo (muestra si la IA envía más o menos enemigos) -->
        <div id="hud-ai-bar" class="hud-ai-bar" aria-label="Estado de la IA y barra de estrés">
          <div class="hud-ai-top">
            <span class="hud-ai-label">ESTRÉS / IA</span>
            <span id="hud-ai-text" class="hud-ai-text">Ritmo ideal · Horda estable</span>
            <span id="hud-ai-badge" class="hud-ai-badge" style="color:${RELICARIO_PALETTE.liturgicalGold}; background:${RELICARIO_PALETTE.liturgicalGold}24;">
              ● EQUILIBRADO
            </span>
          </div>
          <div class="hud-ai-track" title="Barra de estrés: si es bajo la IA envía más enemigos; si sube mucho la IA reduce enemigos y te ayuda">
            <div id="hud-ai-fill" class="hud-ai-fill" style="width:20%; background:${RELICARIO_PALETTE.liturgicalGold};"></div>
          </div>
        </div>

        <div class="hud-status-row">
          <div id="hud-upgrades-strip" class="hud-upgrades-strip"></div>
        </div>
      </header>

      <!-- Modal de Elección de Mejoras Sencillo y Bonito (Tocar tarjeta) -->
      <div id="levelup-modal" class="levelup-modal" hidden role="dialog" aria-modal="true" aria-labelledby="levelup-title">
        <div class="levelup-card">
          <div class="levelup-header">
            <span class="levelup-kicker">★ ¡SUBIDA DE NIVEL! ★</span>
            <h2 id="levelup-title" class="levelup-title">NIVEL 2</h2>
            <p class="levelup-subtitle">Toca una mejora para continuar</p>
            <div class="rarity-legend-row" aria-label="Colores de rareza">
              ${UPGRADE_RARITIES.map(
                (r) => `
                  <span class="rarity-legend-item" style="color:${r.color};">
                    <span class="rarity-dot" style="background:${r.color};"></span>
                    ${escapeHtml(r.label)}
                  </span>
                `
              ).join('')}
            </div>
          </div>
          <div id="levelup-options" class="levelup-options"></div>
        </div>
      </div>

      <div id="hud-touch-hint" class="hud-touch-hint">
        Mueve con el pulgar o WASD / Flechas · Disparo automático
      </div>

      <div id="pause-modal" class="pause-modal" hidden role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <div class="pause-card">
          <h2 id="pause-title" class="pause-title">Juego en pausa</h2>
          <div class="pause-identity">
            ${renderAvatarSVG(avatarDef.id, 28, true)}
            <span>${escapeHtml(initials)} · ${escapeHtml(avatarDef.displayName)}</span>
          </div>
          <button type="button" id="btn-resume-game" class="btn-resume">Continuar</button>
          <button type="button" id="btn-abort-game" class="btn-abort">Terminar partida</button>
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
  const elXpFill = root.querySelector('#hud-xp-fill');
  const elTimer = root.querySelector('#hud-timer');
  const elRunProgressFill = root.querySelector('#hud-run-progress-fill');
  const elKills = root.querySelector('#hud-kills');
  const elBossBar = root.querySelector('#hud-boss-bar');
  const elBossTitle = root.querySelector('#hud-boss-title');
  const elBossHpText = root.querySelector('#hud-boss-hp-text');
  const elBossFill = root.querySelector('#hud-boss-fill');
  const elAiBar = root.querySelector('#hud-ai-bar');
  const elAiBadge = root.querySelector('#hud-ai-badge');
  const elAiText = root.querySelector('#hud-ai-text');
  const elAiFill = root.querySelector('#hud-ai-fill');
  const elUpgradesStrip = root.querySelector('#hud-upgrades-strip');
  const elLevelupModal = root.querySelector('#levelup-modal');
  const elLevelupTitle = root.querySelector('#levelup-title');
  const elLevelupOptions = root.querySelector('#levelup-options');
  const elHint = root.querySelector('#hud-touch-hint');
  const elPauseModal = root.querySelector('#pause-modal');
  const btnPause = root.querySelector('#btn-pause-toggle');
  const btnMute = root.querySelector('#btn-mute-toggle');

  const hintTimeout = window.setTimeout(() => {
    elHint?.classList.add('is-hidden');
  }, 4000);

  let arena = null;

  const setPaused = (nextPaused) => {
    if (!elLevelupModal.hidden) return;
    isPaused = nextPaused;
    elPauseModal.hidden = !isPaused;
    btnPause.textContent = isPaused ? '▶' : '❚❚';
    arena?.setUserPaused(isPaused);
  };

  const renderLevelUpDraft = (draft) => {
    if (!draft || !draft.options || draft.options.length === 0) {
      elLevelupModal.hidden = true;
      return;
    }

    elLevelupTitle.textContent = `NIVEL ${draft.level}`;
    elLevelupOptions.innerHTML = draft.options
      .map((opt) => {
        return `
          <button
            type="button"
            class="upgrade-choice-btn rarity-${escapeHtml(opt.rarityId)}"
            data-upgrade-id="${escapeHtml(opt.id)}"
            style="--upg-color:${opt.color}; border-color:${opt.borderTint}; box-shadow: 0 8px 22px ${opt.glowTint};"
          >
            <div class="upgrade-choice-icon" style="background:${opt.bgTint}; border-color:${opt.borderTint};">
              <span>${opt.icon}</span>
            </div>
            <div class="upgrade-choice-body">
              <div class="upgrade-choice-top">
                <strong class="upgrade-choice-bonus" style="color:${opt.color};">${escapeHtml(opt.shortTag)}</strong>
                <span class="upgrade-rarity-pill" style="color:#080606; background:${opt.color};">
                  ${escapeHtml(opt.rarityLabel)}
                </span>
              </div>
              <p class="upgrade-choice-desc">${escapeHtml(opt.description)}</p>
            </div>
          </button>
        `;
      })
      .join('');

    elLevelupOptions.querySelectorAll('[data-upgrade-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.upgradeId;
        if (id) arena?.selectUpgrade(id);
      });
    });

    elLevelupModal.hidden = false;
  };

  let joyWasActive = false;
  let lastLevel = -1;
  let lastHp = -1;
  let lastMaxHp = -1;
  let lastHpBg = '';
  let lastHpColor = '';
  let lastXpPct = -1;
  let lastTimeStr = '';
  let lastTimeColor = '';
  let lastKills = -1;
  let lastAiBadge = '';
  let lastAiText = '';
  let lastAiColor = '';
  let lastStressPct = -1;
  let lastUpgradesSig = '';
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
    onUpgradeDraftChange: (draft) => {
      renderLevelUpDraft(draft);
    },
    onSnapshotUpdate: (snap) => {
      const elapsed = Number(snap.elapsedTime) || TOTAL_RUN_DURATION - snap.timeRemaining;
      if (typeof onProgressRun === 'function') {
        onProgressRun({
          elapsedSeconds: elapsed,
          kills: snap.kills,
          stress: snap.stressIndex
        });
      }
      const runPct = Math.min(100, Math.max(0, (elapsed / TOTAL_RUN_DURATION) * 100));
      if (elRunProgressFill) {
        elRunProgressFill.style.width = `${runPct.toFixed(1)}%`;
      }

      if (snap.playerLevel !== lastLevel) {
        lastLevel = snap.playerLevel;
        elLevel.textContent = `Nv. ${snap.playerLevel}`;
      }

      const xpPct = Math.min(100, Math.max(0, Math.round((snap.xpProgress || 0) * 100)));
      if (xpPct !== lastXpPct && elXpFill) {
        lastXpPct = xpPct;
        elXpFill.style.width = `${xpPct}%`;
      }

      if (snap.upgradeRanks && elUpgradesStrip) {
        const sig =
          Object.values(snap.upgradeRanks).join(',') +
          '|' +
          Object.values(snap.upgradeBestRarity || {}).join(',');
        if (sig !== lastUpgradesSig) {
          lastUpgradesSig = sig;
          elUpgradesStrip.innerHTML = renderActiveUpgradePills(snap.upgradeRanks, snap.upgradeBestRarity, avatarDef);
        }
      }

      const lowHP = snap.hp <= 30;
      if (snap.hp !== lastHp || snap.maxHP !== lastMaxHp) {
        lastHp = snap.hp;
        lastMaxHp = snap.maxHP;
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

      const nextTimeStr = snap.activeBoss?.isFinal ? 'FINAL' : formatCountdown(snap.timeRemaining);
      if (nextTimeStr !== lastTimeStr) {
        lastTimeStr = nextTimeStr;
        elTimer.textContent = nextTimeStr;
      }
      const nextTimeColor =
        snap.activeBoss?.isFinal
          ? '#FACC15'
          : snap.timeRemaining <= 15
            ? RELICARIO_PALETTE.vermilion
            : RELICARIO_PALETTE.ivory;
      if (nextTimeColor !== lastTimeColor) {
        lastTimeColor = nextTimeColor;
        elTimer.style.color = nextTimeColor;
      }

      if (snap.kills !== lastKills) {
        lastKills = snap.kills;
        elKills.textContent = `${snap.kills}`;
      }

      if (snap.activeBoss && elBossBar) {
        const b = snap.activeBoss;
        elBossBar.hidden = false;
        elBossBar.style.borderColor = `${b.color}AA`;
        const icon = b.isFinal ? (b.enraged ? '🔥' : '👑') : '💀';
        const prefix = b.isFinal ? 'JEFE FINAL' : `JEFE ${b.bossNumber}/3`;
        elBossTitle.textContent = `${icon} ${prefix} · ${b.title}`;
        elBossTitle.style.color = b.color;
        elBossHpText.textContent = `${b.hp} / ${b.maxHP}`;
        const bPct = Math.min(100, Math.max(0, (b.hp / Math.max(1, b.maxHP)) * 100));
        elBossFill.style.width = `${bPct.toFixed(1)}%`;
        elBossFill.style.background = b.color;
      } else if (elBossBar && !elBossBar.hidden) {
        elBossBar.hidden = true;
      }

      // Actualizar Barra de IA Directora y Estrés en Vivo
      const ai = snap.aiState || {
        badge: '● EQUILIBRADO',
        text: 'Ritmo ideal · Horda estable',
        color: RELICARIO_PALETTE.liturgicalGold
      };
      const stressPct = Math.min(100, Math.max(6, Math.round(snap.stressIndex || 18)));
      if (stressPct !== lastStressPct && elAiFill) {
        lastStressPct = stressPct;
        elAiFill.style.width = `${stressPct}%`;
      }
      if (ai.badge !== lastAiBadge && elAiBadge) {
        lastAiBadge = ai.badge;
        elAiBadge.textContent = ai.badge;
      }
      if (ai.text !== lastAiText && elAiText) {
        lastAiText = ai.text;
        elAiText.textContent = ai.text;
      }
      if (ai.color !== lastAiColor) {
        lastAiColor = ai.color;
        if (elAiBadge) {
          elAiBadge.style.color = ai.color;
          elAiBadge.style.background = `${ai.color}24`;
          elAiBadge.style.borderColor = `${ai.color}66`;
        }
        if (elAiFill) {
          elAiFill.style.background = ai.color;
        }
        if (elAiBar) {
          elAiBar.style.borderColor = `${ai.color}55`;
        }
      }

      const nextDanger = snap.stressIndex >= 75 || lowHP;
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
