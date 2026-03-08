    function subscribeCrashHistory(){
  db.ref('crashHistory').orderByChild('time').limitToLast(12).on('value', snap => {
    const arr = [];
    snap.forEach(s => {
      const v = s.val();
      if(v && typeof v.x === 'number') arr.push(v.x);
    });
    crashHistory = arr.reverse();
    renderCrashHistory();
  });
}
    subscribeCrashHistory();
    
  function pushCrashHistoryGlobal(roundId, x){
  db.ref('crashHistory').child(String(roundId)).set({
    x: Number(x.toFixed(2)),
    time: serverNow()
  });
}
    
    // ===== SHARED CRASH (ONE FOR ALL USERS) =====
let serverOffset = 0;
db.ref(".info/serverTimeOffset").on("value", s => {
  serverOffset = s.val() || 0;
});
function serverNow(){ return Date.now() + serverOffset; }

let crashState = null;
let crashCountdownTimer = null;
let isCrashHost = false;
let crashHostTimer = null;
const HOST_LEASE_MS = 12000;   // если хост не обновлялся 12с — считаем мёртвым
const HOST_BEAT_MS  = 3000;    // хост обновляет at раз в 3с
let hostBeatTimer = null;

// ✅ НОВОЕ распределение без "дырки" 5.2–20
// Шансы по диапазонам:
// 55%: 1.00–2.00
// 25%: 2.00–5.00
// 12%: 5.00–10.00
//  6%: 10.00–20.00
//  2%: 20.00–50.00
function genCrashTarget(){
  const r = Math.random();
  let x;

  if (r < 0.55) {
    // 1–2 (чаще ближе к 1)
    x = 1 + Math.pow(Math.random(), 1.8) * 1.0;
  } else if (r < 0.80) {
    // 2–5
    x = 2 + Math.pow(Math.random(), 1.5) * 3.0;
  } else if (r < 0.92) {
    // 5–10
    x = 5 + Math.pow(Math.random(), 1.3) * 5.0;
  } else if (r < 0.98) {
    // 10–20
    x = 10 + Math.pow(Math.random(), 1.2) * 10.0;
  } else {
    // 20–50 (редко, и чаще ближе к 20 чем к 50)
    x = 20 + Math.pow(Math.random(), 2.0) * 30.0;
  }

  return Number(x.toFixed(2));
}
// ✅ ONLINE PRESENCE (сколько игроков онлайн)
let onlineInterval = null;
let presenceListenerRef = null;

function startPresence(){
  if(!user) return;

  const presRef = db.ref('presence');
  const myRef = presRef.child(String(user));

  // отметили себя онлайн
  const now = (typeof serverNow === 'function') ? serverNow() : Date.now();

  myRef.onDisconnect().remove();
  myRef.set({ at: now }).catch(()=>{});

  // heartbeat чтобы “онлайн” был живой (иначе на мобилках залипает)
  if(onlineInterval) clearInterval(onlineInterval);
  onlineInterval = setInterval(() => {
    const t = (typeof serverNow === 'function') ? serverNow() : Date.now();
    myRef.update({ at: t }).catch(()=>{});
  }, 8000);

  // слушаем всех и считаем активных за последние 20 сек
  if(presenceListenerRef) presenceListenerRef.off();
  presenceListenerRef = presRef;

  presRef.on('value', snap => {
    const v = snap.val() || {};
    const now2 = (typeof serverNow === 'function') ? serverNow() : Date.now();

    let count = 0;
    Object.keys(v).forEach(k => {
      const at = Number(v[k]?.at || 0);
      if(now2 - at < 20000) count++;
    });

    const el = document.getElementById('onlineCount');
    if(el) el.textContent = String(count);
  });
}
    const DAILY_EVENT = { minMult: 10, reward: 5000 };

function dayKey(){
  const t = (typeof serverNow === 'function') ? serverNow() : Date.now();
  return new Date(t).toISOString().slice(0,10); // UTC-день
}

