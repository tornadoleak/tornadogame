    function toast(txt, type = 'info') {
        const container = document.getElementById('notif');
        const el = document.createElement('div');
        el.className = 'toast';
        el.innerText = txt;
        if(type === 'success') playSfx('win');
else if(type === 'error') playSfx('lose');
else playSfx('ui');
        if(type === 'error') el.style.borderColor = 'var(--pink)';
        if(type === 'success') el.style.borderColor = 'var(--green)';
        if(type === 'gold') el.style.borderColor = 'var(--gold)';
        container.appendChild(el);
        setTimeout(() => { 
            el.style.opacity = '0'; 
            el.style.transform = 'translateX(120%)';
            setTimeout(() => el.remove(), 400); 
        }, 3500);
    }
     // ===== CHAT RANK CACHE =====
const __chatUserCache = {};

function getRankByLvl(lvl){
  lvl = Number(lvl || 1);
  const sorted = RANKS.slice().sort((a,b)=>a.min-b.min);
  return sorted.filter(r => lvl >= r.min).pop() || sorted[0];
}

function rankColorByClass(rank){
  const cls = String(rank?.class || '');
  if(cls.includes('bronze'))   return '#cd7f32';
  if(cls.includes('silver'))   return '#c0c0c0';
  if(cls.includes('gold'))     return 'var(--gold)';
  if(cls.includes('platinum')) return '#e5e4e2';
  return 'var(--accent)'; // diamond / default
}

function ensureChatUser(name){
  const key = String(name || '').toLowerCase();
  if(!key) return Promise.resolve(null);
  if(__chatUserCache[key]) return Promise.resolve(__chatUserCache[key]);

  return db.ref('users/'+key+'/lvl').once('value')
    .then(s => {
      const lvl = Number(s.val() || 1);
      const rank = getRankByLvl(lvl);
      const info = { lvl, rank };
      __chatUserCache[key] = info;
      return info;
    })
    .catch(() => {
      const info = { lvl: 1, rank: getRankByLvl(1) };
      __chatUserCache[key] = info;
      return info;
    });
}


// ===== ULTRA SFX ENGINE (лучше звук + пресеты) =====
var SFX = window.__SFX__ = window.__SFX__ || {};

function ensureAudio(){
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if(!Ctx) return null;

  // audioCtx и soundEnabled у тебя уже есть в глобале — НЕ объявляем заново
  if(!audioCtx) audioCtx = new Ctx();

  if(audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});

  // мастер-цепочка один раз: master -> compressor -> destination
  if(!SFX.master){
    SFX.master = audioCtx.createGain();
    SFX.master.gain.value = (typeof SFX.vol === 'number') ? SFX.vol : 0.55;

    SFX.comp = audioCtx.createDynamicsCompressor();
    SFX.comp.threshold.value = -24;
    SFX.comp.knee.value = 20;
    SFX.comp.ratio.value = 6;
    SFX.comp.attack.value = 0.003;
    SFX.comp.release.value = 0.15;

    SFX.master.connect(SFX.comp);
    SFX.comp.connect(audioCtx.destination);
  }

  return audioCtx;
}

// можно менять громкость: setSfxVolume(0.3)
function setSfxVolume(v){
  SFX.vol = Math.max(0, Math.min(1, Number(v)));
  if(SFX.master) SFX.master.gain.value = SFX.vol;
}

