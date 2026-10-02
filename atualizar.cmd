@echo off
REM atualizar.cmd - puxa os patches do Fribbels (novos herois/artefatos/sets)
REM mantendo 'main' como espelho e trazendo as mudancas para 'fork-features'.
title Atualizar do Fribbels
cd /d "%~dp0"

git remote get-url upstream >nul 2>&1 || git remote add upstream https://github.com/fribbels/Fribbels-Epic-7-Optimizer.git

echo Buscando novidades do Fribbels...
git fetch upstream

git log --oneline HEAD..upstream/main > "%TEMP%\_e7novos.txt"
for %%A in ("%TEMP%\_e7novos.txt") do if %%~zA==0 (
  echo.
  echo Nada novo. Voce ja esta atualizado.
  echo.
  del "%TEMP%\_e7novos.txt" >nul 2>&1
  pause
  exit /b 0
)

echo.
echo === Commits novos no upstream ===
type "%TEMP%\_e7novos.txt"
del "%TEMP%\_e7novos.txt" >nul 2>&1
echo.
echo === Arquivos que mudariam ===
git diff --stat main upstream/main
echo.
echo Revise acima. Se parecer so dados/herois, pode aplicar.
set /p RESP=Aplicar em main e mesclar em fork-features? (s/N):
if /i not "%RESP%"=="s" (
  echo Cancelado.
  pause
  exit /b 0
)

git checkout main || goto :erro
git merge --ff-only upstream/main || goto :erro
git push origin main
git checkout fork-features || goto :erro
git merge main || goto :erro

echo.
echo Pronto. 'main' atualizado e 'fork-features' mesclado.
echo Se um SET novo entrou, pode ser preciso rebuildar o backend.jar (ver .claude-notes/08).
pause
exit /b 0

:erro
echo.
echo !! Ocorreu um erro no git. Resolva o conflito/estado e tente de novo.
pause
exit /b 1
