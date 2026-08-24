@echo off
rem Arranque manual do site (janela visível). Fecha a janela para parar.
cd /d "%~dp0.."
title Rustworthy Site
node server\app.js
pause
