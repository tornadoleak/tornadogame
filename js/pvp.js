    function createPVPRoom() {
        let amt = parseInt(document.getElementById('betPVP').value);
        if(isNaN(amt) || amt < 50) return toast("МИНИМАЛЬНАЯ СТАВКА 50₽", 'error');
        if(amt > (userData.balance || 0)) return toast("НЕДОСТАТОЧНО СРЕДСТВ", 'error');
        
        const side = document.getElementById('sidePVP').value;
        
        db.ref('users/'+user+'/balance').transaction(b => (b || 0) - amt);
        
        const room = {
            creator: user,
            bet: amt,
            side: side,
            createdAt: Date.now()
        };
        
        db.ref('pvp').push(room);
        toast("КОМНАТА СОЗДАНА", 'success');
        sfx(600);
    }

    function loadPVPRooms() {
  db.ref('pvp').on('value', snap => {
    const cont = document.getElementById('pvpRooms');
    cont.innerHTML = '';

    const rooms = [];
    snap.forEach(room => {
      const data = room.val();
      if(!data) return;
      rooms.push({ key: room.key, ...data });
    });

    // новые сверху
    rooms.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

    rooms.forEach(r => {
      const div = document.createElement('div');
      div.className = 'pvp-room';

      // ✅ ВАША КОМНАТА (показываем + отмена)
      if (r.creator === user) {
        const taken = !!r.takenBy; // если уже кто-то "захватил" (см. join ниже)
        div.style.borderColor = 'var(--accent)';
        const cls = taken ? 'btn-ui btn-pink btn-disabled' : 'btn-ui btn-pink';
const dis = taken ? 'disabled' : '';

div.innerHTML = `
  <div>
    <div style="font-weight:900; color:var(--accent);">ВАША КОМНАТА</div>
    <div style="font-size:11px; color: var(--muted);">
      ${Number(r.bet||0).toLocaleString()}₽ • ${r.side==='heads'?'🪙 ОРЁЛ':'🎯 РЕШКА'}
      ${taken ? ' • <b style="color:var(--gold)">ПРИНЯЛИ...</b>' : ''}
    </div>
  </div>
  <button class="${cls}" style="padding:10px 20px; font-size:11px;"
    onclick="cancelPVPRoom('${r.key}')" ${dis}>
    ОТМЕНИТЬ
  </button>
`;
        cont.appendChild(div);
        return;
      }

      // ✅ ЧУЖИЕ КОМНАТЫ (кнопка принять)
      div.innerHTML = `
        <div>
          <div style="font-weight:800; color:var(--pink);">${String(r.creator||'').toUpperCase()}</div>
          <div style="font-size:11px; color: var(--muted);">
            ${Number(r.bet||0).toLocaleString()}₽ • ${r.side==='heads'?'🪙 ОРЁЛ':'🎯 РЕШКА'}
          </div>
        </div>
        <button class="btn-ui btn-pink" style="padding:10px 20px; font-size:11px;"
          onclick="joinPVP('${r.key}')">
          ПРИНЯТЬ
        </button>
      `;
      cont.appendChild(div);
    });

    if (!rooms.length) {
      cont.innerHTML = '<div style="text-align:center; color: var(--muted); padding:40px;">НЕТ АКТИВНЫХ КОМНАТ</div>';
    }
  });
}
    function cancelPVPRoom(roomKey){
  const ref = db.ref('pvp/' + roomKey);
  let refund = 0;

  ref.transaction(cur => {
    if(!cur) return;                 // уже удалена
    if(cur.creator !== user) return; // не твоя
    if(cur.takenBy) return;          // уже кто-то принял
    refund = Number(cur.bet || 0);
    return null;                     // ✅ удалить комнату
  }).then(res => {
    if(!res.committed){
      return toast("НЕ УДАЛОСЬ ОТМЕНИТЬ (ЕЁ УЖЕ ПРИНЯЛИ)", 'error');
    }

    if(refund > 0){
      db.ref('users/' + user + '/balance').transaction(b => (b || 0) + refund);
    }

    toast(`КОМНАТА ОТМЕНЕНА +${refund.toLocaleString()}₽`, 'success');
    sfx(800);
  }).catch(() => {
    toast("ОШИБКА ОТМЕНЫ КОМНАТЫ", 'error');
  });
}

    function joinPVP(roomKey){
  const roomRef = db.ref('pvp/' + roomKey);

  // 1) атомарно "занимаем" комнату
  roomRef.transaction(cur => {
    if(!cur) return;                 // комнаты нет
    if(cur.creator === user) return; // нельзя принять свою
    if(cur.takenBy) return;          // уже заняли
    cur.takenBy = user;
    cur.takenAt = Date.now();
    return cur;
  }).then(res => {
    if(!res.committed){
      return toast("КОМНАТУ УЖЕ ПРИНЯЛИ", 'error');
    }

    const data = res.snapshot.val() || {};
    const bet = Number(data.bet || 0);
    const creator = data.creator;
    const creatorSide = data.side;

    // 2) проверяем баланс и списываем
    db.ref('users/' + user + '/balance').transaction(b => {
      b = b || 0;
      if(b < bet) return; // abort
      return b - bet;
    }).then(br => {
      if(!br.committed){
        // не хватило денег -> отпускаем комнату
        roomRef.child('takenBy').remove();
        roomRef.child('takenAt').remove();
        return toast("НЕДОСТАТОЧНО СРЕДСТВ", 'error');
      }

      // 3) играем
      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      const creatorWon = result === creatorSide;

      const winner = creatorWon ? creator : user;
      const totalPot = bet * 2;
      const fee = Math.floor(totalPot * 0.05);
      const payout = totalPot - fee;

      db.ref('users/' + winner + '/balance').transaction(b => (b || 0) + payout);

      if(winner === user) {
        const profit = payout - bet;
        addGameHistory('PVP', bet, profit, 'win');
        checkWinStreak();
        toast(`ПОБЕДА В PVP! +${profit.toLocaleString()}₽`, 'success');
        showWinAnimation(profit);
        sfx(1200);
      } else {
        addGameHistory('PVP', bet, -bet, 'loss');
        toast("ПРОИГРЫШ В PVP", 'error');
        sfx(200, 'sawtooth');
      }

      // 4) удаляем комнату
      roomRef.remove();
    });
  }).catch(() => {
    toast("ОШИБКА ПРИНЯТИЯ КОМНАТЫ", 'error');
  });
}

  const CASES_META = [
  { id: "rtp_starter",  cost: 200,   min: 50,   max: 1000 },
  { id: "rtp_basic",    cost: 500,   min: 100,  max: 3000 },
  { id: "rtp_gold",     cost: 2000,  min: 500,  max: 8000 },
  { id: "rtp_platinum", cost: 5000,  min: 2000, max: 20000 },
  { id: "rtp_elite",    cost: 10000, min: 5000, max: 50000 }
];

