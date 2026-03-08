function attachRipple(selector){
  document.querySelectorAll(selector).forEach(el => {
    el.classList.add('ripple');
    el.addEventListener('pointerdown', e => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--rx', (e.clientX - r.left) + 'px');
      el.style.setProperty('--ry', (e.clientY - r.top) + 'px');

      el.classList.remove('rip');
      // reflow
      void el.offsetWidth;
      el.classList.add('rip');
    }, { passive:true });
  });
}

// навигация + кнопки + плитки
window.addEventListener('load', () => {
  attachRipple('.btn-ui, .nav-btn, .top-tab, .game-cell, .leader-card, .gpu-card, .pvp-room');
});
    