function renderDailyEventBanner(done){
  const el = document.getElementById('eventBanner');
  if(!el) return;

  if(done){
    el.style.borderColor = 'rgba(0,255,136,0.35)';
    el.innerHTML = `🎉 EVENT выполнен сегодня • +${DAILY_EVENT.reward.toLocaleString()} ₽`;
  } else {
    el.style.borderColor = 'rgba(255,204,0,0.35)';
    el.innerHTML = `🎯 EVENT: поймай ≥${DAILY_EVENT.minMult}x сегодня → +${DAILY_EVENT.reward.toLocaleString()} ₽`;
  }
}

function watchDailyEvent(){
  if(!user) return;
  const key = dayKey();
  db.ref(`events/daily10x/${key}/${user}`).on('value', s => {
    renderDailyEventBanner(!!s.val());
  });
}

function tryClaimDailyEvent(mult){
  if(mult < DAILY_EVENT.minMult) return;
  if(!user) return;

  const key = dayKey();
  const ref = db.ref(`events/daily10x/${key}/${user}`);
  const now = (typeof serverNow === 'function') ? serverNow() : Date.now();

  ref.transaction(cur => {
    if(cur) return; // уже получал сегодня
    return { at: now, mult: Number(mult.toFixed(2)) };
  }).then(res => {
    if(res.committed){
      db.ref('users/'+user+'/balance').transaction(b => (b||0) + DAILY_EVENT.reward);
      toast(`🎉 EVENT: +${DAILY_EVENT.reward.toLocaleString()} ₽ за ${DAILY_EVENT.minMult}x!`, 'gold');
      showWinAnimation(DAILY_EVENT.reward);
      sfx([1200, 1600], 'square', 0.25, 0.12);
    }
  }).catch(()=>{});
}

function stopPresence(){
  try{
    if(onlineInterval) clearInterval(onlineInterval);
    onlineInterval = null;

    if(presenceListenerRef) presenceListenerRef.off();
    presenceListenerRef = null;

    if(user) db.ref('presence').child(String(user)).remove().catch(()=>{});
  }catch(e){}
}
    
function initCrashShared(){
  // слушаем состояние раунда
  db.ref("crash").on("value", snap => {
    crashState = snap.val() || null;
    applyCrashState(crashState);
  });

  // ✅ следим за хостом и перехватываем, если он "протух"
  db.ref("crashHost").on("value", snap => {
    const h = snap.val();
    const now = serverNow();
    const dead = !h || !h.at || (now - h.at) > HOST_LEASE_MS;
    if (dead) tryBecomeCrashHost();
  });

  // пробуем стать "ведущим" (только один человек управляет раундами)
  tryBecomeCrashHost();

  // если не хост — раз в 5 сек пробуем забрать, когда хост умер
  setInterval(() => {
    if (!isCrashHost) tryBecomeCrashHost();
  }, 5000);
}

const HOST_TTL = 15000; // 15 сек - если хост не обновлялся, его можно забрать
    
function tryBecomeCrashHost(){
  if(!user) return;

  const hostRef = db.ref("crashHost");
  const now = serverNow();

  hostRef.transaction(cur => {
    // если нет хоста
    if(!cur || !cur.u) return { u: user, at: now };

    // если хост "мертвый" (не обновлялся)
    if(now - (cur.at || 0) > HOST_TTL) return { u: user, at: now };

    return; // иначе не забираем
  }).then(res => {
    const v = res.snapshot.val();
    if(res.committed && v && v.u === user){
      isCrashHost = true;
      hostRef.onDisconnect().remove();
      startCrashHostLoop();
    } else {
      isCrashHost = false;
    }
  }).catch(()=>{});
}

