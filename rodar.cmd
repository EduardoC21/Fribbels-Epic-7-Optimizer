@echo off
REM rodar.cmd - abre o app em modo desenvolvimento (clique 2x ou rode no terminal).
REM O "yarn dev" compila o front, abre a janela do app e sobe o backend Java sozinho.
title Fribbels E7 Optimizer (dev)
cd /d "%~dp0"

echo Garantindo Node 14...
call nvm use 14.21.3 >nul 2>&1

for /f "delims=" %%v in ('node -v') do set NODEV=%%v
echo Node %NODEV%
echo %NODEV% | findstr /b "v14" >nul || (
  echo.
  echo !! Node nao esta na versao 14. Abra o PowerShell como Admin e rode: nvm use 14.21.3
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias pela primeira vez ^(demora alguns minutos^)...
  call yarn install
)

REM backend Java esquecido de uma execucao anterior (trava o backend.jar)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backend\parar-backend.ps1"

echo.
echo Subindo o app... a janela abre sozinha em ~30-60s na primeira vez.
echo Para fechar: feche a janela do app e de Ctrl+C aqui.
echo.
REM o "finally" roda mesmo com Ctrl+C: o backend Java fecha junto com o app
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { yarn dev } finally { & '%~dp0backend\parar-backend.ps1' }"

echo.
echo (o app foi encerrado)
pause
