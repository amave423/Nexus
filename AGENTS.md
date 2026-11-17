<!-- drimvox -->
## Notes for agents
Kept by the agent that builds this project in Drimvox, rewritten as the work goes on. Anyone continuing here (a new
conversation, Codex, Claude Code) reads this first; what the user says now comes before it.

## Проект
Закрытый клон Discord (Nexus) для своих. VPS 1 ядро / 1 ГБ (Ubuntu 24.04, Node 22, Caddy, coturn), канал 1 Гбит, домен `fiit.37.235.241.23.sslip.io`. GitHub: `amave423/Nexus`.

## Пользователь просит
Магазин не нужен. Главное: хороший войс, шумодав, чат, серверы, демка, камера, статусы, роли. Дизайн — макет в корне (`design/`), не менять на «обычный». Меняемые имя и постоянный логин. Уведомления и упоминания. Голосовой экран отдельный, без надписей. Фото открывать на 50%, минимум 20%. ПКМ по человеку — громкость до 200% и личный мьют. Горячие клавиши по умолчанию выключены. Стрим: 720/1080/2560 и 30/60/120 к/с.

## Решения
- Node + Fastify + `node:sqlite`; медиа — mediasoup SFU в том же процессе.
- Electron + Svelte 5 (legacy) + Vite, только Windows.
- Звук собеседников — как в 0.8.1: `<audio>`-элемент с srcObject + MediaElementSource → GainNode → destination (громкость 0–200%). Если аудиоконтекст не running — элемент играет сам (0–100%), при пробуждении контекста звук сам уходит на гейн. Не переводить на `createMediaStreamSource`: в 0.9.0 из-за этого пользователь перестал слышать людей. Диагностика: `window.__nexusVoice.audioDebug()`.
- Стрим: таблица `SCREEN` в `voice.js` (720/1080/1440 × 30/60/120 → 2.5–30 Мбит/с), смена пресета пересоздаёт продюсер (`reencodeScreen`).

## Состояние (17 ноября)
- Опубликованы `v0.9.0` и `v0.9.1` (исправление звука). Последний релиз: `Nexus-Setup-0.9.1.exe` + blockmap + latest.yml, тег на коммите 6470cab.
- Сделано: громкость через гейн, комната-орбита без подписей, кастомные уведомления (`notify.html`, AUMID io.nexus.chat), центрированный лайтбокс, `VideoPlayer.svelte`, фото серверов (`spaces.icon`), переключатель горячих клавиш, пресеты стрима.
- Не задеплоено: колонки `spaces.icon` на VPS нет — фото сервера заработает после деплоя `server/src/{app,db}.js`.

## Тесты (зелёные)
- `cd server; node --test --test-force-exit test/*.test.js` — 50.
- `cd app; npm run build; npm test` — 33 E2E.

## Как проверять голос по-настоящему
Тесты Playwright не слышат звук: они проверяют байты и значения гейна. Для проверки в настоящем Electron делал скрипт с двумя BrowserWindow (npm electron), локальным сервером через `spawn("node", ...)` (в самом Electron нет `node:sqlite`) и раздельными session-партициями; смотреть `audioDebug()` (gain/volume/muted/live/context). Скрипты временные, удалялись.

## Деплой сервера (не сделан)
Стоп `nexus.service` (8091) → копия базы `/root/nexus-db-<дата>.db` и `src` → залить `server/src/{app,db,voice}.js` → старт → проверить `users.login`, `/api/health`, `PRAGMA table_info(spaces)`.

## Релиз (как делал)
`cd app && npm run dist` (версия в `app/package.json`), коммит «Bump version to X», `git push`, затем `gh release create vX --target <полный sha> --title "Nexus X" --notes-file artifacts/release-notes-X.md app/out/Nexus-Setup-X.exe app/out/Nexus-Setup-X.exe.blockmap app/out/latest.yml`. Короткий sha GitHub не принимает.

## Подводные камни
- `edit_file` в этой сессии терял длинные аргументы (правки `Settings.svelte` и `voice.js` пропадали) — крупные правки делать через `write_file` целиком, после партии проверять `grep`.
- Svelte не отслеживает значения внутри функций в шаблонах — производные считать в `$:` с прямой ссылкой на `vs`.
- `node:sqlite`: `db.exec("PRAGMA …")`, `lastInsertRowid` через `Number()`.
- Тесты: `--test-force-exit`; перед клиентскими `npm run build`. В комнате у `.node` нет текста — искать `.node[title="Имя"]`.

## Дальше
1. Убедиться, что у пользователя звук появился в 0.9.1 (если нет — спросить про второе окно, ошибку в комнате, полоски микрофона).
2. Задеплоить сервер (фото серверов).
3. Осталось: активность «во что играют», переключатель светлой/системной темы.
<!-- /drimvox -->
