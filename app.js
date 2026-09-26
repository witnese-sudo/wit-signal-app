const tabbar = document.getElementById('tabbar');
function go(name) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.toggle('active', s.dataset.screen === name);
  });
  tabbar.querySelectorAll('button').forEach(b => {
    b.classList.toggle('on', b.dataset.go === name);
  });
}
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
    runBtn.textContent = 'Simulating…';
    setTimeout(() => { runBtn.textContent = 'Run Simulation ▶'; }, 1200);
  });
}
