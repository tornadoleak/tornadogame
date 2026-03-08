    let user = null, userData = {}, authMode = 'login', audioCtx, soundEnabled = true;
    let crash = { active:false, mult:1.0, bet:0, cashed:false, betRoundId:null, pts:[], startTime:0, waitingForRound:false };
    let mines = { active: false, locked: false, bet: 0, bombs: [], open: 0, total: 3 };
    let tower = { active: false, locked: false, bet: 0, level: 0, bombs: [], maxLevel: 10 };
    let crashInterval = null, passiveInterval = null, rouletteSpinning = false;
    let boxRolling = false;
let boxResTimer = null;

    // ===== CRASH COLORS + HISTORY =====
const CRASH_HISTORY_MAX = 12;
let crashHistory = [];

function crashColor(mult){
  if(mult >= 10) return 'var(--pink)';   // дохуя
  if(mult >= 5)  return 'var(--accent)'; // много (красный сделаем вручную ниже)
  if(mult >= 2)  return 'var(--gold)';   // средне
  return 'var(--green)';                // мало
}

// чтобы "много" было именно красным, а не accent
function crashColorStrict(mult){
  if(mult >= 10) return 'var(--crash-max)';
  if(mult >= 5)  return 'var(--crash-high)';
  if(mult >= 2)  return 'var(--crash-mid)';
  return 'var(--crash-low)';
}
    function setCrashMultStyle(el, color){
  if(!el) return;
  el.style.color = color;
  el.style.textShadow = `0 0 40px ${color}, 0 0 90px ${color}`;
}

function renderCrashHistory(){
  const el = document.getElementById('crashHistory');
  if(!el) return;

  el.innerHTML = '';
  crashHistory.slice(0, CRASH_HISTORY_MAX).forEach(x => {
    const p = document.createElement('div');
    p.className = 'crash-pill';
    p.style.color = crashColorStrict(x);
    p.textContent = x.toFixed(2) + 'x';
    el.appendChild(p);
  });
}

function pushCrashHistory(x){
  crashHistory.unshift(x);
  crashHistory = crashHistory.slice(0, CRASH_HISTORY_MAX);
  renderCrashHistory();
}

function setCasesDisabled(disabled) {
  document.querySelectorAll('#viewCases button[onclick^="openBox"]').forEach(b => {
    b.disabled = disabled;
    b.classList.toggle('btn-disabled', disabled);
  });
}
    
    const GPUS = [
  {id:'g1',  n:'GTX 1050 Ti',  p:3000,     i:1},
  {id:'g2',  n:'GTX 1660',     p:8000,     i:4},
  {id:'g3',  n:'RTX 2060',     p:20000,    i:12},
  {id:'g4',  n:'RTX 3060',     p:50000,    i:35},
  {id:'g5',  n:'RTX 3070',     p:150000,   i:120},
  {id:'g6',  n:'RTX 3080',     p:400000,   i:350},
  {id:'g7',  n:'RTX 3090',     p:1000000,  i:900},
  {id:'g8',  n:'RTX 4070',     p:2500000,  i:2600},
  {id:'g9',  n:'RTX 4090',     p:6000000,  i:7000},
  {id:'g10', n:'SERVER ASIC',  p:15000000, i:20000}
];
    const THEMES = {
  neon:   {
    accent:'#00f2ff', pink:'#ff007b', gold:'#ffcc00', green:'#00ff88', purple:'#b24bf3', orange:'#ff8c00',
    bg:'#030507', bg2:'#0a1018',
    card:'rgba(10, 15, 20, 0.98)', border:'rgba(0, 242, 255, 0.20)', glow:'0 0 25px rgba(0, 242, 255, 0.35)'
  },

  ice: {
    // ❄️ прям заметно другое настроение
    accent:'#b9f6ff',
    pink:'#ff5aa5',
    gold:'#ffe082',
    green:'#33ffd1',
    purple:'#9aa7ff',
    orange:'#a8d8ff',

    bg:'#010b16',
    bg2:'#062337',

    card:'rgba(6, 14, 22, 0.78)',
    border:'rgba(185, 246, 255, 0.22)',
    glow:'0 0 30px rgba(185, 246, 255, 0.18)'
  },
        mono: {
  accent:'#ffffff',
  pink:'#ffffff',
  gold:'#ffffff',
  green:'#ffffff',
  purple:'#ffffff',
  orange:'#ffffff',

  bg:'#000000',
  bg2:'#0a0a0a',

  card:'rgba(255,255,255,0.05)',
  border:'rgba(255,255,255,0.12)',
  glow:'0 0 22px rgba(255,255,255,0.10)',
  muted:'#b7b7b7',

  // ✅ цвета именно для Crash (пилюли/множитель)
  crash: {
    low:  '#ffffff',  // <2x
    mid:  '#ffd54f',  // 2x-5x (желтый)
    high: '#ff3b3b',  // 5x-10x (красный)
    max:  '#ff5aa5'   // 10x+ (розовый)
  }
},

  sunset: { accent:'#ffb300', pink:'#ff3d7f', gold:'#ffd54f', green:'#00e676', purple:'#ff6d00', orange:'#ff8c00', bg:'#070404', bg2:'#1a0707',
    card:'rgba(22, 10, 10, 0.92)', border:'rgba(255, 179, 0, 0.18)', glow:'0 0 25px rgba(255, 179, 0, 0.25)' },

  purple: { accent:'#b24bf3', pink:'#ff4fd8', gold:'#ffcc00', green:'#4dff9a', purple:'#7c4dff', orange:'#ff8c00', bg:'#040214', bg2:'#12062a',
    card:'rgba(12, 6, 20, 0.92)', border:'rgba(178, 75, 243, 0.22)', glow:'0 0 30px rgba(178, 75, 243, 0.20)' },
};

