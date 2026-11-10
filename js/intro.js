/* Intro video: plays over the dashboard until "Enter dashboard" is pressed. */
(function () {
  'use strict';
  const el = document.getElementById('intro'); if (!el) return;
  const vid = document.getElementById('introVid'), go = document.getElementById('introGo');
  document.body.classList.add('intro-on');
  const p = vid.play && vid.play(); if (p && p.catch) p.catch(() => {});
  function enter() {
    if (el.classList.contains('out')) return;
    el.classList.add('out'); document.body.classList.remove('intro-on');
    // replay the dashboard's entrance animation now that it is visible
    if (window.BCC) { BCC.S._shown = null; BCC.S._ind = null; BCC.render(); }
    setTimeout(() => { vid.pause(); el.remove(); }, 800);
  }
  go.addEventListener('click', enter);
  document.addEventListener('keydown', function k(e) { if (!document.getElementById('intro')) return document.removeEventListener('keydown', k); if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); enter(); } });
  setTimeout(() => go.focus(), 50);
})();
