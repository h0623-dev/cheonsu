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

function New-Color {
  param([int]$A, [int]$R, [int]$G, [int]$B)
  return [System.Drawing.Color]::FromArgb($A, $R, $G, $B)
}

function Get-StageThemeName {
  param([int]$StageId)

  $themes = @(
    "frontier", "canyon", "fortress", "burning", "fortress", "frozen",
    "shadow", "marsh", "fortress", "shadow", "canyon", "marsh",
    "fortress", "shadow", "burning", "fortress", "frozen", "marsh",
    "shadow", "final", "fortress", "marsh", "shadow", "final",
    "final", "burning", "frozen", "shadow", "fortress", "final"
  )

  return $themes[[Math]::Max(0, [Math]::Min($themes.Length - 1, $StageId - 1))]
}

function Get-Theme {
  param([int]$StageId)

  switch (Get-StageThemeName $StageId) {
    "frontier" {
      return @{
        Name = "frontier"; Tint = (New-Color 24 64 96 48); Glow = (New-Color 74 232 182 86);
        Dirt = (New-Color 116 158 110 58); Dark = (New-Color 72 16 30 20); Accent = (New-Color 92 92 150 72);
      }
    }
    "canyon" {
      return @{
        Name = "canyon"; Tint = (New-Color 72 126 82 42); Glow = (New-Color 92 238 166 82);
        Dirt = (New-Color 132 176 112 58); Dark = (New-Color 92 64 38 24); Accent = (New-Color 90 178 132 74);
      }
    }
    "fortress" {
      return @{
        Name = "fortress"; Tint = (New-Color 64 72 68 58); Glow = (New-Color 82 230 174 90);
        Dirt = (New-Color 92 142 112 78); Dark = (New-Color 82 22 24 24); Accent = (New-Color 105 150 142 122);
      }
    }
    "burning" {
      return @{
        Name = "burning"; Tint = (New-Color 92 126 36 22); Glow = (New-Color 132 255 104 38);
        Dirt = (New-Color 126 168 78 42); Dark = (New-Color 104 38 18 12); Accent = (New-Color 128 238 82 28);
      }
    }
    "frozen" {
      return @{
        Name = "frozen"; Tint = (New-Color 94 72 112 148); Glow = (New-Color 118 176 235 255);
        Dirt = (New-Color 86 128 138 138); Dark = (New-Color 74 14 28 38); Accent = (New-Color 116 168 225 240);
      }
    }
    "marsh" {
      return @{
        Name = "marsh"; Tint = (New-Color 82 26 80 48); Glow = (New-Color 86 106 190 130);
        Dirt = (New-Color 102 112 100 54); Dark = (New-Color 82 10 36 24); Accent = (New-Color 116 58 148 112);
      }
    }
    "shadow" {
      return @{
        Name = "shadow"; Tint = (New-Color 92 38 24 70); Glow = (New-Color 108 160 80 255);
        Dirt = (New-Color 74 92 62 68); Dark = (New-Color 116 8 8 18); Accent = (New-Color 132 132 66 220);
      }
    }
    default {
      return @{
        Name = "final"; Tint = (New-Color 106 72 18 36); Glow = (New-Color 140 242 62 48);
        Dirt = (New-Color 82 112 62 48); Dark = (New-Color 132 16 6 12); Accent = (New-Color 132 178 48 126);
      }
    }
  }
}

function New-Point {
  param([double]$X, [double]$Y, [int]$Width, [int]$Height)
  return [System.Drawing.PointF]::new([float]($X * $Width), [float]($Y * $Height))
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

function Draw-Curve {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.PointF[]]$Points,
    [System.Drawing.Color]$Color,
    [float]$Width,
    [float]$Tension = 0.42
  )

  if ($Points.Length -lt 2) { return }

  $shadowWidth = [Math]::Max(3, $Width * 0.20)
  $shadow = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb([Math]::Min(24, [int]($Color.A * 0.22)), 20, 13, 8), $Width + $shadowWidth)
  $shadow.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $shadow.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $shadow.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $Graphics.DrawCurve($shadow, $Points, $Tension)
  $shadow.Dispose()

  $pen = [System.Drawing.Pen]::new($Color, $Width)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $Graphics.DrawCurve($pen, $Points, $Tension)
  $pen.Dispose()

  $highlight = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb([Math]::Min(12, [int]($Color.A * 0.12)), 248, 216, 146), [Math]::Max(1.2, $Width * 0.035))
  $highlight.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $highlight.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $Graphics.DrawCurve($highlight, $Points, $Tension)
  $highlight.Dispose()
}

