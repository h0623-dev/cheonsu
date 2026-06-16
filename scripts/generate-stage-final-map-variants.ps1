$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $root "public\maps\concept\stage_1_frontier_final.png"
$outDir = Join-Path $root "public\maps\concept"

if (-not (Test-Path $sourcePath)) {
  throw "Missing source map: $sourcePath"
}

function New-Rng {
  param([int]$Seed)
  return [System.Random]::new($Seed)
}

function Get-Theme {
  param([int]$StageId)

  if ($StageId -ge 25) {
    return @{
      Name = "final"; Tint = [System.Drawing.Color]::FromArgb(86, 72, 22, 38); Glow = [System.Drawing.Color]::FromArgb(120, 232, 72, 52); Fog = [System.Drawing.Color]::FromArgb(40, 30, 18, 26)
    }
  }
  if ($StageId -ge 19) {
    return @{
      Name = "shadow"; Tint = [System.Drawing.Color]::FromArgb(76, 34, 28, 66); Glow = [System.Drawing.Color]::FromArgb(100, 166, 88, 255); Fog = [System.Drawing.Color]::FromArgb(54, 22, 18, 32)
    }
  }
  if ($StageId -ge 13) {
    return @{
      Name = "fortress"; Tint = [System.Drawing.Color]::FromArgb(58, 86, 74, 55); Glow = [System.Drawing.Color]::FromArgb(95, 224, 168, 86); Fog = [System.Drawing.Color]::FromArgb(38, 50, 44, 38)
    }
  }
  if ($StageId -ge 7) {
    return @{
      Name = "marsh"; Tint = [System.Drawing.Color]::FromArgb(66, 30, 78, 44); Glow = [System.Drawing.Color]::FromArgb(84, 152, 190, 112); Fog = [System.Drawing.Color]::FromArgb(52, 24, 42, 32)
    }
  }
  if ($StageId -eq 6) {
    return @{
      Name = "frozen"; Tint = [System.Drawing.Color]::FromArgb(80, 74, 112, 142); Glow = [System.Drawing.Color]::FromArgb(112, 168, 238, 255); Fog = [System.Drawing.Color]::FromArgb(80, 202, 232, 245)
    }
  }
  if ($StageId -eq 4) {
    return @{
      Name = "burning"; Tint = [System.Drawing.Color]::FromArgb(86, 120, 38, 24); Glow = [System.Drawing.Color]::FromArgb(130, 255, 114, 38); Fog = [System.Drawing.Color]::FromArgb(44, 65, 26, 18)
    }
  }
  return @{
    Name = "canyon"; Tint = [System.Drawing.Color]::FromArgb(54, 112, 78, 42); Glow = [System.Drawing.Color]::FromArgb(86, 220, 166, 82); Fog = [System.Drawing.Color]::FromArgb(36, 48, 34, 20)
  }
}

function Fill-Radial {
  param(
    [System.Drawing.Graphics]$Graphics,
    [float]$X,
    [float]$Y,
    [float]$Radius,
    [System.Drawing.Color]$Color
  )

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddEllipse($X - $Radius, $Y - $Radius, $Radius * 2, $Radius * 2)
  $brush = [System.Drawing.Drawing2D.PathGradientBrush]::new($path)
  $brush.CenterColor = $Color
  $brush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $Color.R, $Color.G, $Color.B))
  $Graphics.FillPath($brush, $path)
  $brush.Dispose()
  $path.Dispose()
}

function Draw-Rock {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Random]$Rng,
    [float]$X,
    [float]$Y,
    [float]$Scale
  )

  $points = New-Object System.Collections.Generic.List[System.Drawing.PointF]
  for ($i = 0; $i -lt 8; $i++) {
    $a = [Math]::PI * 2 * $i / 8
    $r = $Scale * (0.72 + $Rng.NextDouble() * 0.42)
    $points.Add([System.Drawing.PointF]::new($X + [Math]::Cos($a) * 26 * $r, $Y + [Math]::Sin($a) * 17 * $r))
  }

  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(155, 122, 113, 86))
  $Graphics.FillPolygon($brush, $points.ToArray())
  $brush.Dispose()

  $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(80, 245, 223, 172), [Math]::Max(1, 2 * $Scale))
  $Graphics.DrawArc($pen, $X - 15 * $Scale, $Y - 11 * $Scale, 26 * $Scale, 12 * $Scale, 190, 105)
  $pen.Dispose()
}

function Draw-Tree {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Random]$Rng,
    [float]$X,
    [float]$Y,
    [float]$Scale,
    [System.Drawing.Color]$Color
  )

  $trunkBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(190, 62, 38, 22))
  $Graphics.FillRectangle($trunkBrush, $X - 5 * $Scale, $Y + 18 * $Scale, 10 * $Scale, 30 * $Scale)
  $trunkBrush.Dispose()

  $brushA = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(206, $Color.R, $Color.G, $Color.B))
  $brushB = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(165, 22, 80, 38))
  $Graphics.FillEllipse($brushB, $X - 28 * $Scale, $Y - 5 * $Scale, 58 * $Scale, 52 * $Scale)
  $Graphics.FillEllipse($brushA, $X - 22 * $Scale, $Y - 23 * $Scale, 48 * $Scale, 54 * $Scale)
  $Graphics.FillEllipse($brushA, $X - 38 * $Scale, $Y + 7 * $Scale, 42 * $Scale, 38 * $Scale)
  $brushA.Dispose()
  $brushB.Dispose()
}

