// Utilidades seguras de renderizado DOM, formato legible y barra de navegación principal

export function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatSpanishDate(isoStr) {
  try {
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return 'Reciente';
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  } catch {
    return 'Reciente';
  }
}

export function formatSimpleTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s >= 120) return '2:00';
  if (s >= 60) {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }
  return `${s.toFixed(1)}s`;
}

export function medalColor(rank) {
  if (rank === 1) return '#FFB800';
  if (rank === 2) return '#72EFDD';
  if (rank === 3) return '#FF6B2B';
  return '#E6CCB2';
}

export function renderAppNavHtml({ activeTab = 'start', playerCount = 0, runCount = 0, roomCode = 'CLASE' } = {}) {
  const tabs = [
    { id: 'start', label: 'Jugar', icon: '▶', badge: '' },
    { id: 'players', label: 'Ránking', icon: '♛', badge: playerCount > 0 ? `${playerCount}` : '' },
    { id: 'results', label: 'Partidas', icon: '▮', badge: runCount > 0 ? `${runCount}` : '' },
    { id: 'dashboard', label: 'Sala en vivo', icon: '📺', badge: roomCode ? escapeHtml(roomCode) : '' }
  ];

  return `
    <nav class="app-tabs-bar" aria-label="Menú principal">
      <div class="app-tabs-inner">
        ${tabs
          .map((t) => {
            const isActive = t.id === activeTab;
            return `
              <button
                type="button"
                class="app-tab-btn ${isActive ? 'is-active' : ''}"
                data-nav-tab="${t.id}"
                aria-current="${isActive ? 'page' : 'false'}"
              >
                <span class="app-tab-icon" aria-hidden="true">${t.icon}</span>
                <span class="app-tab-label">${t.label}</span>
                ${t.badge ? `<span class="app-tab-badge ${t.id === 'dashboard' ? 'is-room' : ''}">${t.badge}</span>` : ''}
              </button>
            `;
          })
          .join('')}
      </div>
    </nav>
  `;
}

export function bindAppNavEvents(root, onNavigate) {
  if (!onNavigate) return;
  root.querySelectorAll('[data-nav-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.navTab;
      if (target) onNavigate(target);
    });
  });
}
