[CmdletBinding()]
param(
    [string]$Device = "",
    [switch]$SkipFrb,
    [switch]$NoInstallFrb,
    [switch]$SkipAnalyze,
    [switch]$SkipRun,
    [switch]$NoResident
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$MobileDir = Join-Path $RepoRoot "mobile"
$CoreDir = Join-Path $RepoRoot "multi_platform_core"
$BridgeDir = Join-Path $MobileDir "lib\bridge"
$BridgeOutput = Join-Path $BridgeDir "frb_generated.dart"
$BuildRustAndroidScript = Join-Path $PSScriptRoot "build-mobile-rust-android.ps1"

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

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )

    Write-Host ""
    Write-Host "==> $Title" -ForegroundColor Cyan
    & $Action
}

function Invoke-FlutterRun {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory
    )

    Write-Host ""
    if ($Arguments -contains "--no-resident") {
        Write-Host "Flutter will launch the app and return immediately because -NoResident was set." -ForegroundColor Yellow
    }
    else {
        Write-Host "Flutter is entering resident mode. Press q in this terminal to stop the app logs cleanly." -ForegroundColor Yellow
        Write-Host "Useful keys: r = hot reload, R = hot restart, h = help, q = quit." -ForegroundColor DarkGray
        Write-Host "Ctrl+C also stops it, but pnpm may render that interrupt as 4294967295." -ForegroundColor DarkGray
    }

    Push-Location $WorkingDirectory
    try {
        & flutter @Arguments
        $exitCodeText = "$LASTEXITCODE"
        if ($exitCodeText -in @("0", "-1", "4294967295")) {
            if ($exitCodeText -ne "0") {
                Write-Host "Flutter run was interrupted/stopped by the developer; treating exit code $exitCodeText as a normal stop." -ForegroundColor Yellow
            }
            return
        }

        throw "flutter $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
    finally {
        Pop-Location
    }
}

function Ensure-FrbCodegen {
    $command = Get-Command flutter_rust_bridge_codegen -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return
    }

    if ($NoInstallFrb) {
        throw "flutter_rust_bridge_codegen not found. Install it with: cargo install flutter_rust_bridge_codegen --version 2.12.0"
    }

    Invoke-Step "Installing flutter_rust_bridge_codegen 2.12.0" {
        Invoke-External "cargo" @("install", "flutter_rust_bridge_codegen", "--version", "2.12.0") $RepoRoot
    }
}

function Generate-FrbBindings {
    $resolvedMobile = Resolve-Path $MobileDir
    if (Test-Path $BridgeDir) {
        $resolvedBridge = Resolve-Path $BridgeDir
        if (-not $resolvedBridge.Path.StartsWith($resolvedMobile.Path)) {
            throw "Refusing to clean bridge directory outside mobile project: $($resolvedBridge.Path)"
        }
        Remove-Item -LiteralPath $resolvedBridge.Path -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $BridgeDir | Out-Null

    Push-Location $CoreDir
    try {
        & flutter_rust_bridge_codegen @(
            "generate",
            "--rust-root", ".",
            "--rust-input", "crate::bindings::mobile_api",
            "--rust-features", "flutter",
            "--dart-output", "../mobile/lib/bridge",
            "--no-web"
        )
        if ($LASTEXITCODE -ne 0) {
            throw "flutter_rust_bridge_codegen failed. Check the Rust binding signatures in multi_platform_core/src/bindings/flutter.rs"
        }
    }
    finally {
        Pop-Location
    }

    if (-not (Test-Path $BridgeOutput)) {
        throw "FRB completed without creating $BridgeOutput"
    }
}

Invoke-Step "Flutter pub get" {
    Invoke-External "flutter" @("pub", "get") $MobileDir
}

if (-not $SkipFrb) {
    Invoke-Step "Flutter Rust Bridge codegen" {
        Ensure-FrbCodegen
        Generate-FrbBindings
    }
}
else {
    Write-Host "Skipping FRB codegen. The app will use the current Dart fallback bridge." -ForegroundColor Yellow
}

if (-not $SkipAnalyze) {
    Invoke-Step "Flutter analyze" {
        Invoke-External "flutter" @("analyze") $MobileDir
    }
}

if ($SkipRun) {
    Invoke-Step "Build Rust Android libraries" {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $BuildRustAndroidScript
        if ($LASTEXITCODE -ne 0) {
            throw "Rust Android library build failed with exit code $LASTEXITCODE"
        }
    }
}
else {
    Write-Host ""
    Write-Host "Skipping the standalone Rust Android build; Gradle preBuild will build and package the native library." -ForegroundColor DarkGray
}

if (-not $SkipRun) {
    Invoke-Step "Flutter run Android" {
        $arguments = @("run")
        if ($Device.Trim().Length -gt 0) {
            $arguments += @("-d", $Device.Trim())
        }
        if ($NoResident) {
            $arguments += @("--no-resident")
        }
        Invoke-FlutterRun $arguments $MobileDir
    }
}
else {
    Write-Host "SkipRun was set; development preparation finished." -ForegroundColor Green
}
