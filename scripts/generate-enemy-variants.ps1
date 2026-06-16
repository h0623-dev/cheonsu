Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot

function Clamp-Byte([double]$value) {
  return [Math]::Max(0, [Math]::Min(255, [int][Math]::Round($value)))
}

function New-TintedSprite {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][System.Drawing.Color]$Tint,
    [double]$Strength = 0.22,
    [double]$Brightness = 1.0
  )

  $source = [System.Drawing.Bitmap]::new($SourcePath)
  $target = [System.Drawing.Bitmap]::new($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

  try {
    for ($y = 0; $y -lt $source.Height; $y += 1) {
      for ($x = 0; $x -lt $source.Width; $x += 1) {
        $pixel = $source.GetPixel($x, $y)

        if ($pixel.A -eq 0) {
          $target.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
          continue
        }

        $r = Clamp-Byte (($pixel.R * (1 - $Strength) + $Tint.R * $Strength) * $Brightness)
        $g = Clamp-Byte (($pixel.G * (1 - $Strength) + $Tint.G * $Strength) * $Brightness)
        $b = Clamp-Byte (($pixel.B * (1 - $Strength) + $Tint.B * $Strength) * $Brightness)
        $target.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($pixel.A, $r, $g, $b))
      }
    }

    $outDir = Split-Path -Parent $OutputPath
    if (-not (Test-Path $outDir)) {
      New-Item -ItemType Directory -Path $outDir | Out-Null
    }

    $target.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "wrote $OutputPath"
  }
  finally {
    $source.Dispose()
    $target.Dispose()
  }
}

$variants = @(
  @{ Key = "raider"; Source = "bandit"; Tint = [System.Drawing.Color]::FromArgb(196, 72, 45); Strength = 0.20; Brightness = 1.05 },
  @{ Key = "marauder"; Source = "bandit"; Tint = [System.Drawing.Color]::FromArgb(210, 146, 52); Strength = 0.24; Brightness = 1.04 },
  @{ Key = "assassin_elite"; Source = "bandit"; Tint = [System.Drawing.Color]::FromArgb(72, 42, 116); Strength = 0.36; Brightness = 0.82 },
  @{ Key = "sniper"; Source = "archer"; Tint = [System.Drawing.Color]::FromArgb(42, 118, 172); Strength = 0.28; Brightness = 1.02 },
  @{ Key = "ranger"; Source = "archer"; Tint = [System.Drawing.Color]::FromArgb(116, 146, 54); Strength = 0.22; Brightness = 1.08 },
  @{ Key = "pyromancer"; Source = "mage"; Tint = [System.Drawing.Color]::FromArgb(225, 76, 26); Strength = 0.28; Brightness = 1.08 },
  @{ Key = "frost_mage"; Source = "mage"; Tint = [System.Drawing.Color]::FromArgb(86, 174, 230); Strength = 0.35; Brightness = 1.08 },
  @{ Key = "cultist"; Source = "mage"; Tint = [System.Drawing.Color]::FromArgb(118, 54, 174); Strength = 0.34; Brightness = 0.92 },
  @{ Key = "sentinel"; Source = "shield"; Tint = [System.Drawing.Color]::FromArgb(76, 122, 176); Strength = 0.22; Brightness = 1.05 },
  @{ Key = "blackguard"; Source = "shield"; Tint = [System.Drawing.Color]::FromArgb(95, 30, 36); Strength = 0.36; Brightness = 0.86 },
  @{ Key = "warlord"; Source = "boss_knight"; Tint = [System.Drawing.Color]::FromArgb(205, 142, 48); Strength = 0.24; Brightness = 1.08 },
  @{ Key = "void_knight"; Source = "boss_knight"; Tint = [System.Drawing.Color]::FromArgb(104, 48, 160); Strength = 0.36; Brightness = 0.88 }
)

$folders = @("map_units", "enemies", "sd_units")

foreach ($folder in $folders) {
  foreach ($variant in $variants) {
    $sourcePath = Join-Path $root "public\sprites\$folder\$($variant.Source).png"
    if (-not (Test-Path $sourcePath)) {
      continue
    }

    $outPath = Join-Path $root "public\sprites\$folder\$($variant.Key).png"
    New-TintedSprite `
      -SourcePath $sourcePath `
      -OutputPath $outPath `
      -Tint $variant.Tint `
      -Strength $variant.Strength `
      -Brightness $variant.Brightness
  }
}
