@echo off
cd /d "%~dp0"
npm.cmd run build
npm.cmd run start
