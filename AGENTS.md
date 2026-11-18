<!-- drimvox -->
## Notes for agents
Kept by the agent that builds this project in Drimvox, rewritten as the work goes on. Anyone continuing here (a new
conversation, Codex, Claude Code) reads this first; what the user says now comes before it.

## Проект
Закрытый клон Discord (Nexus) для своих. VPS 1 ядро / 1 ГБ (Ubuntu 24.04, Node 22, Caddy, coturn), домен `fiit.37.235.241.23.sslip.io`. GitHub: `amave423/Nexus`.

## Пользователь просит
Магазин не нужен. Главное: хороший войс, шумодав, чат, серверы, демка, камера, статусы, роли. Дизайн — макет в корне (`design/`), не менять на «обычный». Меняемые имя и постоянный логин. Уведомления и упоминания. Голосовой экран отдельный, без надписей. Фото открывать на 50%, минимум 20%. ПКМ по человеку — громкость до 200% и личный мьют. Горячие клавиши по умолчанию выключены. Стрим: 720/1080/1440 и 30/60/120 к/с. Голосовая сцена — «пульс-полоса», круга в центре нет.

## Решения
- Node + Fastify + `node:sqlite`; медиа — mediasoup SFU в том же процессе.
- Electron + Svelte 5 (legacy) + Vite, только Windows.
- **Звук собеседников (важно, в 0.9.3 переписано):** `MediaElementAudioSourceNode` на элементе с `srcObject` в Chromium/Electron даёт **тишину** — поэтому громкость не работала. И вдобавок удалённая дорожка вообще не даёт данных, пока её не проигрывает `<audio>`. Схема: беззвучный `<audio muted>` с srcObject прокачивает дорожку, а слышимый звук идёт `createMediaStreamSource(stream)` → GainNode (0–2) → mixBus → AnalyserNode → destination. Если контекст не `running` — падаем на сам элемент (0–100%) и возвращаемся в граф по `statechange`. Диагностика: `window.__nexusVoice.audioDebug()`, слышимый уровень микшера — `window.__nexusVoice.mixLevel()`.
- Шумодав (`app/src/lib/noise.js`): режимы `rnnoise`, `rnnoise_gate`, `gate` (свой AudioWorklet из blob), `browser`, `off`. Цепочка: источник → RNNoise → highpass 85 Гц → gain (`micLevel` 0–200%) → гейт → лимитер. Усиление стоит ДО гейта, иначе тихий голос срезается.
- Стрим: отдельный продюсер `source: "screen", kind: "audio"` (loopback), захват в родном разрешении, масштаб в кодировщике, `MAX_INCOMING` 32 Мбит/с; качество выбирается в `picker.html`.
- Упоминания — `app/src/lib/mention.js`; «не беспокоить» пропускает только упоминания (`notifMention`).

## Состояние (18 ноября)
- Исправлено в 0.9.3 (не опубликовано, коммиты `30b3f81` + bump): громкость участника, больше шумодавов, усиление микрофона до 200%.
- Установщик собран: `app/out/Nexus-Setup-0.9.3.exe`. Релиз на GitHub ещё не создан — сначала коммиты должны уехать на remote.
- На VPS работает 0.9.2-сервер: `/opt/nexus/server` (systemd `nexus`, порт 8091), данные `/opt/nexus/data`, бэкап `/root/nexus-backup-20261117-013958.tgz`.

## Тесты (зелёные)
- `cd app; npm run build; npm test` — 42 (13 голосовых, в т.ч. «громкость участника меняет то, что слышно»: тон 440 Гц вместо микрофона + `mixPeak`/`mixLevel`, проверяет 30/100/200/0% и личный мьют).
- `cd server; node --test --test-force-exit test/*.test.js` — 51.

## Дальше
1. Опубликовать 0.9.3: `gh release create v0.9.3 --target <полный sha>` с `app/out/Nexus-Setup-0.9.3.exe` (+ blockmap, latest.yml).
2. Старое: активность «во что играют», светлая/системная тема.

## Подводные камни
- Тесты звука: мерить `mixLevel()` после паузы ≥350 мс (анализатор держит последние 43 мс), иначе видно старое значение.
- `edit_file` иногда портит строки — крупные правки делать `write_file`.
- Svelte не отслеживает значения внутри функций в шаблонах — производные считать в `$:` со ссылкой на `vs`.
- `node:sqlite`: `db.exec("PRAGMA …")`, `lastInsertRowid` через `Number()`.
- Тесты: `--test-force-exit`; перед клиентскими `npm run build`. Селекторы комнаты `.pulse-col`, мьют `.pulse-mute`.
- Релиз: `npm run dist`, коммит «Bump version to X», `gh release create vX --target <полный sha>` (короткий sha не принимает).
<!-- /drimvox -->
