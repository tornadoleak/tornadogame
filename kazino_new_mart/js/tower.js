    function toggleTower() {
    const btn = document.getElementById('btnTower');

        if (tower.locked) return;
    // Блокировка кнопки, если игра активна
    if (tower.active) {
        // Если уровень равен 0, игрок не может забрать деньги
        if (tower.level === 0) {
            // Блокируем кнопку
            btn.disabled = true;
            btn.classList.add('btn-disabled');
            // Ждем 2 секунды, затем разблокируем кнопку
            setTimeout(() => {
                btn.disabled = false;
                btn.classList.remove('btn-disabled');
            }, 2000);
            return toast("ПРОЙДИТЕ ХОТЯ БЫ ОДИН УРОВЕНЬ", 'error');
        }
        return collectTower(); // Собираем деньги, если игра активна
    }

    // Начинаем новую игру
    let amt = parseInt(document.getElementById('betTower').value);
    if (isNaN(amt) || amt < 10) return toast("МИНИМАЛЬНАЯ СТАВКА 10₽", 'error');
    if (amt > (userData.balance || 0)) return toast("НЕДОСТАТОЧНО СРЕДСТВ", 'error');

    // Снимаем ставку с баланса
    db.ref('users/' + user + '/balance').transaction(b => (b || 0) - amt);

    // Настроим начальные параметры
    tower = {
        active: true, 
        locked: false,
        bet: amt, 
        level: 0, 
        bombs: [],
        maxLevel: 10 // Можем изменить максимальное количество уровней
    };

    // Заполняем список бомб случайными позициями
    tower.bombs = [];
for (let i = 0; i < tower.maxLevel; i++) {
    tower.bombs.push(Math.floor(Math.random() * 3)); // 0..2
}

    // Обновляем игровое поле
    const grid = document.getElementById('gridTower');
    grid.innerHTML = '';

    // Добавляем ряды (по 3 клетки в каждом ряду)
    for (let row = 0; row < tower.maxLevel; row++) {
        const rowDiv = document.createElement('div');
        rowDiv.style.cssText = 'display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; width:100%;';

        // Создаем ячейки
        for (let col = 0; col < 3; col++) {
            const cell = document.createElement('div');
            cell.className = 'game-cell tower';
            cell.dataset.row = row;
            cell.dataset.col = col;

            // Для первой строки устанавливаем обработчик
            if (row === 0) {
                cell.onclick = () => stepTower(row, col, cell);
            } else {
                cell.style.opacity = '0.3';  // Уменьшаем видимость на других уровнях
            }
            rowDiv.appendChild(cell);
        }
        grid.appendChild(rowDiv);
    }

    // Обновление кнопки
    btn.innerText = "ОТКРОЙТЕ ПЛИТКУ";
    btn.classList.remove('btn-accent');
    btn.classList.add('btn-green');

    // Обновление уровня и множителя
    document.getElementById('towerLevel').innerText = '0';
    document.getElementById('towerMulti').innerText = '1.00x';

    // Уведомление о старте
    toast("НАЧНИТЕ ВОСХОЖДЕНИЕ", 'success');
    sfx(400);
}

