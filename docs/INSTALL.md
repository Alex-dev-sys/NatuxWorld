# Установка NATUX WORLD · Installation Guide

Сборки лаунчера **не подписаны** платными сертификатами (Apple Developer ID / Windows code-signing), поэтому при первом запуске ОС показывает предупреждение. Это ожидаемо для неподписанного приложения и **не означает вирус**. Ниже — как запустить и как убедиться, что файл настоящий.

The launcher builds are **unsigned** (no paid Apple Developer ID / Windows code-signing certificate), so the OS shows a warning on first launch. This is expected for an unsigned app and **does not mean malware**. Below: how to run it, and how to verify the file is genuine.

---

## 🪟 Windows

При запуске установщика Microsoft Defender SmartScreen покажет синее окно **«Система Windows защитила ваш компьютер»** / *"Windows protected your PC"*.

When you run the installer, Microsoft Defender SmartScreen shows a blue **"Windows protected your PC"** dialog.

1. Нажми **«Подробнее»** / **"More info"**.
2. Нажми появившуюся кнопку **«Выполнить в любом случае»** / **"Run anyway"**.
3. Установка идёт без прав администратора (per-user) — UAC не запрашивает пароль.

Почему появляется предупреждение: SmartScreen доверяет файлам по «репутации» издателя, которая набирается только с подписанных сборок или со временем. Без сертификата ($100–400/год) предупреждение убрать нельзя — только обойти вручную.

Why it appears: SmartScreen trusts files by publisher "reputation", earned only via signed builds or over time. Without a certificate the warning can't be removed — only bypassed manually.

---

## 🍎 macOS

Сборка `.dmg` не подписана, Gatekeeper блокирует первый запуск.

1. Открой `.dmg`, перетащи **NATUX WORLD** в **Applications**.
2. Сними карантин одной командой в Терминале (самый надёжный способ):

```bash
xattr -cr "/Applications/NATUX WORLD.app"
```

3. Запусти приложение как обычно.

Без терминала: правый клик (Ctrl + клик) по иконке → **Открыть** → в диалоге ещё раз **Открыть**. Если macOS пишет «приложение повреждено» — используй команду `xattr` выше.

> Авто-обновление на macOS не работает без подписи — обновляйся, скачивая новый `.dmg` из Releases. Лаунчер сам покажет уведомление со ссылкой, когда выйдет новая версия.

---

## Проверка целостности

К каждому релизу прикладываются файлы **`SHA256SUMS-windows.txt`** и **`SHA256SUMS-macos.txt`** с контрольными суммами артефактов. Сверь сумму скачанного файла — если совпадает, файл не повреждён и не подменён.

Each release ships **`SHA256SUMS-windows.txt`** and **`SHA256SUMS-macos.txt`** with artifact checksums. Compare the hash of your download — if it matches, the file is intact and untampered.

**Windows (PowerShell):**

```powershell
Get-FileHash ".\NATUX WORLD-Setup-1.9.2-x64.exe" -Algorithm SHA256
```

**macOS / Linux:**

```bash
shasum -a 256 "NATUX WORLD-1.9.2-arm64.dmg"
```

Сравни вывод со строкой для этого файла в `SHA256SUMS-windows.txt` / `SHA256SUMS-macos.txt`. Совпало — всё чисто. / Compare the output with the matching line in the checksums file. Match = clean.

---

## После установки

Лаунчеру нужен только интернет. При первом нажатии **ИГРАТЬ** он сам докачает Java 21, Minecraft и Forge 1.21.1, установит и запустит игру с подключением к серверу.

The launcher only needs internet. On the first **PLAY** click it downloads Java 21, Minecraft and Forge 1.21.1, installs everything, and launches the game connected to the server.
