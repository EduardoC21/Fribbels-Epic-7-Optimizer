<#
  fork-build.ps1 — coloca o código do FORK dentro do data/jar/backend.jar.

  Não recompila o backend do upstream inteiro (o Lombok 1.16.4 dele não compila em JDK
  novo). Compila SÓ:
    - backend/src/main/java/com/fribbels/fork/*.java  (nosso pacote)
    - backend/src/main/java/com/fribbels/Main.java    (1 linha nossa: ForkRoutes.register)
    - as classes do UPSTREAM que mudaram no git depois do último backend.jar deles (o jar do
      repositório é de 2025-09 e o Java ganhou 4 sets novos em 2026: sem isso peças de
      Guerra/Perseguição/Enfraquecimento/Fervor são descartadas). Lombok do ~/.m2 (1.18.x).
  usando o próprio backend.jar como biblioteca, em bytecode Java 8 (o mesmo do jar),
  e atualiza essas classes dentro do jar.

  Quando rodar: depois de puxar um patch do upstream que traga um backend.jar novo
  (ou se o Main.java deles mudar — aí recolocar a linha do FORK antes).

  Uso (com o app FECHADO — jar em uso não pode ser alterado):
    powershell -ExecutionPolicy Bypass -File backend\fork-build.ps1
#>
param(
  # só para teste: atualizar OUTRO jar (uma cópia) em vez do data/jar/backend.jar
  [string]$JarPath
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$jarFile = if ($JarPath) { (Resolve-Path $JarPath).Path } else { Join-Path $root 'data\jar\backend.jar' }
$src = Join-Path $PSScriptRoot 'src\main\java\com\fribbels'
$out = Join-Path $env:TEMP 'fribbels-fork-build'
$backupDir = Join-Path $env:LOCALAPPDATA 'FribbelsFork\jar-backups'

# ---- JDK: javac + jar (o 'jar' costuma não estar no PATH) ----
$javac = (Get-Command javac -ErrorAction SilentlyContinue).Source
$jarExe = (Get-Command jar -ErrorAction SilentlyContinue).Source
if (-not $jarExe) {
  $cand = @()
  if ($env:JAVA_HOME) { $cand += Join-Path $env:JAVA_HOME 'bin\jar.exe' }
  $cand += Get-ChildItem 'C:\Program Files\Java', 'C:\Program Files\Eclipse Adoptium', 'C:\Program Files\Microsoft' -Filter jar.exe -Recurse -ErrorAction SilentlyContinue | ForEach-Object FullName
  $jarExe = $cand | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}
if (-not $javac -or -not $jarExe) { throw 'JDK não encontrado (preciso de javac e jar).' }

# ---- o jar não pode estar em uso ----
if (-not $JarPath -and (Get-NetTCPConnection -LocalPort 8130 -State Listen -ErrorAction SilentlyContinue)) {
  throw 'O backend está rodando (porta 8130). Feche o app e rode de novo.'
}

# ---- compila ----
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force $out | Out-Null
$files = @(Join-Path $src 'Main.java') + (Get-ChildItem (Join-Path $src 'fork') -Filter *.java | ForEach-Object FullName)
# classes do upstream mais novas que o jar deles (commit que mexeu no data/jar/backend.jar por último)
$jarCommit = (& git -C $root log -1 --format=%H -- data/jar/backend.jar)
$stale = @(& git -C $root diff --name-only $jarCommit HEAD -- backend/src/main/java |
  Where-Object { $_ -notmatch '/fork/' -and $_ -notmatch '/Main\.java$' } | ForEach-Object { Join-Path $root $_ })
$lombok = Get-ChildItem (Join-Path $env:USERPROFILE '.m2\repository\org\projectlombok\lombok') -Recurse -Filter 'lombok-1.18.*.jar' -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^lombok-1\.18\.\d+\.jar$' } |
  Sort-Object { [version]($_.BaseName -replace '^lombok-', '') } | Select-Object -Last 1
$cp = $jarFile
if ($stale.Count) {
  if (-not $lombok) { throw 'Há classes do upstream mais novas que o jar, mas não achei o Lombok 1.18.x no ~/.m2.' }
  Write-Host ('Upstream mais novo que o jar: ' + (($stale | ForEach-Object { Split-Path $_ -Leaf }) -join ', '))
  $files += $stale
  $cp = "$jarFile;$($lombok.FullName)"
}
& $javac --release 8 -Xlint:-options -nowarn -encoding UTF-8 -cp $cp -processorpath $(if ($lombok) { $lombok.FullName } else { $jarFile }) -d $out @files
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar.' }

# ---- backup e atualização do jar ----
New-Item -ItemType Directory -Force $backupDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item $jarFile (Join-Path $backupDir "backend-$stamp.jar")
Push-Location $out
try {
  & $jarExe uf $jarFile 'com'
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao atualizar o jar - provavelmente algum java ainda está com ele aberto (app ou outra instância). O jar anterior está intacto.' }
} finally { Pop-Location }

Write-Host "OK: fork instalado em $jarFile"
Write-Host "Backup do jar anterior: $backupDir\backend-$stamp.jar"