function Draw-NormalizedCurve {
  param(
    [System.Drawing.Graphics]$Graphics,
    [object[]]$Coords,
    [int]$Width,
    [int]$Height,
    [System.Drawing.Color]$Color,
    [float]$Stroke
  )

  $points = foreach ($coord in $Coords) {
    New-Point $coord[0] $coord[1] $Width $Height
  }

  Draw-Curve $Graphics ([System.Drawing.PointF[]]$points) $Color $Stroke
}

function Fill-Polygon {
  param(
    [System.Drawing.Graphics]$Graphics,
    [object[]]$Coords,
    [int]$Width,
    [int]$Height,
    [System.Drawing.Color]$Color
  )

  $points = foreach ($coord in $Coords) {
    New-Point $coord[0] $coord[1] $Width $Height
  }

  $brush = [System.Drawing.SolidBrush]::new($Color)
  $Graphics.FillPolygon($brush, [System.Drawing.PointF[]]$points)
  $brush.Dispose()
}

function Fill-Rect {
  param(
    [System.Drawing.Graphics]$Graphics,
    [double]$X,
    [double]$Y,
    [double]$W,
    [double]$H,
    [int]$Width,
    [int]$Height,
    [System.Drawing.Color]$Color
  )

  $brush = [System.Drawing.SolidBrush]::new($Color)
  $Graphics.FillRectangle($brush, [float]($X * $Width), [float]($Y * $Height), [float]($W * $Width), [float]($H * $Height))
  $brush.Dispose()
}

function Draw-StoneField {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Random]$Rng,
    [int]$Width,
    [int]$Height,
    [double]$X,
    [double]$Y,
    [double]$W,
    [double]$H,
    [System.Drawing.Color]$Accent
  )

  Fill-Rect $Graphics $X $Y $W $H $Width $Height (New-Color 74 48 45 40)
  $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(62, $Accent.R, $Accent.G, $Accent.B), 2)
  $cols = 7 + ($Rng.Next(0, 3))
  $rows = 8 + ($Rng.Next(0, 4))
  for ($i = 1; $i -lt $cols; $i++) {
    $px = ($X + $W * $i / $cols) * $Width
    $Graphics.DrawLine($pen, [float]$px, [float]($Y * $Height), [float]($px + $Rng.Next(-9, 9)), [float](($Y + $H) * $Height))
  }
  for ($i = 1; $i -lt $rows; $i++) {
    $py = ($Y + $H * $i / $rows) * $Height
    $Graphics.DrawLine($pen, [float]($X * $Width), [float]$py, [float](($X + $W) * $Width), [float]($py + $Rng.Next(-7, 7)))
  }
  $pen.Dispose()
}

function Draw-Particles {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Random]$Rng,
    [int]$Width,
    [int]$Height,
    [System.Drawing.Color]$Color,
    [int]$Count,
    [double]$MinY = 0.0,
    [double]$MaxY = 1.0
  )

  $brush = [System.Drawing.SolidBrush]::new($Color)
  for ($i = 0; $i -lt $Count; $i++) {
    $x = $Rng.NextDouble() * $Width
    $y = ($MinY + $Rng.NextDouble() * ($MaxY - $MinY)) * $Height
    $s = 2 + $Rng.NextDouble() * 5
    $Graphics.FillEllipse($brush, [float]$x, [float]$y, [float]$s, [float]$s)
  }
  $brush.Dispose()
}

