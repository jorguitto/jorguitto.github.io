# Refactor FitTracker legacy -> ES Modules (static, sin Node)
# Uso: ejecuta este script en la carpeta del proyecto (donde está proyecto(1).html)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$legacy = Join-Path (Get-Location) "proyecto(1).html"
if (!(Test-Path -LiteralPath $legacy)) { throw "No encuentro proyecto(1).html en: $(Get-Location)" }

# Output structure (puedes cambiar a gusto)
$root = Get-Location
$jsDir = Join-Path $root "js"
$dataDir = Join-Path $jsDir "data"
$coreDir = Join-Path $jsDir "core"
$servicesDir = Join-Path $jsDir "services"

New-Item -ItemType Directory -Force -Path $jsDir,$dataDir,$coreDir,$servicesDir | Out-Null

$html = Get-Content -LiteralPath $legacy -Raw -Encoding UTF8

function Get-BlockByBraceScan {
  param(
    [Parameter(Mandatory=$true)][string]$Text,
    [Parameter(Mandatory=$true)][string]$Anchor,   # ej: "const foodDatabase"
    [Parameter(Mandatory=$true)][string]$OpenToken # ej: "{"
  )

  $i = $Text.IndexOf($Anchor, [System.StringComparison]::Ordinal)
  if ($i -lt 0) { return $null }

  $j = $Text.IndexOf($OpenToken, $i, [System.StringComparison]::Ordinal)
  if ($j -lt 0) { throw "No encuentro '$OpenToken' tras '$Anchor'." }

  $depth = 0
  $k = $j
  while ($k -lt $Text.Length) {
    $ch = $Text[$k]
    if ($ch -eq '{') { $depth++ }
    elseif ($ch -eq '}') {
      $depth--
      if ($depth -eq 0) {
        # intenta capturar también el ';' final si existe
        $end = $k + 1
        while ($end -lt $Text.Length -and [char]::IsWhiteSpace($Text[$end])) { $end++ }
        if ($end -lt $Text.Length -and $Text[$end] -eq ';') { $end++ }
        return @{
          Start = $i
          BodyStart = $j
          End = $end
          Body = $Text.Substring($j, ($k - $j + 1))
        }
      }
    }
    $k++
  }
  throw "No pude cerrar llaves para '$Anchor'."
}

function Write-ModuleConst {
  param([string]$OutPath, [string]$ConstName, [string]$JsonLikeBlock)
  $content = @"
export const $ConstName = $JsonLikeBlock;
"@
  Set-Content -LiteralPath $OutPath -Value $content -Encoding UTF8
}

# ---- Extraer DATA (foodDatabase / BIO_DATABASE / MICRO_DEFS / CLIMA_PETRER) ----
$food = Get-BlockByBraceScan -Text $html -Anchor "const foodDatabase" -OpenToken "{"
if ($food) {
  Write-ModuleConst -OutPath (Join-Path $dataDir "foodDatabase.js") -ConstName "foodDatabase" -JsonLikeBlock $food.Body
}

$bioDb = Get-BlockByBraceScan -Text $html -Anchor "const BIO_DATABASE" -OpenToken "{"
$micro = Get-BlockByBraceScan -Text $html -Anchor "const MICRO_DEFS" -OpenToken "{"

# CLIMA_PETRER es array: buscamos el '[' y hacemos scan con [] usando un truco: convertimos a scan por tokens manual
function Get-ArrayBlockByBracketScan {
  param([string]$Text, [string]$Anchor)
  $i = $Text.IndexOf($Anchor, [System.StringComparison]::Ordinal)
  if ($i -lt 0) { return $null }
  $j = $Text.IndexOf('[', $i)
  if ($j -lt 0) { throw "No encuentro '[' tras '$Anchor'." }

  $depth = 0
  $k = $j
  while ($k -lt $Text.Length) {
    $ch = $Text[$k]
    if ($ch -eq '[') { $depth++ }
    elseif ($ch -eq ']') {
      $depth--
      if ($depth -eq 0) {
        $end = $k + 1
        while ($end -lt $Text.Length -and [char]::IsWhiteSpace($Text[$end])) { $end++ }
        if ($end -lt $Text.Length -and $Text[$end] -eq ';') { $end++ }
        return @{
          Start = $i
          BodyStart = $j
          End = $end
          Body = $Text.Substring($j, ($k - $j + 1))
        }
      }
    }
    $k++
  }
  throw "No pude cerrar corchetes para '$Anchor'."
}

$clima = Get-ArrayBlockByBracketScan -Text $html -Anchor "const CLIMA_PETRER"
if ($clima) {
  Write-ModuleConst -OutPath (Join-Path $dataDir "clima.js") -ConstName "CLIMA_PETRER" -JsonLikeBlock $clima.Body
}