function applyTheme(id){
  const t = THEMES[id] || THEMES.neon;
  const r = document.documentElement.style;

   r.setProperty('--crash-low',  (t.crash && t.crash.low)  ? t.crash.low  : t.green);
  r.setProperty('--crash-mid',  (t.crash && t.crash.mid)  ? t.crash.mid  : t.gold);
  r.setProperty('--crash-high', (t.crash && t.crash.high) ? t.crash.high : '#ff3b3b');
  r.setProperty('--crash-max',  (t.crash && t.crash.max)  ? t.crash.max  : t.pink);  
  r.setProperty('--accent', t.accent);
  r.setProperty('--accent2', t.accent2 || t.accent);
  r.setProperty('--pink', t.pink);
  r.setProperty('--gold', t.gold);
  r.setProperty('--green', t.green);
  r.setProperty('--purple', t.purple);
  r.setProperty('--orange', t.orange);

  r.setProperty('--bg', t.bg);
  r.setProperty('--bg2', t.bg2 || t.bg);

  if(t.card) r.setProperty('--card', t.card);
  if(t.border) r.setProperty('--border', t.border);
  if(t.glow) r.setProperty('--neon-glow', t.glow);
  if(t.muted) r.setProperty('--muted', t.muted);
}

function setTheme(id){
  applyTheme(id);
  if(user) db.ref('users/'+user+'/theme').set(id).catch(()=>{});
}

    const ACHIEVEMENTS = [
        {id:'first_win', name:'Первая победа', desc:'Выиграй первую игру', icon:'🎯', reward:500},
        {id:'level_10', name:'Опыт', desc:'Достигни 10 уровня', icon:'⭐', reward:2000},
        {id:'millionaire', name:'Миллионер', desc:'Накопи 1,000,000₽', icon:'💰', reward:50000},
        {id:'win_streak_5', name:'Серия', desc:'Выиграй 5 раз подряд', icon:'🔥', reward:3000},
        {id:'gpu_master', name:'Майнер', desc:'Купи 10 видеокарт', icon:'⚡', reward:10000},
        {id:'high_roller', name:'Хайроллер', desc:'Сделай ставку 10,000₽', icon:'💎', reward:5000},
        {id:'crash_god', name:'Бог Crash', desc:'Выиграй с x50', icon:'📈', reward:25000},
        {id:'tower_master', name:'Башня', desc:'Пройди 10 уровней Tower', icon:'🪜', reward:15000}
    ];

    const RANKS = [
        {min:0, name:'BRONZE', class:'rank-bronze'},
        {min:10, name:'SILVER', class:'rank-silver'},
        {min:25, name:'GOLD', class:'rank-gold'},
        {min:50, name:'PLATINUM', class:'rank-platinum'},
        {min:100, name:'DIAMOND', class:'rank-diamond'}
    ];

window.appState = {
  user: null,
  userData: {
    balance: 0,
    xp: 0,
    level: 1,
    rank: 'BRONZE'
  },

  ui: {
    currentTab: 'viewCrash'
  },

  crash: {
    active: false,
    mult: 1,
    bet: 0,
    cashed: false,
    betRoundId: null,
    pts: [],
    startTime: 0,
    waitingForRound: false
  },

  mines: {
    active: false,
    locked: false,
    bet: 0,
    bombs: [],
    open: 0,
    total: 3
  },

  tower: {
    active: false,
    locked: false,
    bet: 0,
    level: 0,
    bombs: [],
    maxLevel: 10
  },

  roulette: {
    spinning: false
  },

  cases: {
    rolling: false,
    resultTimer: null
  },

  timers: {
    crashInterval: null,
    passiveInterval: null,
    crashCountdownTimer: null,
    onlineInterval: null,
    hostBeatTimer: null,
    crashHostTimer: null
  }
};