// ✅ улучшенный sfx (совместим со старым вызовом sfx(600,'sine',0.2,0.12))
function sfx(f, type='sine', d=0.2, v=0.12) {
  if(!soundEnabled) return;

  const ctx = ensureAudio();
  if(!ctx) return;

  const now = ctx.currentTime;

  const freqs = Array.isArray(f) ? f : [f];

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.connect(SFX.master);

  // ADSR (чтоб звук был “живой”, не плоский)
  const attack  = Math.min(0.02, d * 0.25);
  const release = Math.max(0.03, d * 0.55);
  const sustain = Math.max(0.0001, v * 0.45);

  out.gain.exponentialRampToValueAtTime(Math.max(0.0001, v), now + attack);
  out.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), now + Math.max(attack, d - release));
  out.gain.exponentialRampToValueAtTime(0.0001, now + d);

  freqs.forEach((freq, i) => {
    freq = Math.max(20, Number(freq) || 440);

    // основной осц
    const o1 = ctx.createOscillator();
    o1.type = type;
    o1.frequency.setValueAtTime(freq, now);

    // маленький “питч-дроп” в начале = ударность
    o1.frequency.exponentialRampToValueAtTime(freq * 0.96, now + Math.min(0.06, d * 0.4));
    o1.detune.setValueAtTime((i % 2 ? -6 : 6), now);

    // тихая гармоника сверху (делает звук богаче)
    const o2 = ctx.createOscillator();
    o2.type = (type === 'sine') ? 'triangle' : 'sine';
    o2.frequency.setValueAtTime(freq * 2, now);
    o2.detune.setValueAtTime((i % 2 ? 8 : -8), now);

    const g1 = ctx.createGain(); g1.gain.value = 0.75;
    const g2 = ctx.createGain(); g2.gain.value = 0.18;

    o1.connect(g1); g1.connect(out);
    o2.connect(g2); g2.connect(out);

    o1.start(now); o2.start(now);
    o1.stop(now + d + 0.05);
    o2.stop(now + d + 0.05);
  });
}
    // ==== CRASH SFX ====
let crashTickTimer = null;
let crashRunBeepTimer = null;

function stopCrashSfx(){
  if(crashTickTimer){ clearInterval(crashTickTimer); crashTickTimer = null; }
  if(crashRunBeepTimer){ clearInterval(crashRunBeepTimer); crashRunBeepTimer = null; }
}

function startCrashWaitingTicks(){
  stopCrashSfx();
  if(!allowCrashSfx()) return;

  crashTickTimer = setInterval(() => {
    if(!allowCrashSfx()) return stopCrashSfx();
    sfx(900, 'sine', 0.05, 0.06);
  }, 350);
}

function startCrashRunningBeeps(){
  stopCrashSfx();
  if(!allowCrashSfx()) return;

  crashRunBeepTimer = setInterval(() => {
    if(!allowCrashSfx()) return stopCrashSfx();
    const m = Math.max(1, crash?.mult || 1);
    const f = Math.min(1800, 500 + m * 120);
    sfx(f, 'triangle', 0.03, 0.05);
  }, 220);
}

function crashBoom(){
  stopCrashSfx();
  if(!allowCrashSfx()) return;
  sfx([140, 90], 'sawtooth', 0.25, 0.14);
}

function crashCashout(){
  if(!allowCrashSfx()) return;
  sfx([900, 1200], 'square', 0.12, 0.12);
}
    function isCrashViewActive(){
  return document.getElementById('viewCrash')?.classList.contains('active');
}

function allowCrashSfx(){
  return !document.hidden && isCrashViewActive() && soundEnabled;
}

