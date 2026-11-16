@echo off
title HOK API Dashboard Server
cd /d "%~dp0"
if not exist "node_modules" ( npm install express axios cors dotenv )
node server.js
pause