function startCrashHostLoop(){
  if(crashHostTimer) clearInterval(crashHostTimer);

  const hostRef = db.ref("crashHost");
  let lastBeat = 0;

  crashHostTimer = setInterval(() => {
    const now = serverNow();
    const st = crashState || null;

    // ✅ heartbeat хоста (чтобы не залипал)
    if(now - lastBeat > 2000){
      lastBeat = now;
      hostRef.update({ at: now });
    }

    // если состояния нет — создаём WAITING
    if(!st || !st.phase){
      return db.ref("crash").set({
        phase: "waiting",
        roundId: now,
        startAt: now + 5000,
        targetX: genCrashTarget()
      });
    }

    // WAITING
    if(st.phase === "waiting"){
      // ✅ если кто-то завис и startAt уже давно прошёл — сдвигаем старт вперёд
      if(now - (st.startAt || 0) > 10000){
        return db.ref("crash").update({ startAt: now + 2000 });
      }

      // ✅ старт раунда
      if(now >= (st.startAt || 0)){
        return db.ref("crash").update({
          phase: "running",
          runAt: now // ❗ВАЖНО: ставим runAt = NOW (а не старый startAt)
        });
      }
      return;
    }

    // RUNNING -> CRASHED
    if(st.phase === "running"){
      const runAt = st.runAt || now;
      const elapsed = Math.max(0, (now - runAt) / 1000);
      const mult = Math.pow(1.08, elapsed);

      if(mult >= (st.targetX || 1.1)){
        const finalX = Number((st.targetX || mult).toFixed(2));

        // ✅ пишем историю по roundId (без дублей)
        pushCrashHistoryGlobal(st.roundId || runAt, finalX);

        return db.ref("crash").update({
          phase: "crashed",
          finalX,
          crashAt: now,
          nextAt: now + 3000
        });
      }
      return;
    }

    // CRASHED -> WAITING
    if(st.phase === "crashed" && now >= (st.nextAt || 0)){
      return db.ref("crash").set({
        phase: "waiting",
        roundId: now,
        startAt: now + 5000,
        targetX: genCrashTarget()
      });
    }
  }, 250);
}

function startCrashHostHeartbeat(){
  if(hostBeatTimer) clearInterval(hostBeatTimer);

  hostBeatTimer = setInterval(() => {
    if(!isCrashHost) return;
    db.ref("crashHost").update({ u: user, at: serverNow() }).catch(()=>{});
  }, HOST_BEAT_MS);
}
    
