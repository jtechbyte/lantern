'use strict';
// BigInt arithmetic prevents precision loss and promotes rounded unit boundaries.
function formatDatabaseBytes(raw) {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const bytes = BigInt(raw), units = ['B','KB','MB','GB','TB'];
  let unit = 0, divisor = 1n;
  while (unit < 4 && bytes >= divisor * 1000n) { divisor *= 1000n; unit++; }
  if (!unit) return bytes.toString() + ' B';
  let tenths = (bytes * 10n + divisor / 2n) / divisor;
  if (tenths >= 10000n && unit < 4) { divisor *= 1000n; unit++; tenths = (bytes * 10n + divisor / 2n) / divisor; }
  return (tenths / 10n).toString() + '.' + (tenths % 10n).toString() + ' ' + units[unit];
}
if (typeof module !== 'undefined') module.exports = { formatDatabaseBytes };
if (typeof document !== 'undefined') (() => {
  const card = document.querySelector('.database-metric'), value = document.querySelector('#database-size');
  const updated = document.querySelector('#database-size-updated'), detail = document.querySelector('#database-size-detail');
  const explanation = 'Whole connected database, including tables and indexes. Excludes cluster-wide WAL, backups, and other databases.';
  let timer, controller, previous, active = false, disposed = false, resume = false;
  const visible = () => !disposed && card.isConnected && !document.hidden && !document.querySelector('#dashboard').hidden && !document.querySelector('#panel-overview').hidden;
  function render(data) {
    const formatted = formatDatabaseBytes(data?.bytes);
    if (formatted && Number.isFinite(Date.parse(data.measuredAt))) previous = data;
    const stale = !formatted || !Number.isFinite(Date.parse(data.measuredAt)) || data.state !== 'fresh';
    value.textContent = previous ? formatDatabaseBytes(previous.bytes) : 'Unavailable';
    card.dataset.state = previous ? (stale ? 'stale' : 'fresh') : 'unavailable';
    updated.textContent = previous ? (stale ? 'Stale ? ' : 'Updated ') + new Date(previous.measuredAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : 'Measurement unavailable';
    const text = previous ? previous.bytes + ' bytes. Measured ' + new Date(previous.measuredAt).toLocaleString() + '. ' + explanation : explanation;
    value.title = text; detail.textContent = text;
  }
  async function poll() {
    if (!visible() || controller) return;
    controller = new AbortController(); const request = controller;
    const timeout = setTimeout(() => request.abort(), 8000);
    try {
      const response = await fetch('/api/database-size', {headers:{Authorization:'Bearer ' + token},signal:request.signal});
      if (!response.ok) throw Error('Unavailable');
      const data = await response.json(); if (visible() && !request.signal.aborted) render(data);
    } catch { if (visible() && active) render(null); }
    finally { clearTimeout(timeout); controller = null; if (visible()) { timer = setTimeout(poll, resume ? 0 : 10000); resume = false; } }
  }
  function sync() {
    const next = visible();
    if (next === active) return;
    active = next; clearTimeout(timer);
    if (active) { if (!controller) poll(); else resume = true; } else controller?.abort();
  }
  const observer = new MutationObserver(sync);
  observer.observe(document.querySelector('#dashboard'), {attributes:true,attributeFilter:['hidden'],childList:true,subtree:true});
  observer.observe(document.querySelector('#panel-overview'), {attributes:true,attributeFilter:['hidden']});
  window.addEventListener('dashboard-layout', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => { disposed=true; active=false; clearTimeout(timer); controller?.abort(); observer.disconnect(); });
  sync();
})();
