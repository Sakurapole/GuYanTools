[CmdletBinding()]
param(
  [string]$NdkRoot = $env:ANDROID_NDK_HOME,
  [string]$BuildRoot,
  [string]$OutputRoot
)
$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($BuildRoot)) { $BuildRoot = Join-Path $scriptRoot '..\build-android' }
if ([string]::IsNullOrWhiteSpace($OutputRoot)) { $OutputRoot = Join-Path $scriptRoot '..\..\desktop\src\main\android-tools\resources\win32-x64\android-uhid-service' }
if ([string]::IsNullOrWhiteSpace($NdkRoot) -or -not (Test-Path -LiteralPath $NdkRoot)) { throw 'ANDROID_NDK_HOME is required' }
$cmake = (Get-Command cmake -ErrorAction SilentlyContinue).Source
$ninja = (Get-Command ninja -ErrorAction SilentlyContinue).Source
if (-not $cmake) { throw 'cmake is required' }
if (-not $ninja) { throw 'ninja is required' }
$source = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$build = (Resolve-Path (New-Item -ItemType Directory -Force -Path $BuildRoot)).Path
$output = (Resolve-Path (New-Item -ItemType Directory -Force -Path $OutputRoot)).Path
$toolchain = Join-Path $NdkRoot 'build\cmake\android.toolchain.cmake'
if (-not (Test-Path -LiteralPath $toolchain)) { throw "Android NDK CMake toolchain not found: $toolchain" }
& $cmake -S $source -B $build -G Ninja "-DCMAKE_TOOLCHAIN_FILE=$toolchain" '-DANDROID_ABI=arm64-v8a' '-DANDROID_PLATFORM=android-29' '-DCMAKE_BUILD_TYPE=Release' "-DCMAKE_MAKE_PROGRAM=$ninja"
& $cmake --build $build --config Release --target guyantools-uhid-service
$binary = Join-Path $build 'guyantools-uhid-service'
if (-not (Test-Path -LiteralPath $binary)) { throw "UHID service binary not found: $binary" }
Copy-Item -LiteralPath $binary -Destination (Join-Path $output 'guyantools-uhid-service') -Force
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $output 'guyantools-uhid-service')).Hash.ToLowerInvariant()
Set-Content -LiteralPath (Join-Path $output 'manifest.json') -Encoding utf8 -Value (@{ abi = 'arm64-v8a'; sha256 = $hash; source = 'android-uhid-service'; } | ConvertTo-Json)
Write-Output "Built $binary"