// Шаг лесенки
function stepTower(row, col, el) {
    const btn = document.getElementById('btnTower');

    // важно: приведение типов
    row = Number(row);
    col = Number(col);

    if (!tower.active || tower.locked) return;
    if (row !== tower.level) return;

    // ❗️после выбора 1 клетки в ряду — отключаем ВСЕ клетки этого ряда
    document.querySelectorAll(`.game-cell.tower[data-row="${row}"]`).forEach(c => {
        c.onclick = null;
        c.style.opacity = '0.55';
    });

    const bombCol = Number(tower.bombs[row]); // на всякий
    const isBomb = (bombCol === col);

    if (isBomb) {
        // проигрыш
        tower.active = false;
        tower.locked = true;

        el.classList.add('death');
        el.innerText = '💣';
        el.style.opacity = '1';

        // показываем где была бомба (на случай если кликнул не на неё — но у нас клик именно по ней)
        document.querySelectorAll(`.game-cell.tower[data-row="${row}"]`).forEach(c => {
            if (Number(c.dataset.col) === bombCol) {
                c.classList.add('death');
                c.innerText = '💣';
                c.style.opacity = '1';
            }
        });

        // кнопка как в mines: забрать нельзя
        btn.disabled = true;
        btn.classList.add('btn-disabled');
        btn.innerText = "ПРОИГРЫШ...";

        addGameHistory('Tower', tower.bet, -tower.bet, 'loss');
        toast("ПРОВАЛ! СТАВКА ПОТЕРЯНА", 'error');
        sfx(100, 'sawtooth', 0.5);

        // через 2 сек сброс интерфейса
        setTimeout(() => {
            document.getElementById('gridTower').innerHTML = '';
            btn.disabled = false;
            btn.classList.remove('btn-disabled', 'btn-green');
            btn.classList.add('btn-accent');
            btn.innerText = "НАЧАТЬ ВОСХОЖДЕНИЕ";

            document.getElementById('towerLevel').innerText = '0';
            document.getElementById('towerMulti').innerText = '1.00x';

            tower.locked = false;
            tower.bet = 0;
            tower.level = 0;
            tower.bombs = [];
        }, 2000);

        return;
    }

    // выигрышный шаг
    el.classList.add('active');
    el.innerText = '⭐';
    el.style.opacity = '1';
    sfx(700);

    tower.level++;

    const curMult = Math.pow(1.4, tower.level);
    const payout = Math.floor(tower.bet * curMult);

    document.getElementById('towerLevel').innerText = tower.level;
    document.getElementById('towerMulti').innerText = curMult.toFixed(2) + 'x';
    btn.innerText = `ЗАБРАТЬ ${payout.toLocaleString()} ₽`;

    // открываем СЛЕДУЮЩИЙ ряд (и только его)
    if (tower.level < tower.maxLevel) {
        document.querySelectorAll(`.game-cell.tower[data-row="${tower.level}"]`).forEach(c => {
            c.style.opacity = '1';
            c.onclick = () => stepTower(Number(c.dataset.row), Number(c.dataset.col), c);
        });
    } else {
        collectTower();
    }

    if (tower.level >= tower.maxLevel) checkAchievement('tower_master');
}

function collectTower() {
    if (!tower.active || tower.level === 0) return toast("ПРОЙДИТЕ ХОТЯ БЫ ОДИН УРОВЕНЬ", 'error');
    
    const curMult = Math.pow(1.4, tower.level);
    let win = Math.floor(tower.bet * curMult);
    let profit = win - tower.bet;
    
    db.ref('users/' + user).transaction(u => {
        if (u) {
            u.balance = (u.balance || 0) + win;
            u.xp = (u.xp || 0) + Math.floor(profit / 10);
        }
        return u;
    });
    
    addGameHistory('Tower', tower.bet, profit, 'win');
    checkWinStreak();
    
    tower.active = false;
    toast(`ЗАБРАЛ: ${win.toLocaleString()} ₽ (${curMult.toFixed(2)}x)`, 'success');
    showWinAnimation(win);
    sfx(1100);
    
    document.getElementById('gridTower').innerHTML = '';
    const btn = document.getElementById('btnTower');
    btn.innerText = "НАЧАТЬ ВОСХОЖДЕНИЕ";
    btn.classList.remove('btn-green');
    btn.classList.add('btn-accent');
    document.getElementById('towerLevel').innerText = '0';
    document.getElementById('towerMulti').innerText = '1.00x';
}

function resetTowerUI() {
    const btn = document.getElementById('btnTower');
    document.getElementById('gridTower').innerHTML = '';
    document.getElementById('towerLevel').innerText = '0';
    document.getElementById('towerMulti').innerText = '1.00x';

    btn.innerText = "НАЧАТЬ ВОСХОЖДЕНИЕ";
    btn.disabled = false;
    btn.classList.remove('btn-disabled', 'btn-green');
    btn.classList.add('btn-accent');

    tower.active = false;
    tower.locked = false;
    tower.bet = 0;
    tower.level = 0;
    tower.bombs = [];
}
    
