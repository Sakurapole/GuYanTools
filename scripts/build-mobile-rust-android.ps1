[CmdletBinding()]
param(
    [string[]]$Targets = @("arm64-v8a", "x86_64"),
    [switch]$DebugBuild
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$CoreDir = Join-Path $RepoRoot "multi_platform_core"
$JniLibsDir = Join-Path $RepoRoot "mobile\android\app\src\main\jniLibs"
$AndroidLocalProperties = Join-Path $RepoRoot "mobile\android\local.properties"
$ProfileArgs = if ($DebugBuild) { @() } else { @("--release") }

function Invoke-External {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory
    )

    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$FilePath $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

function Ensure-CargoNdk {
    if (Get-Command cargo-ndk -ErrorAction SilentlyContinue) {
        return
    }
    Invoke-External "cargo" @("install", "cargo-ndk", "--locked") $RepoRoot
}

function Ensure-RustTargets {
    $targetMap = @{
        "arm64-v8a" = "aarch64-linux-android"
        "x86_64" = "x86_64-linux-android"
        "armeabi-v7a" = "armv7-linux-androideabi"
        "x86" = "i686-linux-android"
    }

    $installed = (& rustup target list --installed)
    foreach ($target in $Targets) {
        $rustTarget = $targetMap[$target]
        if ([string]::IsNullOrWhiteSpace($rustTarget)) {
            throw "Unsupported Android ABI: $target"
        }
        if ($installed -notcontains $rustTarget) {
            Invoke-External "rustup" @("target", "add", $rustTarget) $RepoRoot
        }
    }
}

function Ensure-AndroidNdkHome {
    if (-not [string]::IsNullOrWhiteSpace($env:ANDROID_NDK_HOME) -and (Test-Path $env:ANDROID_NDK_HOME)) {
        return
    }
    if (-not [string]::IsNullOrWhiteSpace($env:ANDROID_NDK_ROOT) -and (Test-Path $env:ANDROID_NDK_ROOT)) {
        $env:ANDROID_NDK_HOME = $env:ANDROID_NDK_ROOT
        return
    }

    $sdkDir = $env:ANDROID_SDK_ROOT
    if ([string]::IsNullOrWhiteSpace($sdkDir)) {
        $sdkDir = $env:ANDROID_HOME
    }
    if ([string]::IsNullOrWhiteSpace($sdkDir) -and (Test-Path $AndroidLocalProperties)) {
        $sdkLine = Get-Content $AndroidLocalProperties |
            Where-Object { $_ -match '^sdk\.dir=' } |
            Select-Object -First 1
        if ($sdkLine) {
            $sdkDir = ($sdkLine -replace '^sdk\.dir=', '').Replace('\\', '\')
        }
    }
    if ([string]::IsNullOrWhiteSpace($sdkDir)) {
        throw "Android SDK not found. Set ANDROID_SDK_ROOT or sdk.dir in mobile/android/local.properties"
    }

    $ndkRoot = Join-Path $sdkDir "ndk"
    $ndkDir = Get-ChildItem -Path $ndkRoot -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        Select-Object -First 1
    if ($null -eq $ndkDir) {
        throw "Android NDK not found under $ndkRoot"
    }
    $env:ANDROID_NDK_HOME = $ndkDir.FullName
}

New-Item -ItemType Directory -Force -Path $JniLibsDir | Out-Null
Ensure-AndroidNdkHome
Ensure-CargoNdk
Ensure-RustTargets

$cargoNdkArgs = @()
foreach ($target in $Targets) {
    $cargoNdkArgs += @("-t", $target)
}
$cargoNdkArgs += @(
    "-o", $JniLibsDir,
    "build",
    "--features", "flutter"
)
$cargoNdkArgs += $ProfileArgs

Invoke-External "cargo" (@("ndk") + $cargoNdkArgs) $CoreDir

$missing = @()
foreach ($target in $Targets) {
    $libraryPath = Join-Path $JniLibsDir "$target\libmulti_platform_core.so"
    if (-not (Test-Path $libraryPath)) {
        $missing += $libraryPath
    }
}

if ($missing.Count -gt 0) {
    throw "Rust Android build completed but libraries are missing: $($missing -join ', ')"
}

Write-Host "Built Rust Android libraries into $JniLibsDir" -ForegroundColor Green
