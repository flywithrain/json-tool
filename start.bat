@echo off
title json-tool
color 0A
cd /d "%~dp0"
set "NODE_OPTIONS="
echo.
echo  ============================================
echo    json-tool
echo  ============================================
echo.
node node_modules\vite\bin\vite.js
pause
