@echo off
title json-tool
color 0A
chcp 65001 >nul
cd /d "%~dp0"
set "NODE_OPTIONS="
powershell -NoProfile -Command "[Console]::OutputEncoding=[Text.Encoding]::UTF8; node node_modules\vite\bin\vite.js | ForEach-Object { [Console]::WriteLine($_); if ($_ -match 'ready') { [Console]::Title='json-tool' } }"
pause