function Draw-PathNetwork {
  param(
    [System.Drawing.Graphics]$Graphics,
    [int]$StageId,
    [hashtable]$Theme,
    [int]$Width,
    [int]$Height
  )

  $variant = ($StageId - 1) % 6
  $stroke = [Math]::Max(15, $Width * 0.026)
  switch ($variant) {
    0 {
      Draw-NormalizedCurve $Graphics @(@(0.18, 1.08), @(0.30, 0.76), @(0.48, 0.52), @(0.62, 0.22), @(0.78, -0.05)) $Width $Height $Theme.Dirt $stroke
    }
    1 {
      Draw-NormalizedCurve $Graphics @(@(0.05, 0.92), @(0.24, 0.76), @(0.42, 0.55), @(0.62, 0.38), @(0.92, 0.22)) $Width $Height $Theme.Dirt ($stroke * 0.92)
      Draw-NormalizedCurve $Graphics @(@(0.36, 0.58), @(0.28, 0.42), @(0.22, 0.25), @(0.16, 0.02)) $Width $Height $Theme.Dirt ($stroke * 0.58)
    }
    2 {
      Draw-NormalizedCurve $Graphics @(@(0.48, 1.08), @(0.42, 0.82), @(0.50, 0.55), @(0.64, 0.32), @(0.83, 0.10)) $Width $Height $Theme.Dirt ($stroke * 0.85)
      Draw-NormalizedCurve $Graphics @(@(0.14, 0.66), @(0.36, 0.58), @(0.62, 0.50), @(1.03, 0.46)) $Width $Height $Theme.Dirt ($stroke * 0.58)
    }
    3 {
      Draw-NormalizedCurve $Graphics @(@(0.03, 0.82), @(0.25, 0.70), @(0.52, 0.62), @(0.72, 0.44), @(0.98, 0.32)) $Width $Height $Theme.Dirt ($stroke * 0.72)
      Draw-NormalizedCurve $Graphics @(@(0.52, 1.08), @(0.48, 0.78), @(0.45, 0.50), @(0.41, 0.22), @(0.38, -0.04)) $Width $Height $Theme.Dirt ($stroke * 0.55)
    }
    4 {
      Draw-NormalizedCurve $Graphics @(@(0.10, 0.52), @(0.30, 0.48), @(0.52, 0.48), @(0.74, 0.52), @(1.04, 0.46)) $Width $Height $Theme.Dirt ($stroke * 0.72)
      Draw-NormalizedCurve $Graphics @(@(0.42, 1.08), @(0.46, 0.76), @(0.50, 0.48), @(0.56, 0.18), @(0.61, -0.05)) $Width $Height $Theme.Dirt ($stroke * 0.72)
    }
    default {
      Draw-NormalizedCurve $Graphics @(@(0.72, 1.08), @(0.58, 0.80), @(0.46, 0.58), @(0.36, 0.36), @(0.22, 0.02)) $Width $Height $Theme.Dirt ($stroke * 0.82)
      Draw-NormalizedCurve $Graphics @(@(0.05, 0.74), @(0.24, 0.65), @(0.46, 0.58), @(0.68, 0.60), @(0.96, 0.70)) $Width $Height $Theme.Dirt ($stroke * 0.48)
    }
  }
}

function Draw-ThemeOverlay {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Random]$Rng,
    [int]$StageId,
    [hashtable]$Theme,
    [int]$Width,
    [int]$Height
  )

  switch ($Theme.Name) {
    "canyon" {
      Fill-Polygon $Graphics @(@(-0.08, -0.05), @(0.22, 0.00), @(0.15, 1.08), @(-0.10, 1.05)) $Width $Height (New-Color 44 82 52 30)
      Fill-Polygon $Graphics @(@(0.88, -0.05), @(1.08, 0.00), @(1.05, 1.08), @(0.78, 1.05)) $Width $Height (New-Color 42 72 48 30)
      Draw-Particles $Graphics $Rng $Width $Height (New-Color 48 238 190 110) 64 0.08 0.88
    }
    "fortress" {
      Draw-StoneField $Graphics $Rng $Width $Height 0.58 0.02 0.42 0.34 $Theme.Accent
      Draw-StoneField $Graphics $Rng $Width $Height 0.02 0.58 0.26 0.20 $Theme.Accent
      Fill-Rect $Graphics 0.64 0.00 0.34 0.075 $Width $Height (New-Color 96 24 22 20)
      Fill-Rect $Graphics 0.89 0.02 0.08 0.40 $Width $Height (New-Color 78 28 25 22)
    }
    "burning" {
      Fill-Polygon $Graphics @(@(0.00, 0.00), @(1.02, 0.00), @(0.95, 0.25), @(0.18, 0.36)) $Width $Height (New-Color 58 86 18 10)
      Fill-Polygon $Graphics @(@(0.72, 0.18), @(1.05, 0.32), @(1.03, 0.78), @(0.58, 0.62)) $Width $Height (New-Color 70 68 16 10)
      Fill-Radial $Graphics ($Width * 0.76) ($Height * 0.22) ($Width * 0.24) (New-Color 132 255 86 28)
      Fill-Radial $Graphics ($Width * 0.28) ($Height * 0.56) ($Width * 0.16) (New-Color 96 246 78 26)
      Draw-Particles $Graphics $Rng $Width $Height (New-Color 132 255 144 42) 105 0.04 0.96
    }
    "frozen" {
      Draw-NormalizedCurve $Graphics @(@(-0.02, 0.18), @(0.20, 0.31), @(0.43, 0.48), @(0.62, 0.66), @(0.92, 1.06)) $Width $Height (New-Color 54 138 204 228) ([Math]::Max(34, $Width * 0.055))
      Draw-NormalizedCurve $Graphics @(@(-0.01, 0.16), @(0.22, 0.30), @(0.45, 0.48), @(0.64, 0.65), @(0.94, 1.05)) $Width $Height (New-Color 46 216 242 255) ([Math]::Max(14, $Width * 0.025))
      Draw-Particles $Graphics $Rng $Width $Height (New-Color 78 242 252 255) 88 0.0 1.0
    }
    "marsh" {
      Draw-NormalizedCurve $Graphics @(@(-0.08, 0.76), @(0.20, 0.66), @(0.42, 0.74), @(0.66, 0.58), @(1.08, 0.62)) $Width $Height (New-Color 58 44 130 94) ([Math]::Max(42, $Width * 0.065))
      Draw-NormalizedCurve $Graphics @(@(0.72, -0.05), @(0.64, 0.25), @(0.70, 0.50), @(0.58, 0.80), @(0.52, 1.06)) $Width $Height (New-Color 48 54 150 106) ([Math]::Max(30, $Width * 0.05))
      Draw-Particles $Graphics $Rng $Width $Height (New-Color 52 170 228 154) 90 0.05 0.95
    }
    "shadow" {
      Fill-Radial $Graphics ($Width * 0.54) ($Height * 0.35) ($Width * 0.36) (New-Color 122 84 32 166)
      Fill-Radial $Graphics ($Width * 0.78) ($Height * 0.18) ($Width * 0.22) (New-Color 116 154 50 230)
      Draw-NormalizedCurve $Graphics @(@(0.02, 0.42), @(0.28, 0.38), @(0.52, 0.44), @(0.74, 0.36), @(1.04, 0.30)) $Width $Height (New-Color 46 76 30 132) ([Math]::Max(30, $Width * 0.047))
      Draw-Particles $Graphics $Rng $Width $Height (New-Color 96 160 74 255) 78 0.08 0.72
    }
    "final" {
      Fill-Polygon $Graphics @(@(0.58, -0.04), @(1.06, -0.02), @(1.02, 0.46), @(0.72, 0.38)) $Width $Height (New-Color 94 38 10 18)
      Fill-Radial $Graphics ($Width * 0.74) ($Height * 0.22) ($Width * 0.34) (New-Color 148 230 42 44)
      Fill-Radial $Graphics ($Width * 0.48) ($Height * 0.52) ($Width * 0.28) (New-Color 96 130 54 210)
      Draw-NormalizedCurve $Graphics @(@(0.48, 1.04), @(0.50, 0.76), @(0.52, 0.50), @(0.54, 0.22), @(0.58, -0.04)) $Width $Height (New-Color 50 78 24 62) ([Math]::Max(38, $Width * 0.058))
      Draw-Particles $Graphics $Rng $Width $Height (New-Color 120 255 82 62) 118 0.0 0.95
    }
    default {
      Fill-Polygon $Graphics @(@(-0.05, 0.00), @(0.22, 0.00), @(0.12, 1.05), @(-0.08, 1.04)) $Width $Height (New-Color 52 10 42 22)
      Fill-Polygon $Graphics @(@(0.82, 0.00), @(1.05, 0.00), @(1.05, 1.04), @(0.90, 1.04)) $Width $Height (New-Color 50 12 48 26)
      Draw-Particles $Graphics $Rng $Width $Height (New-Color 44 170 222 104) 56 0.0 1.0
    }
  }
}

