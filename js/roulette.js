    function initRoulette() {
        const strip = document.getElementById('rouletteStrip');
        strip.innerHTML = '';
        const colors = ['red', 'black', 'green'];
        const symbols = {'red':'🔴', 'black':'⚫', 'green':'🟢'};
        for(let i=0; i<100; i++) {
            const color = Math.random() < 0.07 ? 'green' : (Math.random() < 0.5 ? 'red' : 'black');
            const item = document.createElement('div');
            item.className = 'roulette-item';
            item.style.background = color === 'green' ? 'rgba(0,255,136,0.1)' : color === 'red' ? 'rgba(255,0,123,0.1)' : 'rgba(255,255,255,0.05)';
            item.innerHTML = `<div style="font-size:36px;">${symbols[color]}</div>`;
            item.dataset.color = color;
            strip.appendChild(item);
        }
    }

    function playRoulette() {
    if (rouletteSpinning) return;

    let amt = parseInt(document.getElementById('betRoulette').value);
    if (isNaN(amt) || amt < 10) return toast("МИНИМАЛЬНАЯ СТАВКА 10₽", 'error');
    if (amt > (userData.balance || 0)) return toast("НЕДОСТАТОЧНО СРЕДСТВ", 'error');

    const betColor = document.getElementById('colorRoulette').value;

    db.ref('users/' + user + '/balance').transaction(b => (b || 0) - amt);

    rouletteSpinning = true;
    const btn = document.getElementById('btnRoulette');
    btn.classList.add('btn-disabled');

    const wheel = document.querySelector('.roulette-wheel');
    const strip = document.getElementById('rouletteStrip');
    const items = Array.from(strip.querySelectorAll('.roulette-item'));

    if (!items.length) { rouletteSpinning = false; btn.classList.remove('btn-disabled'); return; }

    const itemW = items[0].getBoundingClientRect().width || 100;
    const wheelW = wheel.getBoundingClientRect().width;

    // 🎯 выбираем цвет результата (как у тебя было)
    const landedColor = (Math.random() < 0.07) ? 'green' : (Math.random() < 0.5 ? 'red' : 'black');

    // ✅ берём дальний индекс, чтобы красиво прокрутилось
    const targetIndex = Math.floor(Math.random() * 15) + 70;

    // ✅ делаем именно эту ячейку "выпавшей"
    const symbols = { red: '🔴', black: '⚫', green: '🟢' };
    const bg = {
        green: 'rgba(0,255,136,0.1)',
        red: 'rgba(255,0,123,0.1)',
        black: 'rgba(255,255,255,0.05)'
    };

    const t = items[targetIndex];
    t.dataset.color = landedColor;
    t.style.background = bg[landedColor];
    t.innerHTML = `<div style="font-size:36px;">${symbols[landedColor]}</div>`;

    // ✅ ВАЖНО: центрируем targetIndex по центру wheel
    const offset = (wheelW / 2) - (targetIndex * itemW + itemW / 2);
    strip.style.transform = `translateX(${offset}px)`;

    sfx(600);

    setTimeout(() => {
        rouletteSpinning = false;
        btn.classList.remove('btn-disabled');

        // ✅ итоговый цвет берём из реально целевого элемента (то, что видит юзер)
        const finalColor = t.dataset.color;

        // сброс ленты
        strip.style.transition = 'none';
        strip.style.transform = 'translateX(0)';
        setTimeout(() => {
            strip.style.transition = '';
            initRoulette();
        }, 50);

        if (finalColor === betColor) {
            const multi = finalColor === 'green' ? 14 : 2;
            const win = amt * multi;
            const profit = win - amt;

            db.ref('users/' + user).transaction(u => {
                if (u) {
                    u.balance = (u.balance || 0) + win;
                    u.xp = (u.xp || 0) + Math.floor(profit / 10);
                }
                return u;
            });

            addGameHistory('Roulette', amt, profit, 'win');
            checkWinStreak();

            toast(`ВЫПЛАТА: ${win.toLocaleString()} ₽ (${multi}x)`, 'success');
            showWinAnimation(win);
            sfx(1000);
        } else {
            addGameHistory('Roulette', amt, -amt, 'loss');
            toast("ПРОИГРЫШ!", 'error');
            sfx(200, 'sawtooth');
        }
    }, 3200);
}

