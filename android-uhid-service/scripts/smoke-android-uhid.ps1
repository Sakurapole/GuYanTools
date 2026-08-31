[CmdletBinding()]
param([string]$Adb = $env:ADB, [string]$Serial = $env:ANDROID_SERIAL)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Adb)) { $Adb = 'adb' }
$argsPrefix = @()
if (-not [string]::IsNullOrWhiteSpace($Serial)) { $argsPrefix = @('-s', $Serial) }
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$binary = Join-Path $root '..\desktop\src\main\android-tools\resources\win32-x64\android-uhid-service\guyantools-uhid-service'
if (-not (Test-Path -LiteralPath $binary)) { throw "UHID binary not found: $binary" }
$remote = "/data/local/tmp/guyantools-smoke-$([Guid]::NewGuid().ToString('N')).bin"
try {
  $props = & $Adb @argsPrefix shell getprop
  $version = [regex]::Match(($props -join "`n"), '\[ro\.build\.version\.release\]: \[(.*?)\]').Groups[1].Value
  $model = [regex]::Match(($props -join "`n"), '\[ro\.product\.model\]: \[(.*?)\]').Groups[1].Value
  Write-Output "device=$model android=$version"
  & $Adb @argsPrefix push $binary $remote | Out-Null
  & $Adb @argsPrefix shell chmod 700 $remote
  $input = "{`"type`":`"keyboard`",`"report`":{`"modifiers`":0,`"keys`":[]}}`n{`"type`":`"mouse`",`"report`":{`"buttons`":0,`"dx`":0,`"dy`":0,`"wheel`":0}}`n"
  $input | & $Adb @argsPrefix shell $remote
  if ($LASTEXITCODE -ne 0) { throw "UHID service exited with code $LASTEXITCODE" }
  Write-Output 'smoke=passed'
} finally {
  & $Adb @argsPrefix shell rm -f $remote 2>$null | Out-Null
}
