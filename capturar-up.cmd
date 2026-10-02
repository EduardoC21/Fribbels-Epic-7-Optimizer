@echo off
REM capturar-up.cmd - captura LOCAL do trafego do jogo durante ups (clique 2x). Nada sai do PC.
REM Pede administrador sozinho (o Npcap so enxerga a placa de rede como admin).
net session >nul 2>&1 || (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
title Captura de up (E4)
cd /d "%~dp0"
net start npcap >nul 2>&1
python tools\capture_up.py
pause
