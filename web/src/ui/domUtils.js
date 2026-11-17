// Utilidades seguras de renderizado DOM y formateo en español

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

export function medalColor(rank) {
  if (rank === 1) return '#FFB800';
  if (rank === 2) return '#72EFDD';
  if (rank === 3) return '#FF6B2B';
  return '#E6CCB2';
}
