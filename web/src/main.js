// Punto de entrada principal: enrutador de pestañas (Jugar -> Arena 3D -> Partidas -> Ránking -> Sala en Vivo)

import './styles/main.css';
import './styles/simplify.css';
import { PLAYER_AVATAR_MAP } from './engine/constants.js';
import { TelemetryStore, normalizeInitials } from './engine/telemetryStore.js';
import { LiveClassroomSync } from './engine/liveSync.js';
import { WebAudioHaptics } from './engine/audioHaptics.js';
import { mountStartView } from './ui/StartView.js';
import { mountGameView } from './ui/GameView.js';
import { mountResultsView } from './ui/ResultsView.js';
import { mountPlayersView } from './ui/PlayersView.js';
import { mountDashboardView } from './ui/DashboardView.js';

const PREFS_KEY = 'panic_director_web_prefs_v1';

function loadPrefs() {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function savePrefs(state) {
  try {
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        playerName: state.playerName,
        selectedMode: state.selectedMode,
        selectedAvatar: state.selectedAvatar
      })
    );
  } catch {
    // Ignorar almacenamiento restringido
  }
}

function detectInitialScreen() {
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get('dashboard') === '1' ||
      params.get('dashboard') === 'true' ||
      params.get('proyector') === '1' ||
      window.location.hash === '#dashboard'
    ) {
      return 'dashboard';
    }
  }
  return 'start';
}

const savedPrefs = loadPrefs();
const store = new TelemetryStore();
const liveSync = new LiveClassroomSync(store);
liveSync.start();
const audio = new WebAudioHaptics();

const appState = {
  screen: detectInitialScreen(),
  playerName:
    typeof savedPrefs?.playerName === 'string'
      ? savedPrefs.playerName.slice(0, 18)
      : '',
  selectedMode: 'unified',
  selectedAvatar:
    savedPrefs?.selectedAvatar && PLAYER_AVATAR_MAP[savedPrefs.selectedAvatar]
      ? savedPrefs.selectedAvatar
      : 'penitente',
  lastRecord: null,
  playersInitialTarget: null
};

const rootEl = document.getElementById('app');
let activeCleanup = null;

function syncUrlWithScreen(screen) {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('room', liveSync.roomCode);
    if (screen === 'dashboard') {
      url.searchParams.set('dashboard', '1');
    } else {
      url.searchParams.delete('dashboard');
      url.searchParams.delete('proyector');
    }
    window.history.replaceState({}, '', url.toString());
  } catch {
    // Ignorar
  }
}

function navigate(nextScreen) {
  if (typeof activeCleanup === 'function') {
    activeCleanup();
    activeCleanup = null;
  }
  if (nextScreen === 'players' && appState.screen !== 'players') {
    // Si no viene con un perfil concreto ya fijado, mostrar el listado
  }
  appState.screen = nextScreen;
  syncUrlWithScreen(nextScreen);
  renderApp();
  if (nextScreen !== 'game') {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

function handleTabNavigate(targetTab) {
  if (targetTab === 'players') {
    appState.playersInitialTarget = null;
  }
  navigate(targetTab);
}

function startRunWithLivePresence() {
  const playerName = normalizeInitials(appState.playerName);
  liveSync.publishRunStart({
    initials: playerName,
    avatar: appState.selectedAvatar,
    mode: 'unified'
  });
  navigate('game');
}

function renderApp() {
  if (typeof activeCleanup === 'function') {
    activeCleanup();
    activeCleanup = null;
  }

  if (appState.screen === 'game') {
    document.body.classList.add('in-game');
    activeCleanup = mountGameView(rootEl, {
      initials: normalizeInitials(appState.playerName),
      modeId: 'unified',
      avatarId: appState.selectedAvatar,
      audio,
      onProgressRun: (progress) => {
        liveSync.updateRunProgress(progress);
      },
      onFinishRun: (record) => {
        const saved = store.recordRun(record);
        appState.lastRecord = saved;
        liveSync.publishRunFinish(saved);
        navigate('results');
      }
    });
    return;
  }

  document.body.classList.remove('in-game');

  if (appState.screen === 'dashboard') {
    activeCleanup = mountDashboardView(rootEl, {
      store,
      liveSync,
      audio,
      onNavigate: handleTabNavigate,
      onReturnToStart: () => {
        navigate('start');
      },
      onOpenPlayerProfile: (initialsTarget) => {
        appState.playersInitialTarget = initialsTarget;
        navigate('players');
      }
    });
    return;
  }

  if (appState.screen === 'results') {
    activeCleanup = mountResultsView(rootEl, {
      lastRecord: appState.lastRecord,
      store,
      liveSync,
      roomCode: liveSync.roomCode,
      onNavigate: handleTabNavigate,
      onPlayAgain: () => {
        audio.unlock();
        startRunWithLivePresence();
      },
      onReturnToStart: () => {
        navigate('start');
      },
      onOpenPlayers: (initialsTarget) => {
        appState.playersInitialTarget = initialsTarget;
        navigate('players');
      },
      onOpenDashboard: () => {
        navigate('dashboard');
      }
    });
    return;
  }

  if (appState.screen === 'players') {
    activeCleanup = mountPlayersView(rootEl, {
      store,
      liveSync,
      initialPlayerInitials: appState.playersInitialTarget,
      onNavigate: handleTabNavigate,
      onReturnToStart: () => {
        appState.playersInitialTarget = null;
        navigate('start');
      },
      onUsePlayerSetup: (playerName, avatarId) => {
        appState.playerName = normalizeInitials(playerName);
        if (avatarId && PLAYER_AVATAR_MAP[avatarId]) {
          appState.selectedAvatar = avatarId;
        }
        savePrefs(appState);
        appState.playersInitialTarget = null;
        navigate('start');
      }
    });
    return;
  }

  // Pestaña Jugar (Inicio)
  mountStartView(
    rootEl,
    {
      playerName: appState.playerName,
      selectedMode: appState.selectedMode,
      selectedAvatar: appState.selectedAvatar,
      recordedCount: store.records.length,
      uniquePlayerCount: store.uniquePlayerCount,
      roomCode: liveSync.roomCode
    },
    {
      onNavigate: handleTabNavigate,
      onUpdatePlayerName: (nextName, opts = {}) => {
        appState.playerName = String(nextName || '').slice(0, 18);
        savePrefs(appState);
        if (!opts.skipRerender) renderApp();
      },
      onSelectAvatar: (avatarId) => {
        if (PLAYER_AVATAR_MAP[avatarId]) {
          appState.selectedAvatar = avatarId;
          savePrefs(appState);
          renderApp();
        }
      },
      onStartGame: () => {
        audio.unlock();
        savePrefs(appState);
        appState.lastRecord = null;
        startRunWithLivePresence();
      },
      onOpenTelemetry: () => {
        appState.lastRecord = null;
        navigate('results');
      },
      onOpenPlayers: () => {
        appState.playersInitialTarget = null;
        navigate('players');
      },
      onOpenDashboard: () => {
        navigate('dashboard');
      }
    }
  );
}

// Actualizar contadores si llegan partidas en tiempo real mientras estamos en la pantalla de inicio
liveSync.subscribe(() => {
  if (appState.screen === 'start') {
    const count = rootEl.querySelector('#btn-open-stats .stats-count');
    if (count) count.textContent = `(${store.records.length})`;
  }
});

renderApp();
