const tabbar = document.getElementById('tabbar');
function go(name, moveFocus = true) {
  const screens = Array.from(document.querySelectorAll('.screen'));
  const target = screens.find(s => s.dataset.screen === name);
  if (!target) return;
  screens.forEach(s => {
    const active = s === target;
    s.hidden = !active;
    s.inert = !active;
    s.classList.toggle('active', active);
  });
  tabbar.querySelectorAll('button').forEach(b => {
    const active = b.dataset.go === name;
    b.classList.toggle('on', active);
    if (active) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (moveFocus) target.focus({ preventScroll: true });
}
go('mission', false);
window.go = go;
tabbar.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-go]');
  if (btn) go(btn.dataset.go);
});
function tick() {
  const now = new Date();
  document.getElementById('clock').textContent = now.getHours() + ':' + String(now.getMinutes()).padStart(2,'0');
}
tick();
setInterval(tick, 10000);
const runBtn = document.getElementById('runBtn');
if (runBtn) {
  runBtn.addEventListener('click', () => {
    runBtn.textContent = 'Demo preview…';
    setTimeout(() => { runBtn.textContent = 'Preview Demo ▶'; }, 1200);
  });
}
