<#
  parar-backend.ps1 - encerra o backend Java DO APP (java -jar ...\data\jar\backend.jar, porta 8130).

  Usado pelo rodar.cmd: ao abrir (sobra de uma execucao anterior) e ao fechar o app
  (inclusive com Ctrl+C no terminal). O app classico ja tenta matar o Java ao fechar a
  janela (subprocess.js, 'app-close'), mas se o "yarn dev" e interrompido o Java fica
  orfao e trava o backend.jar (o fork-build.ps1 nao consegue atualizar).

  NAO mexe no backend de TESTE (ForkTestMain, porta 8131) nem em outro java qualquer.
  O backend nao grava nada em disco (quem grava o autosave e o front): encerrar nao perde dado.
#>
$ErrorActionPreference = 'SilentlyContinue'
$jar = (Join-Path (Split-Path -Parent $PSScriptRoot) 'data\jar\backend.jar').ToLower().Replace('\', '/')
$alvos = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'java.exe' -and $_.CommandLine -and
  $_.CommandLine -notlike '*ForkTestMain*' -and
  $_.CommandLine -like '*-jar*' -and
  $_.CommandLine.ToLower().Replace('\', '/') -like "*$jar*"
}
foreach ($p in $alvos) {
  Stop-Process -Id $p.ProcessId -Force -Confirm:$false
  Write-Host "backend do app encerrado (pid $($p.ProcessId))"
}