// короткий “шум” для эффектов (кэш-аут, взрыв, свист)
function sfxNoise(d=0.12, v=0.07, hp=800){
  if(!soundEnabled) return;

  const ctx = ensureAudio();
  if(!ctx) return;

  const now = ctx.currentTime;

  const len = Math.floor(ctx.sampleRate * d);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for(let i=0;i<len;i++){
    const k = 1 - (i / len);
    data[i] = (Math.random() * 2 - 1) * k; // затухание
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(hp, now);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(v, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + d);

  src.connect(filter);
  filter.connect(g);
  g.connect(SFX.master);

  src.start(now);
  src.stop(now + d + 0.02);
}

// ✅ пресеты под события (чтобы было “как в играх”)
function playSfx(name){
  switch(name){
    case 'ui':       return sfx(620,'sine',0.07,0.10);
    case 'bet':      return (sfx([420,840],'triangle',0.10,0.10), sfxNoise(0.05,0.03,1200));
    case 'tick':     return sfx(1200,'square',0.03,0.05);
    case 'win':      return (sfx([523,659,784],'sine',0.22,0.10), sfxNoise(0.10,0.04,900));
    case 'lose':     return sfx(140,'sawtooth',0.25,0.10);
    case 'crash':    return (sfx(95,'sawtooth',0.35,0.12), sfxNoise(0.20,0.06,450));
    case 'cashout':  return (sfx([440,880],'square',0.14,0.10), sfxNoise(0.06,0.03,1400));
    case 'mine':     return sfx(760,'triangle',0.08,0.09);
    case 'bomb':     return (sfx(110,'sawtooth',0.30,0.12), sfxNoise(0.18,0.07,500));
    default:         return sfx(600,'sine',0.10,0.10);
  }
}

// ✅ разлочить звук после первого касания/клика/клавы
function unlockAudioOnce(){
  try{
    ensureAudio();
  }catch(e){}
}
window.addEventListener('pointerdown', unlockAudioOnce, { once:true });
window.addEventListener('touchstart', unlockAudioOnce, { once:true });
window.addEventListener('keydown', unlockAudioOnce, { once:true });

// можно сразу поставить громкость (по желанию)
setSfxVolume(0.55);

    function showWinAnimation(amount, prefix = '+') {
    const el = document.createElement('div');
    el.className = 'win-animation';
    el.innerText = `${prefix}${amount.toLocaleString()} ₽`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

    function setAuth(m) {
        authMode = m;
        document.getElementById('tabLogin').classList.toggle('active', m==='login');
        document.getElementById('tabReg').classList.toggle('active', m==='reg');
    }

    function handleAuth() {
        const u = document.getElementById('authUser').value.trim().toLowerCase();
        const p = document.getElementById('authPass').value.trim();
        
        if(u.length < 3) {
            toast("СЛИШКОМ КОРОТКИЙ ЛОГИН", 'error');
            return;
        }
        if(p.length < 4) {
            toast("СЛИШКОМ КОРОТКИЙ ПАРОЛЬ", 'error');
            return;
        }

        db.ref('users/' + u).once('value').then(snap => {
            if(authMode === 'login') {
                if(snap.exists() && snap.val().pass === p) {
                    sfx(600);
                    toast("ВХОД ВЫПОЛНЕН", 'success');
localStorage.setItem('tornado_user', u);
runSession(u);
                } else {
                    toast("НЕВЕРНЫЕ ДАННЫЕ", 'error');
                }
            } else {
                if(snap.exists()) {
                    toast("ЛОГИН ЗАНЯТ", 'error');
                } else {
                    db.ref('users/' + u).set({
                        pass: p, 
                        balance: 100, 
                        xp: 0, 
                        lvl: 1, 
                        gpus: {},
                        stats: {games:0, wins:0, profit:0},
                        achievements: {},
                        history: [],
                        lastDaily: 0,
                        createdAt: Date.now()
                    }).then(() => {
                        toast("РЕГИСТРАЦИЯ УСПЕШНА! +100₽", 'success');
sfx(800);
localStorage.setItem('tornado_user', u);
runSession(u);
                    });
                }
            }
        });
    }

    function logout() {
        if(!confirm("ВЫЙТИ ИЗ АККАУНТА?")) return;
        
localStorage.removeItem('tornado_user');
        
        if(crashInterval) clearInterval(crashInterval);
        if(passiveInterval) clearInterval(passiveInterval);
        stopCrashSfx();
        
        db.ref('users/' + user).off();
        db.ref('chat').off();
        db.ref('pvp').off();
        db.ref('crash').off();
db.ref('crashHost').off();
db.ref('crashHistory').off();
db.ref('events').off(); // или точнее конкретный путь daily
        
        stopPresence();
        
        user = null;
        userData = {};
        crash = { active: false, mult: 1.0, bet: 0, cashed: false, pts: [], startTime: 0, waitingForRound: false };
        mines = { active: false, bet: 0, bombs: [], open: 0, total: 3 };
        tower = { active: false, bet: 0, level: 0, bombs: [] };
        
        document.getElementById('mainApp').style.display = 'none';
        document.getElementById('authBox').style.display = 'block';
        document.getElementById('authUser').value = '';
        document.getElementById('authPass').value = '';
        
        toast("ВЫХОД ВЫПОЛНЕН", 'success');
        sfx(400);
    }

    function runSession(userId) {
        user = userId;
        document.getElementById('authBox').style.display = 'none';
        document.getElementById('mainApp').style.display = 'grid';
        document.getElementById('uName').innerText = user.toUpperCase();
        
        db.ref('users/' + user).on('value', snap => {
            userData = snap.val() || {};
            applyTheme(userData.theme || 'neon');
const sel = document.getElementById('themeSelect');
if(sel) sel.value = userData.theme || 'neon';
            if(!userData.gpus) userData.gpus = {};
            if(!userData.stats) userData.stats = {games:0, wins:0, profit:0};
            if(!userData.achievements) userData.achievements = {};
            if(!userData.history) userData.history = [];
            updateUI();
        });

        function formatChatTime(ts){
  const now = (typeof serverNow === 'function') ? serverNow() : Date.now();

  const dNow = new Date(now);
  dNow.setHours(0,0,0,0);
  const startToday = dNow.getTime();
  const startYesterday = startToday - 24*60*60*1000;

  const dt = new Date(Math.min(Number(ts||0), now));
  const hhmm = dt.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });

  if(dt.getTime() >= startToday){
    return hhmm; // сегодня -> 21:14
  }
  if(dt.getTime() >= startYesterday){
    return `вчера ${hhmm}`; // вчера 21:14
  }

  // иначе дата + время
  let ddm = dt.toLocaleDateString('ru-RU', { day:'2-digit', month:'short' }); // "10 янв."
  ddm = ddm.replace('.', ''); // убираем точку если бесит
  return `${ddm} ${hhmm}`; // 10 янв 21:14
}

const chatRef = db.ref('chat');
chatRef.off();

const box = document.getElementById('chatBox');
if(!box) return;
box.innerHTML = '';

const chatQuery = chatRef.orderByChild('time').limitToLast(10);

chatQuery.on('value', snap => {
  const nearBottom = (box.scrollHeight - box.scrollTop - box.clientHeight) < 120;

  const msgs = [];
  const need = new Set();

  snap.forEach(s => {
    const m = s.val();
    if(!m) return;

    const now = (typeof serverNow === 'function') ? serverNow() : Date.now();

    let t = (typeof m.time === 'number') ? m.time : Number(m.time);
if(!Number.isFinite(t) || t <= 0) t = now;
    if(t > now + 2 * 60 * 1000) return;
    if(t > now) t = now;

    const u = String(m.u || '').toLowerCase();
    const text = String(m.t || '');

    msgs.push({ u, text, time: t });

    if(u && !__chatUserCache[u]) need.add(u);
  });

  const render = () => {
    box.innerHTML = '';

    msgs.forEach(m => {
      const info = __chatUserCache[m.u] || { lvl: 1, rank: getRankByLvl(1) };
      const rank = info.rank || getRankByLvl(info.lvl || 1);
      const col = rankColorByClass(rank);

      const d = document.createElement('div');
      d.className = 'msg';

      const head = document.createElement('div');
      head.className = 'msg-head';

      const userEl = document.createElement('span');
      userEl.className = 'msg-user';
      userEl.textContent = String(m.u || '').toUpperCase();

      const rankEl = document.createElement('span');
      rankEl.className = 'msg-rank';
      rankEl.textContent = rank.name;
      rankEl.style.color = col;
      rankEl.style.borderColor = col;

      const left = document.createElement('div');
left.className = 'msg-left';
left.appendChild(userEl);
left.appendChild(rankEl);

const ts = document.createElement('span');
ts.className = 'msg-time';

if(m.time){
  const dt = new Date(m.time);
  ts.textContent = m.time ? formatChatTime(m.time) : '';
} else {
  ts.textContent = '';
}

head.appendChild(left);
head.appendChild(ts);

      const textEl = document.createElement('div');
      textEl.className = 'msg-text';
      textEl.textContent = m.text;

      d.appendChild(head);
      d.appendChild(textEl);

      box.appendChild(d);
    });

    if(nearBottom) box.scrollTop = box.scrollHeight;
  };

  if(need.size){
    Promise.all([...need].map(ensureChatUser)).then(render);
  } else {
    render();
  }
});

        initCrashShared();
        watchDailyEvent();
        renderDailyEventBanner(false);
        syncLeaders();
        renderGPUs();
        loadPVPRooms();
        updateProfile();
        initRoulette();
        startPresence();

        passiveInterval = setInterval(() => {
            let inc = 0;
            GPUS.forEach(g => inc += (userData.gpus?.[g.id] || 0) * g.i);
            if(inc > 0) {
                db.ref('users/'+user+'/balance').transaction(b => (b || 0) + inc);
            }
        }, 1000);
    }

    function updateUI() {
        document.getElementById('uBalance').innerText = Math.floor(userData.balance || 0).toLocaleString() + ' ₽';
        const nextXp = (userData.lvl || 1) * 2000;
        const currentXp = userData.xp || 0;
        document.getElementById('uBar').style.width = Math.min(100, (currentXp / nextXp * 100)) + '%';
        document.getElementById('uLevel').innerText = `УРОВЕНЬ ${userData.lvl || 1}`;
        document.getElementById('uXP').innerText = `${currentXp} / ${nextXp} XP`;
        
        const lvl = Number(userData.lvl || 1);
const sortedRanks = RANKS.slice().sort((a,b)=>a.min-b.min);

const curRank = sortedRanks.filter(r => lvl >= r.min).pop() || sortedRanks[0];

const rankEl = document.getElementById('uRank');
if (rankEl && curRank) {
  rankEl.className = 'rank-badge ' + curRank.class;
  rankEl.textContent = curRank.name;
}

        const nextRank = RANKS
  .slice()
  .sort((a,b)=>a.min-b.min)
  .find(r => lvl < r.min);

const nextEl = document.getElementById('uRankNext');
if(nextEl){
  if(!nextRank){
    nextEl.innerHTML = 'MAX RANK';
  } else {
    const left = nextRank.min - lvl;
    nextEl.innerHTML = `до <b>${nextRank.name}</b>: ещё ${left} ур.`;
  }
}

        
        if(currentXp >= nextXp) {
            db.ref('users/'+user).transaction(u => {
                if(u) { 
                    u.lvl++; 
                    u.xp = 0; 
                    u.balance += 5000;
                    checkAchievement('level_10', u);
                }
                return u;
            });
            toast("УРОВЕНЬ ПОВЫШЕН! +5,000 ₽", 'success');
            showWinAnimation(5000);
            sfx(1000, 'square', 0.5);
        }

        let p = 0; 
        GPUS.forEach(g => p += (userData.gpus?.[g.id] || 0) * g.i);
        document.getElementById('valPassive').innerText = p.toLocaleString() + ' ₽';
        document.getElementById('valClick').innerText = `+${((userData.lvl || 1) * 1).toFixed(2)} ₽`;
        
        if((userData.balance || 0) >= 1000000) {
            checkAchievement('millionaire');
        }
    }

    function checkAchievement(id, customUser = null) {
        const u = customUser || userData;
        if(u.achievements?.[id]) return;
        
        const ach = ACHIEVEMENTS.find(a => a.id === id);
        if(!ach) return;
        
        db.ref('users/'+user+'/achievements/'+id).set(true);
        db.ref('users/'+user+'/balance').transaction(b => (b || 0) + ach.reward);
        toast(`🏆 ДОСТИЖЕНИЕ: ${ach.name.toUpperCase()} +${ach.reward}₽`, 'gold');
        sfx(1200, 'square', 0.5, 0.15);
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

    function clickFarm(e) {
  let val = (userData.lvl || 1) * 1;
  db.ref('users/'+user).transaction(u => {
    if(u) { u.balance = (u.balance || 0) + val; u.xp = (u.xp || 0) + 2; }
    return u;
  });
  sfx(400, 'sine', 0.1);

  const btn = e?.target?.closest('.btn-ui');
  if (btn) {
    btn.style.transform = 'scale(0.95)';
    setTimeout(() => btn.style.transform = '', 100);
  }
}

    function renderGPUs() {
        const cont = document.getElementById('listGPU');
        cont.innerHTML = '';
        let totalOwned = 0;
        GPUS.forEach(g => {
            const owned = userData.gpus?.[g.id] || 0;
            totalOwned += owned;
            const d = document.createElement('div');
            d.className = 'gpu-card';
            d.innerHTML = `
                <div>
                    <div style="font-weight:800; font-size:14px;">${g.n}</div>
                    <div style="font-size:10px; color:var(--green);">+${g.i.toLocaleString()} ₽/сек</div>
                    ${owned > 0 ? `<div class="gpu-owned">КУПЛЕНО: ${owned}</div>` : ''}
                </div>
                <button class="btn-ui btn-accent" style="padding:10px 15px; font-size:10px;" onclick="buyGPU('${g.id}')">
                    ${g.p.toLocaleString()} ₽
                </button>
            `;
            cont.appendChild(d);
        });
        
        if(totalOwned >= 10) checkAchievement('gpu_master');
    }

    function buyGPU(id) {
        const g = GPUS.find(x => x.id === id);
        if((userData.balance || 0) >= g.p) {
            db.ref('users/'+user).transaction(u => {
                if(u) {
                    if(!u.gpus) u.gpus = {};
                    u.gpus[id] = (u.gpus[id] || 0) + 1;
                    u.balance = (u.balance || 0) - g.p;
                }
                return u;
            });
            toast("ВИДЕОКАРТА КУПЛЕНА", 'success');
            sfx(900);
            setTimeout(renderGPUs, 100);
        } else toast("НЕДОСТАТОЧНО СРЕДСТВ", 'error');
    }

    function showTab(btn, id) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.viewport').forEach(v => v.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(id).classList.add('active');

        if(id !== 'viewCrash') {
  stopCrashSfx();
} else {
  // если вернулись в crash — восстановим звуки по текущему состоянию
  if (typeof applyCrashState === 'function') applyCrashState(crashState);
}
        if(id === 'viewProfile') updateProfile();
    }

    function sendMsg() {
  const inp = document.getElementById('chatInput');
  const msg = inp.value.trim();
  if(!msg) return;

  db.ref('chat').push({ 
  u: user, 
  t: msg,
  time: serverNow()
});

  inp.value = '';
  sfx(500, 'sine', 0.1);
}
    function historyToArray(h){
  if(Array.isArray(h)) return h;
  if(!h) return [];
  if(typeof h === 'object') return Object.values(h);
  return [];
}

    function syncLeaders() {
  db.ref('users').on('value', snap => {
    const arr = [];
    snap.forEach(u => {
      const val = u.val() || {};
      const hist = historyToArray(val.history);

const w24 = calcWindowStats(hist, 24 * 60 * 60 * 1000);
const w7  = calcWindowStats(hist, 7  * 24 * 60 * 60 * 1000);

arr.push({
  n: u.key,
  b: Number(val.balance || 0),
  l: Number(val.lvl || 1),
  p24: w24.profit,
  g24: w24.games,
  p7:  w7.profit,
  g7:  w7.games
});
    });

    __topUsersCache = arr;
    renderTopFromCache();
  });
}

    let topMode = 'balance';

