    function minesMultiplier(opened, bombs, edge = 0.04) {
    let mult = 1;
    for (let i = 0; i < opened; i++) {
        mult *= (25 - i) / (25 - bombs - i);
    }
    mult *= (1 - edge);
    return mult;
}
    function toggleMines() {
        if (mines.locked) return;
        if(mines.active) return collectMines();
        
        let amt = parseInt(document.getElementById('betMines').value);
        if(isNaN(amt) || amt < 10) return toast("МИНИМАЛЬНАЯ СТАВКА 10₽", 'error');
        if(amt > (userData.balance || 0)) return toast("НЕДОСТАТОЧНО СРЕДСТВ", 'error');
        
        db.ref('users/'+user+'/balance').transaction(b => (b || 0) - amt);
        
        mines = { 
            active: true, 
            locked: false,
            bet: amt, 
            bombs: [], 
            open: 0, 
            total: parseInt(document.getElementById('cntMines').value) 
        };
        
        while(mines.bombs.length < mines.total) {
            let r = Math.floor(Math.random()*25);
            if(!mines.bombs.includes(r)) mines.bombs.push(r);
        }
        
        const g = document.getElementById('gridMines'); 
        g.innerHTML = '';
        for(let i=0; i<25; i++) {
            const c = document.createElement('div');
            c.className = 'game-cell';
            c.dataset.index = i;
            c.onclick = () => openMine(i, c);
            g.appendChild(c);
        }
        
        document.getElementById('btnMines').innerText = "ОТКРОЙТЕ КЛЕТКУ";
        document.getElementById('btnMines').classList.remove('btn-accent');
        document.getElementById('btnMines').classList.add('btn-green');
        document.getElementById('minesOpened').innerText = '0';
        document.getElementById('minesMulti').innerText = '1.00x';
        
        toast("ИГРА НАЧАЛАСЬ", 'success');
        sfx(400);
    }

    function openMine(idx, el) {
        if(!mines.active || el.classList.contains('active') || el.classList.contains('death')) return;
        
        if(mines.bombs.includes(idx)) {
            mines.active = false; 
            mines.locked = true;
            const btn = document.getElementById('btnMines');
            btn.innerText = "ПРОИГРЫШ...";
            btn.classList.add('btn-disabled');
            el.classList.add('death'); 
            el.innerText = '💣';
            
            document.querySelectorAll('.game-cell').forEach((cell, i) => {
                cell.onclick = null;
                if(mines.bombs.includes(i) && i !== idx) {
                    setTimeout(() => {
                        cell.classList.add('death');
                        cell.innerText = '💣';
                    }, Math.random() * 500);
                }
            });
            
            addGameHistory('Mines', mines.bet, -mines.bet, 'loss');
            
            sfx(100, 'sawtooth', 0.5);
            toast("ВЗРЫВ! СТАВКА ПОТЕРЯНА", 'error');
            
            setTimeout(() => { 
                document.getElementById('gridMines').innerHTML = '';
                const btn = document.getElementById('btnMines');
                btn.innerText = "НАЧАТЬ ИГРУ";
                btn.classList.remove('btn-green');
                btn.classList.add('btn-accent');
                document.getElementById('minesOpened').innerText = '0';
                document.getElementById('minesMulti').innerText = '1.00x';
                mines.locked = false;
                mines.bet = 0;
                mines.open = 0;
                mines.bombs = [];
                btn.classList.remove('btn-disabled');
            }, 2000);
        } else {
            mines.open++; 
            el.classList.add('active'); 
            el.innerText = '💎'; 
            el.onclick = null;
            sfx(600);
            
            let curMult = minesMultiplier(mines.open, mines.total, 0.04);
            let payout = Math.floor(mines.bet * curMult);   
            document.getElementById('btnMines').innerText = `ЗАБРАТЬ ${payout.toLocaleString()} ₽`;
            document.getElementById('minesOpened').innerText = mines.open;
            document.getElementById('minesMulti').innerText = curMult.toFixed(2) + 'x';
        }
    }

    function collectMines() {
        if (!mines.active) return toast("ИГРА НЕ АКТИВНА — НАЖМИТЕ «НАЧАТЬ ИГРУ»", 'error');
        if (mines.open === 0) return toast("ОТКРОЙТЕ ХОТЯ БЫ ОДНУ КЛЕТКУ", 'error');

        let curMult = minesMultiplier(mines.open, mines.total, 0.04);
        let win = Math.floor(mines.bet * curMult);
        let profit = win - mines.bet;
        
        db.ref('users/'+user).transaction(u => { 
            if(u) { 
                u.balance = (u.balance || 0) + win; 
                u.xp = (u.xp || 0) + Math.floor(profit / 10);
            } 
            return u; 
        });
        
        addGameHistory('Mines', mines.bet, profit, 'win');
        checkWinStreak();
        
        mines.active = false;
        toast(`ЗАБРАЛ: ${win.toLocaleString()} ₽ (${curMult.toFixed(2)}x)`, 'success');
        showWinAnimation(win);
        sfx(900);
        
        document.getElementById('gridMines').innerHTML = '';
        const btn = document.getElementById('btnMines');
        btn.innerText = "НАЧАТЬ ИГРУ";
        btn.classList.remove('btn-green');
        btn.classList.add('btn-accent');
        document.getElementById('minesOpened').innerText = '0';
        document.getElementById('minesMulti').innerText = '1.00x';
    }
    
