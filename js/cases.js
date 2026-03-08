function openBox(cost, min, max) {
  if (boxRolling) return toast("ПОДОЖДИТЕ... КЕЙС УЖЕ ОТКРЫВАЕТСЯ", 'error');
  if ((userData.balance || 0) < cost) return toast("НЕДОСТАТОЧНО СРЕДСТВ", 'error');

  boxRolling = true;
  setCasesDisabled(true);

  // списываем ставку
  db.ref('users/' + user + '/balance').transaction(b => (b || 0) - cost);

  const res = document.getElementById('boxRes');
  res.style.color = 'var(--accent)';
  res.style.opacity = '1';
  res.innerText = "ROLLING...";

  // если был таймер “очистки” — сбросим
  if (boxResTimer) { clearTimeout(boxResTimer); boxResTimer = null; }

  let count = 0;
  const rolling = setInterval(() => {
    res.innerText = Math.floor(Math.random() * (max - min + 1) + min).toLocaleString() + " ₽";
    sfx(800 + Math.random() * 200, 'sine', 0.05, 0.05);
    count++;

    if (count > 25) {
      clearInterval(rolling);

      // ✅ честный финал с достижимым max
      const final = rollCasePayout(cost, min, max);

      res.style.color = final > cost ? 'var(--green)' : 'var(--pink)';
      res.innerText = final.toLocaleString() + " ₽";

      db.ref('users/' + user).transaction(u => {
        if (u) {
          u.balance = (u.balance || 0) + final;
          if (final > cost) u.xp = (u.xp || 0) + Math.floor((final - cost) / 10);
        }
        return u;
      });

      const profit = final - cost;
      addGameHistory('Case', cost, profit, profit > 0 ? 'win' : 'loss');

      if (profit > 0) {
        toast(`ВЫПЛАТА: ${final.toLocaleString()} ₽`, 'success');
        showWinAnimation(final, ''); // ✅ без "+" — показывает “сколько дает”
        sfx(1200, 'square', 0.3);
        checkWinStreak();
      } else {
        toast(`ПРОИГРЫШ: ${profit.toLocaleString()} ₽`, 'error');
        sfx(200, 'sawtooth', 0.3);
      }

      // ✅ автосброс результата (чтоб не висело вечно)
      boxResTimer = setTimeout(() => {
        res.style.opacity = '0';
        setTimeout(() => {
          res.innerText = '';
          res.style.opacity = '1';
        }, 250);
      }, 4500);

      boxRolling = false;
      setCasesDisabled(false);
    }
  }, 80);
}
    
// ✅ единая логика ролла (используем и в openBox, и в RTP)
function rollCasePayout(cost, min, max) {
  const roll = Math.random();
  let final;

  // 70% — ниже стоимости
  if (roll < 0.70) {
    final = Math.floor(min + (cost - min) * (0.4 + Math.random() * 0.5)); // 40%-90% от дистанции min->cost
  }
  // 25% — небольшой плюс
  else if (roll < 0.95) {
    final = Math.floor(cost * (1.1 + Math.random() * 0.2)); // 1.10x - 1.30x
  }
  // 5% — большой выигрыш ДО max (max реально достижим)
  else {
    const base = Math.ceil(cost * 1.5);          // старт “большого” дропа
    const range = Math.max(0, max - base);       // сколько осталось до max
    const skew = Math.pow(Math.random(), 3);     // чаще ближе к base, редко к max
    final = base + Math.floor(skew * (range + 1)); // +1 => max может выпасть
  }

  final = Math.max(min, Math.min(max, final));
  return final;
}
    // такая же логика как в openBox, но без UI (для симуляции)
function sampleCasePayout(cost, min, max) {
  return rollCasePayout(cost, min, max);
}

function calcCaseStats(cost, min, max, n = 20000) {
  let sum = 0;
  let low = 0, high = 0, equal = 0;

  for (let i = 0; i < n; i++) {
    const p = sampleCasePayout(cost, min, max);
    sum += p;
    if (p < cost) low++;
    else if (p > cost) high++;
    else equal++;
  }

  const ev = sum / n; // expected payout
  const rtp = (ev / cost) * 100;

  return {
    rtp,
    lowPct: (low / n) * 100,
    highPct: (high / n) * 100,
    eqPct: (equal / n) * 100
  };
}

function renderCaseRTP() {
  CASES_META.forEach(c => {
    const el = document.getElementById(c.id);
    if (!el) return;

    const s = calcCaseStats(c.cost, c.min, c.max, 20000);
    el.innerHTML =
      `<b>RTP ${s.rtp.toFixed(1)}%</b> • ниже: ${s.lowPct.toFixed(1)}% • выше: ${s.highPct.toFixed(1)}%`;
  });
}
// ✅ АВТОВХОД ПОСЛЕ ОБНОВЛЕНИЯ СТРАНИЦЫ
window.addEventListener('load', () => {
    renderCaseRTP(); // ✅ чтобы бейджи RTP заполнились
    
    const saved = localStorage.getItem('tornado_user');
    if (!saved) return;

    db.ref('users/' + saved).once('value')
        .then(snap => {
            if (snap.exists()) {
                runSession(saved);
            } else {
                localStorage.removeItem('tornado_user');
            }
        })
        .catch(err => console.error('AUTOLOGIN FAIL:', err));
});

// === RIPPLE ON CLICK (10 min) ===
