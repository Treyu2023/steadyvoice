$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$page = Join-Path $here "SpeakWell.html"
if (-not (Test-Path -LiteralPath $page)) { $page = Join-Path $here "SteadyVoice.html" }

function Show-Problem($message) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($message, "Speak Well") | Out-Null
}

if (-not (Test-Path -LiteralPath $page)) {
  Show-Problem "SpeakWell.html is not in this folder.`r`n`r`nUnzip the whole zip. Do not move this starter by itself."
  exit 1
}

function Find-Browser {
  $chrome = @(
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  )
  foreach ($path in $chrome) {
    if ($path -and (Test-Path -LiteralPath $path)) { return $path }
  }
  $chromeKey = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
  if (Test-Path $chromeKey) {
    $found = (Get-ItemProperty $chromeKey)."(default)"
    if ($found -and (Test-Path -LiteralPath $found)) { return $found }
  }
  $edge = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($path in $edge) {
    if ($path -and (Test-Path -LiteralPath $path)) { return $path }
  }
  $edgeKey = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe"
  if (Test-Path $edgeKey) {
    $found = (Get-ItemProperty $edgeKey)."(default)"
    if ($found -and (Test-Path -LiteralPath $found)) { return $found }
  }
  return $null
}

$browser = Find-Browser
if (-not $browser) {
  Show-Problem "Speak Well could not find Chrome or Edge.`r`n`r`nAsk someone to install Google Chrome. Then double-click Start-SpeakWell again."
  exit 1
}

$full = (Resolve-Path -LiteralPath $page).Path
$url = "file:///" + ($full -replace "\\", "/")
$url = $url -replace " ", "%20"
try {
  Start-Process -FilePath $browser -ArgumentList @("--app=$url", "--start-maximized")
} catch {
  Show-Problem "Speak Well found a browser but it did not open. Ask someone for help."
  exit 1
}
exit 0
