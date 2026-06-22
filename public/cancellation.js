const token = new URLSearchParams(location.search).get('token');
let canvas, ctx, isDrawing = false;
const sig = { paths: [], current: [] };

function showError(id, msg) { const e = document.getElementById(id); e.textContent = msg; e.classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function show(id) { document.getElementById(id).classList.remove('hidden'); }

async function verify() {
  hide('verifyError');
  const identifier = document.getElementById('identifier').value.trim();
  if (!identifier) return showError('verifyError', 'Bitte Nachname oder E-Mail eingeben.');
  const res = await fetch(`/api/cancellation/${token}/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier })
  });
  const data = await res.json();
  if (!data.success) return showError('verifyError', data.error || 'Fehler.');
  if (data.alreadyCancelled) { hide('verifyStep'); return show('alreadyStep'); }
  document.getElementById('locationName').textContent = data.locationName;
  document.getElementById('effectiveDate').textContent = formatDE(data.effectiveDate);
  hide('verifyStep'); show('cancelStep'); initCanvas();
}

function formatDE(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function initCanvas() {
  canvas = document.getElementById('signatureCanvas');
  ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width; canvas.height = 200;
  ctx.strokeStyle = '#1d1d1f'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  const pos = (e) => { const r = canvas.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
  const start = (e) => { e.preventDefault(); isDrawing = true; sig.current = []; const p = pos(e); sig.current.push({ x: p.x, y: p.y, type: 'M' }); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if (!isDrawing) return; e.preventDefault(); const p = pos(e); sig.current.push({ x: p.x, y: p.y, type: 'L' }); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { if (!isDrawing) return; isDrawing = false; if (sig.current.length) sig.paths.push([...sig.current]); sig.current = []; };
  canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end); canvas.addEventListener('mouseout', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end, { passive: false });
}

function getSignatureSVG() {
  const paths = sig.paths.map(path => {
    const d = path.map(p => `${p.type} ${p.x} ${p.y}`).join(' ');
    return `<path d="${d}" stroke="#1d1d1f" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">${paths}</svg>`;
}

async function submit() {
  hide('submitError');
  if (sig.paths.length === 0) return showError('submitError', 'Bitte unterschreiben Sie.');
  const res = await fetch(`/api/cancellation/${token}/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: document.getElementById('identifier').value.trim(),
      reason: document.getElementById('reason').value.trim() || null,
      signatureImage: canvas.toDataURL('image/png'),
      signatureSVG: getSignatureSVG()
    })
  });
  const data = await res.json();
  if (!data.success) return showError('submitError', data.error || 'Fehler beim Absenden.');
  document.getElementById('doneDate').textContent = formatDE(data.effectiveDate);
  hide('cancelStep'); show('doneStep');
}

document.addEventListener('DOMContentLoaded', () => {
  if (!token) return showError('verifyError', 'Ungültiger Link (Token fehlt).');
  document.getElementById('verifyBtn').addEventListener('click', verify);
  document.getElementById('submitBtn').addEventListener('click', submit);
  document.getElementById('clearSignature').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height); sig.paths = []; sig.current = [];
  });
});