# bioDatabase.js (agregamos lo que exista)
$bioOut = @()
if ($bioDb) { $bioOut += "export const BIO_DATABASE = $($bioDb.Body);`n" }
if ($micro) { $bioOut += "export const MICRO_DEFS = $($micro.Body);`n" }
if ($bioOut.Count -gt 0) {
  Set-Content -LiteralPath (Join-Path $dataDir "bioDatabase.js") -Value ($bioOut -join "`n") -Encoding UTF8
}

# ---- Extraer BioEngine (clase) a core/BioEngine.js ----
# Capturamos desde "class BioEngine" hasta el cierre de la clase (asumimos termina antes del siguiente gran bloque)
$bioEngineMatch = [regex]::Match($html, "class\s+BioEngine\s*\{[\s\S]*?\n\s*\}", "Singleline")
if ($bioEngineMatch.Success) {
  $bioEngineClass = $bioEngineMatch.Value

  $bioEngineModule = @"
import { BIO_DATABASE } from '../data/bioDatabase.js';
import { CLIMA_PETRER } from '../data/clima.js';

export class BioEngine {
  $($bioEngineClass -replace '^class\s+BioEngine\s*\{', '')

}
"@

  # Limpieza: la clase legacy referenciaba USER_BIO/CLIMA_REAL global; aquí solo movemos el “core”.
  # Si más abajo la clase usa globals, el controlador (main.js) deberá pasar userBio/climaReal.
  $bioEngineModule = $bioEngineModule -replace "USER_BIO", "userBio"
  $bioEngineModule = $bioEngineModule -replace "CLIMA_REAL", "climaReal"

  Set-Content -LiteralPath (Join-Path $coreDir "BioEngine.js") -Value $bioEngineModule -Encoding UTF8
}

# ---- Firebase services (reusamos tus módulos del workspace si ya existen, si no creamos placeholders) ----
if (!(Test-Path -LiteralPath (Join-Path $servicesDir "firebase-config.js"))) {
  $firebaseConfigMatch = [regex]::Match($html, "const\s+firebaseConfig\s*=\s*\{[\s\S]*?\};", "Singleline")
  $firebaseConfigConst = if ($firebaseConfigMatch.Success) { $firebaseConfigMatch.Value } else { "const firebaseConfig = {};" }

  $firebaseSvc = @"
let cached = null;

export function initFirebase() {
  if (cached) return cached;
  const firebaseGlobal = window.firebase;
  if (!firebaseGlobal) throw new Error('Firebase SDK no cargado (compat CDN).');

  $firebaseConfigConst

  if (!firebaseGlobal.apps || !firebaseGlobal.apps.length) firebaseGlobal.initializeApp(firebaseConfig);

  const auth = firebaseGlobal.auth();
  const db = firebaseGlobal.firestore();
  cached = { firebase: firebaseGlobal, auth, db, firebaseConfig };
  return cached;
}
"@
  Set-Content -LiteralPath (Join-Path $servicesDir "firebase-config.js") -Value $firebaseSvc -Encoding UTF8
}

# ---- Crear main.js (controlador) que importe data + core + services ----
$mainJs = @"
import { initFirebase } from './services/firebase-config.js';
import { foodDatabase } from './data/foodDatabase.js';
import { MICRO_DEFS } from './data/bioDatabase.js';
import { BioEngine } from './core/BioEngine.js';

const { auth, db } = initFirebase();

// TODO: aquí se migran tus handlers de DOM desde el legacy (proyecto(1).html)
// - listeners, render, navegación, etc.
// - usa foodDatabase/MICRO_DEFS/BioEngine sin meter lógica pura en el DOM

window.__FITTRACKER__ = { auth, db, foodDatabase, MICRO_DEFS, BioEngine };
console.log('FitTracker modular arrancado');
"@
Set-Content -LiteralPath (Join-Path $jsDir "main.js") -Value $mainJs -Encoding UTF8

# ---- index.html limpio: quitamos el <script> monolítico y lo reemplazamos por ES module ----
# Heurística: eliminar el ÚLTIMO <script>...</script> grande (el que contiene firebaseConfig/foodDatabase)
$scriptRegex = [regex]::new("<script>\s*[\s\S]*?(firebaseConfig|foodDatabase|class\s+BioEngine)[\s\S]*?</script>", "IgnoreCase,Singleline")
$newHtml = $scriptRegex.Replace($html, "", 1)

# Insertar module loader antes de </body>
if ($newHtml -notmatch "<script\s+type\s*=\s*['""]module['""]") {
  $newHtml = $newHtml -replace "</body>", "  <script type=`"module`" src=`"js/main.js`"></script>`n</body>"
}

# Renombrar salida: index.html
Set-Content -LiteralPath (Join-Path $root "index.html") -Value $newHtml -Encoding UTF8

Write-Host "OK. Generados: index.html + js/data/* + js/core/* + js/services/*"
Write-Host "Abre con servidor HTTP (GitHub Pages / Live Server). ES Modules pueden fallar en file://"
