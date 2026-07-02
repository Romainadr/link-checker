<#
.SYNOPSIS
  Genere un manifest Link Checker pret a deployer dans le tenant d'un client.

.DESCRIPTION
  A partir de manifest.xml (reference), produit dist/manifest-<slug>.xml :
   - nouveau GUID (Id) propre au client, stable entre deux generations
     (memorise dans clients/<slug>.json sous "manifestId")
   - ?client=<slug> ajoute aux URLs taskpane.html et commands.html pour
     charger la config clients/<slug>.json au runtime
   - branding, icones, ProviderName EMPIRYS conserves tels quels
  Cree aussi clients/<slug>.json depuis le template s'il n'existe pas.

.EXAMPLE
  .\New-ClientManifest.ps1 -Client acme
  # -> dist/manifest-acme.xml + clients/acme.json (a completer puis git push)

.NOTES
  Le manifest genere se deploie dans le tenant du client via
  Microsoft 365 admin center > Parametres > Applications integrees
  > Charger des applications personnalisees. Voir DEPLOIEMENT.md.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9\-]+$')]
  [string]$Client
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$srcManifest = Join-Path $root 'manifest.xml'
$distDir     = Join-Path $root 'dist'
$clientsDir  = Join-Path $root 'clients'
$clientJson  = Join-Path $clientsDir "$Client.json"
$outManifest = Join-Path $distDir "manifest-$Client.xml"

if (-not (Test-Path $srcManifest)) { throw "manifest.xml introuvable dans $root" }
New-Item -ItemType Directory -Force -Path $distDir, $clientsDir | Out-Null

# --- 1. Config client : creee depuis le template si absente -----------------
if (-not (Test-Path $clientJson)) {
    $template = Join-Path $clientsDir '_template.json'
    if (Test-Path $template) {
        Copy-Item $template $clientJson
        Write-Warning "clients/$Client.json cree depuis le template : COMPLETER les domaines du client avant deploiement."
    } else {
        '{ "orgDomains": [], "trustedRoots": [], "trustedHostnames": [] }' |
            Set-Content -Path $clientJson -Encoding UTF8
    }
}

# --- 2. GUID stable par client ----------------------------------------------
$cfg = Get-Content $clientJson -Raw | ConvertFrom-Json
if ($cfg.PSObject.Properties['manifestId'] -and $cfg.manifestId) {
    $guid = $cfg.manifestId
} else {
    $guid = [guid]::NewGuid().ToString()
    $cfg | Add-Member -NotePropertyName manifestId -NotePropertyValue $guid -Force
    $cfg | ConvertTo-Json -Depth 5 | Set-Content -Path $clientJson -Encoding UTF8
}

# --- 3. Generation du manifest ----------------------------------------------
$xml = Get-Content $srcManifest -Raw

# Id unique par client (ne matche que le premier <Id>, celui de OfficeApp)
$xml = [regex]::new('<Id>[^<]+</Id>').Replace($xml, "<Id>$guid</Id>", 1)

# Injection du parametre client sur les pages applicatives
$xml = $xml -replace 'src/taskpane\.html(\?client=[a-z0-9\-]+)?', "src/taskpane.html?client=$Client"
$xml = $xml -replace 'src/commands\.html(\?client=[a-z0-9\-]+)?', "src/commands.html?client=$Client"

Set-Content -Path $outManifest -Value $xml -Encoding UTF8

# --- 4. Controles rapides ----------------------------------------------------
try { [xml](Get-Content $outManifest -Raw) | Out-Null } catch { throw "XML genere invalide : $_" }

Write-Host ""
Write-Host "OK  dist/manifest-$Client.xml genere (Id: $guid)" -ForegroundColor Green
Write-Host ""
Write-Host "Etapes suivantes :"
Write-Host "  1. Completer clients/$Client.json (domaines du client)"
Write-Host "  2. git add clients/$Client.json && git commit && git push  (publie la config sur GitHub Pages)"
Write-Host "  3. Deployer dist/manifest-$Client.xml dans le tenant client (voir DEPLOIEMENT.md)"