function setTopMode(mode){
  topMode = mode;

  const a = (id, on) => document.getElementById(id)?.classList.toggle('active', on);
  a('topTabBalance', mode==='balance');
  a('topTab24h', mode==='profit24h');
  a('topTab7d', mode==='profit7d');

  // перерисуем из последних данных
  if (typeof renderTopFromCache === 'function') renderTopFromCache();
}
    function calcWindowStats(historyArr, windowMs){
  const now = (typeof serverNow === 'function') ? serverNow() : Date.now();
  const arr = historyToArray(historyArr);

  let profit = 0;
  let games = 0;

  for (const h of arr){
    if(!h) continue;

    let t = Number(h.time || 0);
    if(!t) continue;
    if(t > now) t = now;

    if(now - t <= windowMs){
      profit += Number(h.profit || 0);
      games++;
    }
  }

  return { profit, games };
}


function calcProfitWindow(historyArr, windowMs){
  const now = (typeof serverNow === 'function') ? serverNow() : Date.now();
  const arr = historyToArray(historyArr);

  let sum = 0;

  for (const h of arr){
    if(!h) continue;

    let t = Number(h.time || 0);
    if(!t) continue;

    // ✅ если время "в будущем" (из-за кривых часов) — клампим к now
    if(t > now) t = now;

    const dt = now - t;
    if(dt <= windowMs){
      sum += Number(h.profit || 0);
    }
  }

  return sum;
}

