Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$root = (Resolve-Path ".").Path
$outDir = Join-Path $root "public\sprites\sd_units"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$units = @(
  @{ Name = "hero"; Source = "public\sprites\units\kyle.png"; Kind = "ally" },
  @{ Name = "bram"; Source = "public\sprites\units\bram.png"; Kind = "ally" },
  @{ Name = "lina"; Source = "public\sprites\units\lina.png"; Kind = "ally" },
  @{ Name = "aria"; Source = "public\sprites\units\aria.png"; Kind = "ally" },
  @{ Name = "leon"; Source = "public\sprites\units\leon.png"; Kind = "ally" },
  @{ Name = "sera"; Source = "public\portraits\sera.png"; Kind = "ally" },
  @{ Name = "archer"; Source = "public\sprites\enemies\archer.png"; Kind = "enemy" },
  @{ Name = "assassin"; Source = "public\sprites\enemies\bandit.png"; Kind = "enemy" },
  @{ Name = "bandit"; Source = "public\sprites\enemies\bandit.png"; Kind = "enemy" },
  @{ Name = "shield"; Source = "public\sprites\enemies\shield.png"; Kind = "enemy" },
  @{ Name = "mage"; Source = "public\sprites\enemies\mage.png"; Kind = "enemy" },
  @{ Name = "boss_knight"; Source = "public\sprites\enemies\boss_knight.png"; Kind = "boss" },
  @{ Name = "boss_mage"; Source = "public\sprites\enemies\boss_mage.png"; Kind = "boss" },
  @{ Name = "garon"; Source = "public\sprites\enemies\garon.png"; Kind = "boss" },
  @{ Name = "wolf"; Source = "public\sprites\enemies\wolf.png"; Kind = "beast" }
)

function Get-AlphaBounds([System.Drawing.Bitmap]$bitmap) {
  $minX = $bitmap.Width
  $minY = $bitmap.Height
  $maxX = -1
  $maxY = -1

  for ($y = 0; $y -lt $bitmap.Height; $y++) {
    for ($x = 0; $x -lt $bitmap.Width; $x++) {
      if ($bitmap.GetPixel($x, $y).A -gt 18) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }

  if ($maxX -lt $minX -or $maxY -lt $minY) {
    return [System.Drawing.Rectangle]::new(0, 0, $bitmap.Width, $bitmap.Height)
  }

  return [System.Drawing.Rectangle]::new($minX, $minY, ($maxX - $minX + 1), ($maxY - $minY + 1))
}

function Get-HeadRect([System.Drawing.Rectangle]$bounds, [string]$kind) {
  $headSizeRatio = if ($kind -eq "boss") { 0.36 } else { 0.40 }
  $headSize = [Math]::Round([Math]::Min($bounds.Width * 0.58, $bounds.Height * $headSizeRatio))
  $headSize = [Math]::Max(70, [Math]::Min($headSize, 190))
  $cx = $bounds.X + ($bounds.Width / 2)
  $headX = [Math]::Round($cx - ($headSize / 2))
  $headY = [Math]::Round($bounds.Y + ($bounds.Height * 0.02))

  return [System.Drawing.Rectangle]::new($headX, $headY, $headSize, $headSize)
}

function Clamp-Rect([System.Drawing.Rectangle]$rect, [System.Drawing.Bitmap]$bitmap) {
  $x = [Math]::Max(0, [Math]::Min($rect.X, $bitmap.Width - 1))
  $y = [Math]::Max(0, [Math]::Min($rect.Y, $bitmap.Height - 1))
  $right = [Math]::Max($x + 1, [Math]::Min($rect.Right, $bitmap.Width))
  $bottom = [Math]::Max($y + 1, [Math]::Min($rect.Bottom, $bitmap.Height))

  return [System.Drawing.Rectangle]::new($x, $y, $right - $x, $bottom - $y)
}

function Draw-SDUnit([string]$sourcePath, [string]$outputPath, [string]$kind) {
  $src = [System.Drawing.Bitmap]::FromFile($sourcePath)

  try {
    $canvasW = if ($kind -eq "boss") { 104 } else { 88 }
    $canvasH = if ($kind -eq "boss") { 116 } else { 98 }
    $canvas = [System.Drawing.Bitmap]::new($canvasW, $canvasH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($canvas)

    try {
      $g.Clear([System.Drawing.Color]::Transparent)
      $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
      $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

      $bounds = Get-AlphaBounds $src
      $headRect = Clamp-Rect (Get-HeadRect $bounds $kind) $src

      if ($kind -eq "beast") {
        $maxW = 68
        $maxH = 62
        $scale = [Math]::Min($maxW / $bounds.Width, $maxH / $bounds.Height)
        $w = [Math]::Round($bounds.Width * $scale)
        $h = [Math]::Round($bounds.Height * $scale)
        $dest = [System.Drawing.Rectangle]::new([Math]::Round(($canvasW - $w) / 2), $canvasH - $h - 10, $w, $h)
        $g.FillEllipse([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(90, 0, 0, 0)), 16, $canvasH - 14, $canvasW - 32, 8)
        $g.DrawImage($src, $dest, $bounds, [System.Drawing.GraphicsUnit]::Pixel)
      } else {
        $bodyMaxW = if ($kind -eq "boss") { 88 } else { 72 }
        $bodyMaxH = if ($kind -eq "boss") { 88 } else { 70 }
        $bodyScale = [Math]::Min($bodyMaxW / $bounds.Width, $bodyMaxH / $bounds.Height)
        $bodyW = [Math]::Round($bounds.Width * $bodyScale)
        $bodyH = [Math]::Round($bounds.Height * $bodyScale * 0.66)
        $bodyX = [Math]::Round(($canvasW - $bodyW) / 2)
        $bodyY = $canvasH - $bodyH - 7
        $bodyDest = [System.Drawing.Rectangle]::new($bodyX, $bodyY, $bodyW, $bodyH)

        $headW = if ($kind -eq "boss") { 54 } else { 48 }
        $headH = if ($kind -eq "boss") { 50 } else { 44 }
        $headX = [Math]::Round(($canvasW - $headW) / 2)
        $headY = if ($kind -eq "boss") { 7 } else { 6 }
        $headDest = [System.Drawing.Rectangle]::new($headX, $headY, $headW, $headH)

        $g.FillEllipse([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(92, 0, 0, 0)), 18, $canvasH - 13, $canvasW - 36, 8)
        $g.DrawImage($src, $bodyDest, $bounds, [System.Drawing.GraphicsUnit]::Pixel)

        $shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(80, 0, 0, 0))
        $g.FillRectangle($shadowBrush, $headDest.X - 1, $headDest.Y + 2, $headDest.Width + 2, $headDest.Height)
        $shadowBrush.Dispose()

        $g.DrawImage($src, $headDest, $headRect, [System.Drawing.GraphicsUnit]::Pixel)
      }

      $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $g.Dispose()
      $canvas.Dispose()
    }
  } finally {
    $src.Dispose()
  }
}

foreach ($unit in $units) {
  $sourcePath = Join-Path $root $unit.Source
  if (!(Test-Path $sourcePath)) {
    throw "Missing sprite source: $sourcePath"
  }

  $outputPath = Join-Path $outDir "$($unit.Name).png"
  Draw-SDUnit $sourcePath $outputPath $unit.Kind
}

Write-Output "Generated $($units.Count) SD unit sprites in $outDir"
