Add-Type -AssemblyName System.Drawing

$sourcePath = 'C:\Users\Administrator\.codex\generated_images\019fc6ee-b474-70a3-8e0b-0d75d04ebd9d\exec-b3b3d91e-0305-4384-96b6-ec80271af99f.png'
$implementationPath = Join-Path $PSScriptRoot 'implementation-desktop-final.png'
$outputDir = $PSScriptRoot

function New-Canvas([int]$width, [int]$height) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::FromArgb(244, 240, 232))
  return @($bitmap, $graphics)
}

function Add-Label($graphics, [string]$text, [int]$x) {
  $font = New-Object System.Drawing.Font('Arial', 13, [System.Drawing.FontStyle]::Regular)
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(51, 44, 37))
  $graphics.DrawString($text, $font, $brush, $x, 7)
  $font.Dispose()
  $brush.Dispose()
}

$source = [System.Drawing.Image]::FromFile($sourcePath)
$implementation = [System.Drawing.Image]::FromFile($implementationPath)

$full = New-Canvas 2880 1056
$fullBitmap = $full[0]
$fullGraphics = $full[1]
Add-Label $fullGraphics 'SOURCE VISUAL' 16
Add-Label $fullGraphics 'IMPLEMENTATION' 1456
$fullGraphics.DrawImage($source, (New-Object System.Drawing.Rectangle(0, 32, 1440, 1024)))
$fullGraphics.DrawImage($implementation, (New-Object System.Drawing.Rectangle(1440, 32, 1440, 1024)))
$fullBitmap.Save((Join-Path $outputDir 'comparison-home-final.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$fullGraphics.Dispose()
$fullBitmap.Dispose()

$sourceNormalized = New-Object System.Drawing.Bitmap(1440, 1024)
$sourceGraphics = [System.Drawing.Graphics]::FromImage($sourceNormalized)
$sourceGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$sourceGraphics.DrawImage($source, (New-Object System.Drawing.Rectangle(0, 0, 1440, 1024)))
$sourceGraphics.Dispose()

$header = New-Canvas 2880 252
$headerBitmap = $header[0]
$headerGraphics = $header[1]
Add-Label $headerGraphics 'SOURCE HEADER' 16
Add-Label $headerGraphics 'IMPLEMENTATION HEADER' 1456
$headerGraphics.DrawImage($sourceNormalized, (New-Object System.Drawing.Rectangle(0, 32, 1440, 220)), (New-Object System.Drawing.Rectangle(0, 0, 1440, 220)), [System.Drawing.GraphicsUnit]::Pixel)
$headerGraphics.DrawImage($implementation, (New-Object System.Drawing.Rectangle(1440, 32, 1440, 220)), (New-Object System.Drawing.Rectangle(0, 0, 1440, 220)), [System.Drawing.GraphicsUnit]::Pixel)
$headerBitmap.Save((Join-Path $outputDir 'comparison-header-final.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$headerGraphics.Dispose()
$headerBitmap.Dispose()

$copy = New-Canvas 2880 332
$copyBitmap = $copy[0]
$copyGraphics = $copy[1]
Add-Label $copyGraphics 'SOURCE HERO COPY' 16
Add-Label $copyGraphics 'IMPLEMENTATION HERO COPY' 1456
$copyGraphics.DrawImage($sourceNormalized, (New-Object System.Drawing.Rectangle(0, 32, 1440, 300)), (New-Object System.Drawing.Rectangle(0, 470, 1440, 300)), [System.Drawing.GraphicsUnit]::Pixel)
$copyGraphics.DrawImage($implementation, (New-Object System.Drawing.Rectangle(1440, 32, 1440, 300)), (New-Object System.Drawing.Rectangle(0, 710, 1440, 300)), [System.Drawing.GraphicsUnit]::Pixel)
$copyBitmap.Save((Join-Path $outputDir 'comparison-hero-copy-final.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$copyGraphics.Dispose()
$copyBitmap.Dispose()

$sourceNormalized.Dispose()
$source.Dispose()
$implementation.Dispose()