function Draw-Banner {
  param(
    [System.Drawing.Graphics]$Graphics,
    [float]$X,
    [float]$Y,
    [System.Drawing.Color]$Accent
  )

  $pole = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(210, 45, 28, 18), 7)
  $Graphics.DrawLine($pole, $X, $Y, $X, $Y + 122)
  $pole.Dispose()

  $points = @(
    [System.Drawing.PointF]::new($X + 6, $Y + 8),
    [System.Drawing.PointF]::new($X + 96, $Y + 36),
    [System.Drawing.PointF]::new($X + 8, $Y + 78)
  )
  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(190, 92, 22, 20))
  $Graphics.FillPolygon($brush, $points)
  $brush.Dispose()

  $trim = [System.Drawing.Pen]::new($Accent, 3)
  $Graphics.DrawPolygon($trim, $points)
  $trim.Dispose()
}

function Draw-Fire {
  param(
    [System.Drawing.Graphics]$Graphics,
    [float]$X,
    [float]$Y,
    [System.Drawing.Color]$Glow
  )

  Fill-Radial $Graphics $X ($Y + 18) 72 $Glow
  $outer = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(188, 238, 92, 34))
  $inner = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(210, 255, 214, 94))
  $Graphics.FillPie($outer, $X - 23, $Y - 8, 48, 80, 220, 280)
  $Graphics.FillPie($inner, $X - 11, $Y + 10, 24, 42, 220, 280)
  $outer.Dispose()
  $inner.Dispose()
}

function Draw-Water {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Random]$Rng,
    [int]$Width,
    [int]$Height,
    [System.Drawing.Color]$Color
  )

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.StartFigure()
  $path.AddBezier(-80, $Height * 0.74, $Width * 0.28, $Height * 0.62, $Width * 0.56, $Height * 0.84, $Width + 90, $Height * 0.69)
  $path.AddLine($Width + 90, $Height + 90)
  $path.AddLine(-80, $Height + 90)
  $path.CloseFigure()

  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(92, $Color.R, $Color.G, $Color.B))
  $Graphics.FillPath($brush, $path)
  $brush.Dispose()

  $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(92, 198, 232, 220), 3)
  for ($i = 0; $i -lt 12; $i++) {
    $y = $Height * (0.73 + $Rng.NextDouble() * 0.22)
    $Graphics.DrawBezier($pen, $Rng.Next(-40, 120), $y, $Width * 0.28, $y - 32, $Width * 0.68, $y + 26, $Width + 50, $y - 18)
  }
  $pen.Dispose()
  $path.Dispose()
}

function Draw-Ruin {
  param(
    [System.Drawing.Graphics]$Graphics,
    [float]$X,
    [float]$Y,
    [float]$Scale
  )

  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(145, 88, 78, 64))
  for ($i = 0; $i -lt 5; $i++) {
    $w = (34 + ($i % 2) * 16) * $Scale
    $h = (28 + ($i % 3) * 10) * $Scale
    $Graphics.FillRectangle($brush, $X + $i * 32 * $Scale, $Y + ($i % 2) * 20 * $Scale, $w, $h)
  }
  $brush.Dispose()
}

function Draw-StageVariant {
  param(
    [int]$StageId,
    [System.Drawing.Image]$Source
  )

  $theme = Get-Theme $StageId
  $rng = New-Rng (6200 + $StageId * 317)
  $w = $Source.Width
  $h = $Source.Height
  $bmp = [System.Drawing.Bitmap]::new($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $cropW = [int]($w * (0.86 + ($rng.NextDouble() * 0.1)))
  $cropH = [int]($h * (0.86 + ($rng.NextDouble() * 0.09)))
  $maxX = [Math]::Max(0, $w - $cropW)
  $maxY = [Math]::Max(0, $h - $cropH)
  $srcX = [int]($rng.NextDouble() * $maxX)
  $srcY = [int]($rng.NextDouble() * $maxY)
  $srcRect = [System.Drawing.Rectangle]::new($srcX, $srcY, $cropW, $cropH)
  $dstRect = [System.Drawing.Rectangle]::new(0, 0, $w, $h)

  if ($StageId % 2 -eq 0) {
    $g.TranslateTransform($w, 0)
    $g.ScaleTransform(-1, 1)
    $g.DrawImage($Source, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $g.ResetTransform()
  } else {
    $g.DrawImage($Source, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  }

  $tintBrush = [System.Drawing.SolidBrush]::new($theme.Tint)
  $g.FillRectangle($tintBrush, 0, 0, $w, $h)
  $tintBrush.Dispose()

  Fill-Radial $g ($w * (0.28 + $rng.NextDouble() * 0.38)) ($h * (0.12 + $rng.NextDouble() * 0.28)) ($w * 0.55) $theme.Glow

  # The source painting already has detailed rocks, walls, foliage, and props.
  # Keep the variants in the same art direction by using framing, tone, and atmosphere instead of flat new icons.

  $g.Dispose()
  return $bmp
}

$source = [System.Drawing.Image]::FromFile($sourcePath)
try {
  for ($stageId = 2; $stageId -le 30; $stageId++) {
    $variant = Draw-StageVariant -StageId $stageId -Source $source
    $outPath = Join-Path $outDir ("stage_{0}_frontier_final.png" -f $stageId)
    $variant.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $variant.Dispose()
    Write-Host "wrote $outPath"
  }
}
finally {
  $source.Dispose()
}
