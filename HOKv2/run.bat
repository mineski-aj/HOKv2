@echo off
title HOK Overlay Server v2
cd /d "%~dp0"
if not exist "node_modules" ( npm install )
node server.js
pause
