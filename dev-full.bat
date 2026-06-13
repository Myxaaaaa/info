@echo off
cd /d "%~dp0"
start "API 3001" cmd /k npm.cmd run dev:api
timeout /t 2 /nobreak >nul
npm.cmd run dev