let __topUsersCache = [];

function renderTopFromCache(){
  const cont = document.getElementById('listTop');
  if(!cont) return;
  cont.innerHTML = '';

  const arr = (__topUsersCache || []).slice();

  // ✅ PROFIT 24H: показываем только тех, кто реально играл за 24ч
  if(topMode === 'profit24h'){
    const active = arr.filter(u => (u.g24 || 0) > 0);
    active.sort((a,b)=> (b.p24||0) - (a.p24||0));

    if(!active.length){
      cont.innerHTML = '<div style="text-align:center; color: var(--muted); padding:40px;">НЕТ АКТИВНОСТИ ЗА 24 ЧАСА</div>';
      return;
    }

    arr.length = 0;
    arr.push(...active);
  }

  // ✅ PROFIT 7D: только активные за 7 дней
  else if(topMode === 'profit7d'){
    const active = arr.filter(u => (u.g7 || 0) > 0);
    active.sort((a,b)=> (b.p7||0) - (a.p7||0));

    if(!active.length){
      cont.innerHTML = '<div style="text-align:center; color: var(--muted); padding:40px;">НЕТ АКТИВНОСТИ ЗА 7 ДНЕЙ</div>';
      return;
    }

    arr.length = 0;
    arr.push(...active);
  }

  // ✅ BALANCE как было
  else {
    arr.sort((a,b)=> (b.b||0) - (a.b||0));
  }

  arr.slice(0, 10).forEach((u, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
    const rank = RANKS.slice().reverse().find(r => (u.l||1) >= r.min) || RANKS[0];

    let right = '';
    if(topMode === 'profit24h'){
      right = `<b style="color:${(u.p24||0)>=0?'var(--green)':'var(--pink)'}">${(u.p24||0)>=0?'+':''}${Math.floor(u.p24||0).toLocaleString()} ₽</b>`;
    } else if(topMode === 'profit7d'){
      right = `<b style="color:${(u.p7||0)>=0?'var(--green)':'var(--pink)'}">${(u.p7||0)>=0?'+':''}${Math.floor(u.p7||0).toLocaleString()} ₽</b>`;
    } else {
      right = `<b style="color:var(--accent)">${Math.floor(u.b||0).toLocaleString()} ₽</b>`;
    }

    cont.innerHTML += `
      <div class="leader-card">
        <span>${medal} #${i+1} ${String(u.n||'').toUpperCase()}
          <span style="font-size:10px; color:${rank.class.includes('bronze')?'#cd7f32':rank.class.includes('silver')?'#c0c0c0':rank.class.includes('gold')?'var(--gold)':rank.class.includes('platinum')?'#e5e4e2':'var(--accent)'};">
            ${rank.name}
          </span>
        </span>
        ${right}
      </div>
    `;
  });
}

    function addGameHistory(game, bet, profit, result) {
  const entry = { game, bet, profit, result, time: serverNow() };

  db.ref('users/'+user+'/history').transaction(h => {
    const arr = historyToArray(h);
    arr.unshift(entry);
    return arr.slice(0, 200);
  });

  db.ref('users/'+user+'/stats/games').transaction(g => (g || 0) + 1);
  if(result === 'win') {
    db.ref('users/'+user+'/stats/wins').transaction(w => (w || 0) + 1);
  }
  db.ref('users/'+user+'/stats/profit').transaction(p => (p || 0) + profit);
}
    function checkWinStreak() {
  const history = historyToArray(userData.history);
  let streak = 0;

  for (const h of history) {
    if (h?.result === 'win') streak++;
    else break;
  }

  if (streak >= 5) checkAchievement('win_streak_5');
}

    function updateProfile() {
  const stats = userData.stats || { games: 0, wins: 0, profit: 0 };

  document.getElementById('statGames').innerText = stats.games || 0;
  document.getElementById('statWins').innerText  = stats.wins || 0;
  document.getElementById('statProfit').innerText = (stats.profit || 0).toLocaleString() + ' ₽';

  const winrate = (stats.games > 0) ? ((stats.wins / stats.games) * 100).toFixed(1) : 0;
  document.getElementById('statWinrate').innerText = winrate + '%';

  // Достижения
  const achCont = document.getElementById('achievements');
  achCont.innerHTML = '';
  ACHIEVEMENTS.forEach(ach => {
    const unlocked = userData.achievements?.[ach.id];
    achCont.innerHTML += `
      <div class="achievement ${unlocked ? '' : 'locked'}">
        <div class="achievement-icon">${ach.icon}</div>
        <div style="flex:1;">
          <div style="font-weight:800; font-size:13px;">${ach.name}</div>
          <div style="font-size:11px; color: var(--muted);">${ach.desc}</div>
        </div>
        <div style="color:var(--gold); font-weight:800; font-size:12px;">+${ach.reward}₽</div>
      </div>
    `;
  });

  // История игр
  const histCont = document.getElementById('gameHistory');
  histCont.innerHTML = '';

  const history = historyToArray(userData.history);

  history.slice(0, 10).forEach(h => {
    if (!h) return;

    const t = Number(h.time || 0) || Date.now();
    const date = new Date(t).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    const profit = Number(h.profit || 0);

    histCont.innerHTML += `
      <div class="history-item history-${h.result}">
        <span><b>${h.game || 'Game'}</b> • ${date}</span>
        <span style="color:${profit >= 0 ? 'var(--green)' : 'var(--pink)'}; font-weight:800;">
          ${profit >= 0 ? '+' : ''}${profit.toLocaleString()}₽
        </span>
      </div>
    `;
  });
}

    function claimDaily() {
  const now = serverNow();
  const lastDaily = userData.lastDaily || 0;
  const dayMs = 24 * 60 * 60 * 1000;

  if(now - lastDaily < dayMs) {
    const left = dayMs - (now - lastDaily);
    const hours = Math.floor(left / (60 * 60 * 1000));
    toast(`СЛЕДУЮЩИЙ БОНУС ЧЕРЕЗ ${hours}Ч`, 'error');
    return;
  }

  const level = userData.lvl || 1;
  const bonus = 100 + (level * 50);

  db.ref('users/'+user).transaction(u => {
    if(u) {
      u.balance = (u.balance || 0) + bonus;
      u.lastDaily = now;
    }
    return u;
  });

  toast(`ЕЖЕДНЕВНЫЙ БОНУС: +${bonus}₽`, 'gold');
  showWinAnimation(bonus);
  sfx(1000, 'square', 0.5);
}

    const bgCvs = document.getElementById('bgCanvas');
    const bgCtx = bgCvs.getContext('2d');
    let parts = [];
    
    function initBg() {
        bgCvs.width = window.innerWidth; 
        bgCvs.height = window.innerHeight;
        parts = [];
        for(let i=0; i<70; i++) {
            parts.push({
                x: Math.random()*bgCvs.width, 
                y: Math.random()*bgCvs.height, 
                s: Math.random()*2 + 0.5, 
                v: Math.random()*0.5 + 0.2
            });
        }
    }
    
    function drawBg() {
        bgCtx.clearRect(0,0,bgCvs.width, bgCvs.height);
        bgCtx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00f2ff';
        bgCtx.shadowBlur = 5;
        bgCtx.shadowColor = bgCtx.fillStyle;
        
        parts.forEach(p => {
            bgCtx.beginPath(); 
            bgCtx.arc(p.x, p.y, p.s, 0, Math.PI*2); 
            bgCtx.fill();
            p.y -= p.v; 
            if(p.y < -10) {
                p.y = bgCvs.height + 10;
                p.x = Math.random() * bgCvs.width;
            }
        });
        requestAnimationFrame(drawBg);
    }
    
    window.addEventListener('resize', initBg);
    initBg(); 
    drawBg();
    
