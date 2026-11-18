<!-- drimvox -->
## Notes for agents
Kept by the agent that builds this project in Drimvox, rewritten as the work goes on. Anyone continuing here (a new
conversation, Codex, Claude Code) reads this first; what the user says now comes before it.

## Проект
Закрытый клон Discord (Nexus) для своих. VPS 1 ядро / 1 ГБ (Ubuntu 24.04, Node 22, Caddy, coturn), домен `fiit.37.235.241.23.sslip.io`. GitHub: `amave423/Nexus`.

## Пользователь просит
Магазин не нужен. Главное: хороший войс, шумодав, чат, серверы, демка, камера, статусы, роли. Дизайн — макет в корне (`design/`), не менять на «обычный». Меняемые имя и постоянный логин. Уведомления и упоминания. Голосовой экран отдельный, без надписей. Фото открывать на 50%, минимум 20%. ПКМ по человеку — громкость до 200% и личный мьют. Горячие клавиши по умолчанию выключены. Стрим: 720/1080/1440 и 30/60/120 к/с. Голосовая сцена — «пульс-полоса», круга в центре нет. **Релизы всегда выкладывать на GitHub** (не оставлять только локально в `app/out`).

## Решения
- Node + Fastify + `node:sqlite`; медиа — mediasoup SFU в том же процессе.
- Electron + Svelte 5 (legacy) + Vite, только Windows.
- **Звук собеседников (0.9.3, переписано):** `MediaElementAudioSourceNode` на элементе с `srcObject` в Chromium/Electron даёт **тишину**, а удалённая дорожка вообще не отдаёт данных, пока её не проигрывает `<audio>`. Схема: беззвучный `<audio muted>` с srcObject прокачивает дорожку, слышимый звук идёт `createMediaStreamSource(stream)` → GainNode (0–2) → mixBus → AnalyserNode → destination. Если контекст не `running` — падаем на сам элемент (0–100%), по `statechange` возвращаемся в граф. Диагностика: `window.__nexusVoice.audioDebug()`, слышимый уровень микшера — `window.__nexusVoice.mixLevel()`.
- Шумодав (`app/src/lib/noise.js`): режимы `rnnoise`, `rnnoise_gate`, `gate` (свой AudioWorklet из blob), `browser`, `off`. Цепочка: источник → RNNoise → highpass 85 Гц → gain (`micLevel` 0–200%) → гейт → лимитер. Усиление ДО гейта, иначе тихий голос срезается.
- Стрим: отдельный продюсер `source: "screen", kind: "audio"` (loopback), захват в родном разрешении, масштаб в кодировщике, `MAX_INCOMING` 32 Мбит/с; качество выбирается в `picker.html`.
- Упоминания — `app/src/lib/mention.js`; «не беспокоить» пропускает только упоминания (`notifMention`).

## Состояние (18 ноября)
- Опубликован `v0.9.3` (тег на `7852decf`): громкость участника, больше шумодавов, усиление до 200%. Ассеты: `Nexus-Setup-0.9.3.exe`, blockmap, `latest.yml`.
- Сервер на VPS — 0.9.2: `/opt/nexus/server` (systemd `nexus`, порт 8091), данные `/opt/nexus/data`, бэкап `/root/nexus-backup-20261117-013958.tgz`. Клиентских правок сервер не требует.

## Тесты (зелёные)
- `cd app; npm run build; npm test` — 42 (13 голосовых, в т.ч. «громкость участника меняет то, что слышно»: тон 440 Гц вместо микрофона + `mixPeak`/`mixLevel`, проверяет 30/100/200/0% и личный мьют).
- `cd server; node --test --test-force-exit test/*.test.js` — 51.

## Дальше
1. Старое: активность «во что играют», светлая/системная тема.
2. Ждём отзыва по громкости и гейту на настоящих микрофонах — порог гейта может потребовать подстройки.

## Подводные камни
- Тесты звука: мерить `mixLevel()` после паузы ≥350 мс (анализатор держит последние 43 мс), иначе видно старое значение.
- `edit_file` иногда портит строки — крупные правки делать `write_file`.
- Svelte не отслеживает значения внутри функций в шаблонах — производные считать в `$:` со ссылкой на `vs`.
- `node:sqlite`: `db.exec("PRAGMA …")`, `lastInsertRowid` через `Number()`.
- Тесты: `--test-force-exit`; перед клиентскими `npm run build`. Селекторы комнаты `.pulse-col`, мьют `.pulse-mute`.
- Релиз: `npm run dist`, коммит «Bump version to X», убедиться, что коммит на remote (`git fetch; git log origin/main..HEAD`), затем `gh release create vX --target <полный sha> app/out/Nexus-Setup-X.exe app/out/Nexus-Setup-X.exe.blockmap app/out/latest.yml`.
<!-- /drimvox -->
