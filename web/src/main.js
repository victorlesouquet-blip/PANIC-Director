// Punto de entrada principal: enrutador de pantallas (Inicio -> Arena 3D -> Resultados -> Jugadores/Perfil)

import './styles/main.css';
import { PLAYER_AVATAR_MAP, GAME_MODE_MAP } from './engine/constants.js';
import { TelemetryStore, normalizeInitials } from './engine/telemetryStore.js';
import { WebAudioHaptics } from './engine/audioHaptics.js';
import { mountStartView } from './ui/StartView.js';
import { mountGameView } from './ui/GameView.js';
import { mountResultsView } from './ui/ResultsView.js';
import { mountPlayersView } from './ui/PlayersView.js';

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
        initialsChars: state.initialsChars,
        selectedMode: state.selectedMode,
        selectedAvatar: state.selectedAvatar
      })
    );
  } catch {
    // Ignorar almacenamiento restringido
  }
}

const savedPrefs = loadPrefs();
const store = new TelemetryStore();
const audio = new WebAudioHaptics();

const appState = {
  screen: 'start',
  initialsChars:
    Array.isArray(savedPrefs?.initialsChars) && savedPrefs.initialsChars.length === 3
      ? savedPrefs.initialsChars
      : ['V', 'L', 'F'],
  selectedMode:
    savedPrefs?.selectedMode && GAME_MODE_MAP[savedPrefs.selectedMode]
      ? savedPrefs.selectedMode
      : 'director2026',
  selectedAvatar:
    savedPrefs?.selectedAvatar && PLAYER_AVATAR_MAP[savedPrefs.selectedAvatar]
      ? savedPrefs.selectedAvatar
      : 'penitente',
  lastRecord: null,
  playersInitialTarget: null
};

const rootEl = document.getElementById('app');
let activeCleanup = null;

function navigate(nextScreen) {
  if (typeof activeCleanup === 'function') {
    activeCleanup();
    activeCleanup = null;
  }
  appState.screen = nextScreen;
  renderApp();
  if (nextScreen !== 'game') {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

function renderApp() {
  if (typeof activeCleanup === 'function') {
    activeCleanup();
    activeCleanup = null;
  }

  if (appState.screen === 'game') {
    document.body.classList.add('in-game');
    activeCleanup = mountGameView(rootEl, {
      initials: normalizeInitials(appState.initialsChars.join('')),
      modeId: appState.selectedMode,
      avatarId: appState.selectedAvatar,
      audio,
      onFinishRun: (record) => {
        const saved = store.recordRun(record);
        appState.lastRecord = saved;
        navigate('results');
      }
    });
    return;
  }

  document.body.classList.remove('in-game');

  if (appState.screen === 'results') {
    mountResultsView(rootEl, {
      lastRecord: appState.lastRecord,
      store,
      onPlayAgain: () => {
        audio.unlock();
        navigate('game');
      },
      onReturnToStart: () => {
        navigate('start');
      },
      onOpenPlayers: (initialsTarget) => {
        appState.playersInitialTarget = initialsTarget;
        navigate('players');
      }
    });
    return;
  }

  if (appState.screen === 'players') {
    mountPlayersView(rootEl, {
      store,
      initialPlayerInitials: appState.playersInitialTarget,
      onReturnToStart: () => {
        appState.playersInitialTarget = null;
        navigate('start');
      },
      onUsePlayerSetup: (initials, avatarId) => {
        const norm = normalizeInitials(initials);
        appState.initialsChars = [norm[0], norm[1], norm[2]];
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

  // Pantalla de inicio
  mountStartView(
    rootEl,
    {
      initialsChars: appState.initialsChars,
      selectedMode: appState.selectedMode,
      selectedAvatar: appState.selectedAvatar,
      recordedCount: store.records.length,
      uniquePlayerCount: store.uniquePlayerCount
    },
    {
      onUpdateInitials: (nextChars, opts = {}) => {
        appState.initialsChars = nextChars;
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
      onSelectMode: (modeId) => {
        if (GAME_MODE_MAP[modeId]) {
          appState.selectedMode = modeId;
          savePrefs(appState);
          renderApp();
        }
      },
      onStartGame: () => {
        audio.unlock();
        savePrefs(appState);
        appState.lastRecord = null;
        navigate('game');
      },
      onOpenTelemetry: () => {
        appState.lastRecord = null;
        navigate('results');
      },
      onOpenPlayers: () => {
        appState.playersInitialTarget = null;
        navigate('players');
      }
    }
  );
}

renderApp();
