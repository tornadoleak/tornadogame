# Tornado split project

Это разрезанная версия исходного `kazino_code.txt`.

## Что внутри
- `index.html` — разметка страницы
- `css/style.css` — все стили
- `js/firebase.js` — подключение Firebase
- `js/state.js` — глобальные переменные, темы, константы
- `js/crash.js` — вся логика Crash
- `js/core.js` — авторизация, UI, звук, профиль, лидерборд, майнинг фон
- `js/mines.js` — Mines
- `js/tower.js` — Tower
- `js/roulette.js` — Roulette
- `js/pvp.js` — PVP
- `js/cases.js` — Cases
- `js/app.js` — автологин и ripple-эффект

## Порядок подключения
Он уже прописан в `index.html`. Менять его не надо.

## Важно
Это именно разделение исходника по файлам без большой переработки архитектуры.
Глобальные переменные и `onclick` в HTML оставлены, чтобы сайт не ломался после разделения.