function Draw-StageVariant {
  param(
    [int]$StageId,
    [System.Drawing.Image]$Source
  )

  $theme = Get-Theme $StageId
  $rng = New-Rng (8111 + $StageId * 503)
  $w = $Source.Width
  $h = $Source.Height
  $bmp = [System.Drawing.Bitmap]::new($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

  $cropW = [int]($w * (0.72 + (($StageId % 5) * 0.035)))
  $cropH = [int]($h * (0.72 + (($StageId % 4) * 0.045)))
  $maxX = [Math]::Max(0, $w - $cropW)
  $maxY = [Math]::Max(0, $h - $cropH)
  $focus = ($StageId - 1) % 7
  $srcX = switch ($focus) {
    0 { 0 }
    1 { [int]($maxX * 0.35) }
    2 { $maxX }
    3 { [int]($maxX * 0.65) }
    4 { [int]($maxX * 0.12) }
    5 { [int]($rng.NextDouble() * $maxX) }
    default { [int]($maxX * 0.5) }
  }
  $srcY = switch ($focus) {
    0 { 0 }
    1 { [int]($maxY * 0.22) }
    2 { [int]($maxY * 0.48) }
    3 { $maxY }
    4 { [int]($maxY * 0.68) }
    5 { [int]($rng.NextDouble() * $maxY) }
    default { [int]($maxY * 0.5) }
  }
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

  Draw-ThemeOverlay $g $rng $StageId $theme $w $h

  Fill-Radial $g ($w * (0.20 + ($rng.NextDouble() * 0.58))) ($h * (0.08 + ($rng.NextDouble() * 0.36))) ($w * (0.22 + $rng.NextDouble() * 0.22)) $theme.Glow

  $shade = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.Rectangle]::new(0, 0, $w, $h),
    [System.Drawing.Color]::FromArgb(0, 0, 0, 0),
    [System.Drawing.Color]::FromArgb(76, 0, 0, 0),
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
  )
  $g.FillRectangle($shade, 0, 0, $w, $h)
  $shade.Dispose()

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
