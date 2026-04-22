Add-Type -AssemblyName System.Drawing

$src    = "d:\LaityHCode\DesktopProjects\GuYanTools\desktop\src\assets\icons\icon_1024.png"
$outDir = "d:\LaityHCode\DesktopProjects\GuYanTools\desktop\src\assets\icons"
$sizes  = @(16, 24, 32, 48, 64, 128, 256, 512)

$orig = [System.Drawing.Image]::FromFile((Resolve-Path $src))

foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($s, $s)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.DrawImage($orig, 0, 0, $s, $s)
    $g.Dispose()
    $out = Join-Path $outDir ("icon_" + $s + ".png")
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated: $out"
}

$orig.Dispose()
Write-Host "All icons generated successfully!"
