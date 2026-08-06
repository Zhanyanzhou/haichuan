Add-Type -AssemblyName System.Drawing

$pairs = @(
  @{ Name = 'comparison-homepage-rework'; Left = (Join-Path $PSScriptRoot 'reference-vca-home-2026-08-03.png'); Right = (Join-Path $PSScriptRoot 'implemented-2026-08-03\home-1440x900-final.png'); LeftLabel = 'LUXURY REFERENCE'; RightLabel = 'HAICHUAN IMPLEMENTATION' },
  @{ Name = 'comparison-drawer-rework'; Left = (Join-Path $PSScriptRoot 'reference-vca-menu-2026-08-03.png'); Right = (Join-Path $PSScriptRoot 'implemented-2026-08-03\drawer-1440x900-final.png'); LeftLabel = 'LUXURY MENU REFERENCE'; RightLabel = 'HAICHUAN DRAWER' }
)

foreach ($pair in $pairs) {
  $left = [System.Drawing.Image]::FromFile($pair.Left)
  $right = [System.Drawing.Image]::FromFile($pair.Right)
  $canvas = New-Object System.Drawing.Bitmap(2880, 932)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.Clear([System.Drawing.Color]::White)
  $font = New-Object System.Drawing.Font('Arial', 13, [System.Drawing.FontStyle]::Regular)
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(44, 40, 36))
  $graphics.DrawString($pair.LeftLabel, $font, $brush, 16, 7)
  $graphics.DrawString($pair.RightLabel, $font, $brush, 1456, 7)
  $graphics.DrawImage($left, (New-Object System.Drawing.Rectangle(0, 32, 1440, 900)))
  $graphics.DrawImage($right, (New-Object System.Drawing.Rectangle(1440, 32, 1440, 900)))
  $canvas.Save((Join-Path $PSScriptRoot ($pair.Name + '.png')), [System.Drawing.Imaging.ImageFormat]::Png)
  $brush.Dispose()
  $font.Dispose()
  $graphics.Dispose()
  $canvas.Dispose()
  $left.Dispose()
  $right.Dispose()
}