// визуализация на клиенте
function applyCrashState(st){
  const multEl = document.getElementById("crashMult");
  const profitEl = document.getElementById("crashProfit");
  const statusEl = document.getElementById("crashStatus");

  if(!multEl || !statusEl) return;

  // всегда рисуем историю если есть
  if(typeof renderCrashHistory === "function") renderCrashHistory();

  // стоп таймеров
  if(crashCountdownTimer) { clearInterval(crashCountdownTimer); crashCountdownTimer = null; }

  // если нет состояния — просто ожидание
  if(!st || !st.phase){
    statusEl.className = "status-indicator status-waiting";
    statusEl.innerText = "ОЖИДАНИЕ";
    multEl.style.color = "#fff";
    multEl.innerText = "—";
    return;
  }

  // WAITING
  if(st.phase === "waiting"){
      // ✅ если ставка осталась от прошлого раунда — убираем
if (crash.bet > 0 && crash.betRoundId && st.roundId && crash.betRoundId !== st.roundId) {
  crash.bet = 0;
  crash.cashed = false;
  crash.betRoundId = null;
}
    // остановить график
    if(crashInterval) { clearInterval(crashInterval); crashInterval = null; }
    crash.active = false;
    crash.mult = 1.0;
    crash.cashed = false;
    profitEl.innerText = "";
    setCrashMultStyle(multEl, '#fff');

    statusEl.className = "status-indicator status-waiting";
    statusEl.innerText = "ОЖИДАНИЕ";

    // кнопка: если ставка уже сделана — ждать раунда
    const btn = document.getElementById("btnCrash");
    if(btn){
      if(crash.bet > 0){
        btn.innerText = "ОЖИДАНИЕ РАУНДА...";
        btn.classList.add("btn-disabled");
      } else {
        btn.innerText = "СДЕЛАТЬ СТАВКУ";
        btn.classList.remove("btn-disabled","btn-green");
        btn.classList.add("btn-accent");
      }
    }

    // обратный отсчёт до startAt
    crashCountdownTimer = setInterval(() => {
      const left = Math.max(0, ((st.startAt || serverNow()) - serverNow()) / 1000);
      multEl.innerText = left.toFixed(1) + "s";
    }, 100);

    startCrashWaitingTicks();  
    return;
  }

  // RUNNING
  if(st.phase === "running"){
    statusEl.className = "status-indicator status-active";
    statusEl.innerText = "АКТИВНО";

    // если у игрока есть ставка — кнопка "забрать"
    const btn = document.getElementById("btnCrash");
    if(btn){
      if(crash.bet > 0 && !crash.cashed){
        btn.innerText = "ЗАБРАТЬ ВЫИГРЫШ";
        btn.classList.remove("btn-disabled","btn-accent");
        btn.classList.add("btn-green");
      } else if(crash.bet === 0) {
        btn.innerText = "СТАВОК НЕТ";
        btn.classList.add("btn-disabled");
      }
    }

    startCrashRunningBeeps();
    // запустить локальную отрисовку (но цель берём из st.targetX)
    startCrashVisual(st.runAt || serverNow(), st.targetX || 1.2);
    return;
  }

  // CRASHED
  if(st.phase === "crashed"){
    crashBoom();
    if(crashInterval) { clearInterval(crashInterval); crashInterval = null; }
    crash.active = false;

    multEl.innerText = "CRASH!";
    setCrashMultStyle(multEl, "var(--pink)");
    profitEl.innerText = "";

    statusEl.className = "status-indicator status-crashed";
    statusEl.innerText = "КРАШ!";

    // если ставка была и не кешаутнул — проигрыш
    if(crash.bet > 0 && !crash.cashed){
      addGameHistory('Crash', crash.bet, -crash.bet, 'loss');
      toast("КРАШ! СТАВКА ПОТЕРЯНА", 'error');
      crash.bet = 0;
      crash.cashed = false;
    }

    return;
  }
}
    function cssVar(name, fallback){
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function startCrashVisual(runAtMs, targetX){
  if(crashInterval) return;

  crash.active = true;
  crash.startTime = runAtMs;
  crash.pts = []; // {t, m}

  const cvs = document.getElementById('crashCanvas');
  const ctx = cvs.getContext('2d');

  const WINDOW_SEC = 12;              // сколько секунд показываем на графике
  const MAX_POINTS = 900;
  const pad = 22;

  function resize(){
    cvs.width  = cvs.offsetWidth;
    cvs.height = cvs.offsetHeight;
  }
  resize();

  // 🧠 маппинг Y без палёва targetX: асимптотически стремится к верху
  function yFracFromMult(mult){
    const k = 0.9; // форма кривой (0.7-1.1 норм)
    mult = Math.max(1, mult || 1);
    return 1 - 1 / Math.pow(mult, k); // 1->0, 2->~0.46, 5->~0.83, 20->~0.97
  }

  crashInterval = setInterval(() => {
    // ресайз на всякий
    if (cvs.width !== cvs.offsetWidth || cvs.height !== cvs.offsetHeight) resize();

    const now = serverNow();
    const elapsed = Math.max(0, (now - runAtMs) / 1000);

    // мультик как у тебя (shared crash)
    crash.mult = Math.pow(1.08, elapsed);

    // сохраняем точки
    crash.pts.push({ t: now, m: crash.mult });
    if (crash.pts.length > MAX_POINTS) crash.pts.shift();

    // чистим старые точки (скользящее окно)
    const cut = now - WINDOW_SEC * 1000;
    while (crash.pts.length && crash.pts[0].t < cut) crash.pts.shift();

    // ===== DRAW =====
    ctx.clearRect(0,0,cvs.width,cvs.height);

    const W = Math.max(10, cvs.width  - pad * 2);
    const H = Math.max(10, cvs.height - pad * 2);

    const lineCol = cssVar('--accent', '#00f2ff');
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 14;
    ctx.shadowColor = lineCol;

    ctx.beginPath();
    ctx.moveTo(pad, pad + H);

    for (const p of crash.pts){
      // X = позиция во времени внутри окна (0..1)
      const xFrac = (p.t - cut) / (WINDOW_SEC * 1000);
      const yFrac = yFracFromMult(p.m);

      const x = pad + Math.max(0, Math.min(1, xFrac)) * W;
      const y = pad + (1 - Math.max(0, Math.min(1, yFrac))) * H;
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    // ===== UI =====
    const multEl = document.getElementById("crashMult");
    if(multEl){
      multEl.innerText = crash.mult.toFixed(2) + 'x';
      const col = (typeof crashColorStrict === "function") ? crashColorStrict(crash.mult) : '#fff';
      setCrashMultStyle(multEl, col);
    }

    if(crash.bet > 0 && !crash.cashed){
      const payout = Math.floor(crash.bet * crash.mult);
      const profitEl = document.getElementById("crashProfit");
      if(profitEl) profitEl.innerText = payout.toLocaleString() + " ₽";

      const auto = parseFloat(document.getElementById('autoCrash').value);
      if(!isNaN(auto) && auto > 1 && crash.mult >= auto){
        actionCrash();
      }
    }

  }, 50);
}
    const cvs = document.getElementById('crashCanvas');
    const ctx = cvs.getContext('2d');

    /* ===== LEGACY LOCAL CRASH (DISABLED) =====
    function initCrash() {
        crash.active = false; 
        crash.mult = 1.0; 
        crash.cashed = false; 
        crash.pts = [];
        crash.waitingForRound = false;
        crash.bet = 0;
        
        document.getElementById('crashMult').style.color = '#fff';
        document.getElementById('crashProfit').innerText = '';
        
        const btn = document.getElementById('btnCrash');
        btn.innerText = "СДЕЛАТЬ СТАВКУ";
        btn.classList.remove('btn-disabled', 'btn-green');
        btn.classList.add('btn-accent');
        
        const status = document.getElementById('crashStatus');
        status.className = 'status-indicator status-waiting';
        status.innerText = 'ОЖИДАНИЕ';
        
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        
        let timer = 5;
        const countdown = setInterval(() => {
            document.getElementById('crashMult').innerText = timer.toFixed(1) + 's';
            timer -= 0.1;
            if(timer <= 0) { 
                clearInterval(countdown); 
                startCrash(); 
                renderCrashHistory();
            }
        }, 100);
    }

    function startCrash() {
        crash.active = true;
        crash.startTime = Date.now();
        crash.pts = [];
        cvs.width = cvs.offsetWidth; 
        cvs.height = cvs.offsetHeight;
        
        const btn = document.getElementById('btnCrash');
        const status = document.getElementById('crashStatus');
        status.className = 'status-indicator status-active';
        status.innerText = 'АКТИВНО';
        
        if(crash.bet > 0) {
            btn.innerText = "ЗАБРАТЬ ВЫИГРЫШ";
            btn.classList.remove('btn-disabled', 'btn-accent');
            btn.classList.add('btn-green');
        } else {
            btn.innerText = "СТАВОК НЕТ";
            btn.classList.add('btn-disabled');
        }
        
        let target = (Math.random() < 0.12) ? (1.0 + Math.random() * 0.8) : (Math.random() * 4 + 1.2);
        if(Math.random() < 0.015) target = 20 + Math.random() * 30;

        crashInterval = setInterval(() => {
            let elapsed = (Date.now() - crash.startTime) / 1000;
            crash.mult = Math.pow(1.08, elapsed);
            
            ctx.clearRect(0,0,cvs.width, cvs.height);
            ctx.strokeStyle = '#00f2ff'; 
            ctx.lineWidth = 4;
            ctx.shadowBlur = 10; 
            ctx.shadowColor = '#00f2ff';
            
            let x = (elapsed / 12) * cvs.width;
            let y = cvs.height - ((crash.mult - 1) / 4) * cvs.height;
            crash.pts.push({x, y});
            
            ctx.beginPath();
            ctx.moveTo(0, cvs.height);
            crash.pts.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.stroke();

            if(crash.mult >= target) {
                clearInterval(crashInterval);
                crash.active = false;
                const finalX = Number(crash.mult.toFixed(2));
                document.getElementById('crashMult').innerText = 'CRASH!';
                document.getElementById('crashMult').style.color = 'var(--pink)';
                document.getElementById('crashProfit').innerText = '';
                
                status.className = 'status-indicator status-crashed';
                status.innerText = 'КРАШ!';
                
                if(crash.bet > 0 && !crash.cashed) {
                    addGameHistory('Crash', crash.bet, -crash.bet, 'loss');
                    toast("КРАШ! СТАВКА ПОТЕРЯНА", 'error');
                }
                
                sfx(100, 'sawtooth', 0.4);
                setTimeout(initCrash, 3000);
            } else {
                document.getElementById('crashMult').innerText = crash.mult.toFixed(2) + 'x';
                document.getElementById('crashMult').style.color = crashColorStrict(crash.mult);
                if(crash.bet > 0 && !crash.cashed) {
                    let payout = Math.floor(crash.bet * crash.mult);
                    document.getElementById('crashProfit').innerText = payout.toLocaleString() + ' ₽';
                    
                    let auto = parseFloat(document.getElementById('autoCrash').value);
                    if(!isNaN(auto) && auto > 1 && crash.mult >= auto) {
                        actionCrash();
                    }
                }
                
                if(crash.mult >= 50) {
                    checkAchievement('crash_god');
                }
            }
        }, 50);
    } */

    function actionCrash() {
        const btn = document.getElementById('btnCrash');
        
        if((crashState?.phase === "waiting") && crash.bet === 0) {
            let amt = parseInt(document.getElementById('betCrash').value);
            if(isNaN(amt) || amt < 10) return toast("МИНИМАЛЬНАЯ СТАВКА 10₽", 'error');
            if(amt > (userData.balance || 0)) return toast("НЕДОСТАТОЧНО СРЕДСТВ", 'error');
            
            crash.bet = amt;
crash.cashed = false;
crash.betRoundId = crashState?.roundId || null;

db.ref('users/'+user+'/balance').transaction(b => (b || 0) - amt);
            
            btn.innerText = "ОЖИДАНИЕ РАУНДА...";
            btn.classList.add('btn-disabled');
            toast("СТАВКА ПРИНЯТА", 'success');
            sfx(400);
            
            if(amt >= 10000) checkAchievement('high_roller');
        } 
        else if(crash.active && crash.bet > 0 && !crash.cashed) {
            const betAmt = crash.bet;
            crash.cashed = true;
            crashCashout();
            let win = Math.floor(crash.bet * crash.mult);
            let profit = win - crash.bet;
            
            db.ref('users/'+user).transaction(u => {
  if(u) { 
    u.balance = (u.balance || 0) + win; 
    u.xp = (u.xp || 0) + Math.floor(profit / 10); 
  }
  return u;
});
            
            addGameHistory('Crash', crash.bet, profit, 'win');
            checkWinStreak();
            
            btn.innerText = "ВЫПЛАТА: " + win.toLocaleString() + " ₽";
            btn.classList.remove('btn-green');
            btn.classList.add('btn-accent', 'btn-disabled');
            document.getElementById('crashProfit').innerText = '';
            
            toast(`ВЫПЛАТА: ${win.toLocaleString()} ₽ (${crash.mult.toFixed(2)}x)`, 'success');
            tryClaimDailyEvent(crash.mult);
            showWinAnimation(win);
            sfx(800);
            crash.bet = 0;
crash.betRoundId = null;
// crash.cashed можно оставить true или сбросить — уже не важно, bet=0

            
            if((userData.stats?.wins || 0) === 1) {
                checkAchievement('first_win');
            }
        }
    }

