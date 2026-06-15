$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$unitDir = Join-Path $root "public\sprites\classic\units"
$mapDir = Join-Path $root "public\maps\classic"
New-Item -ItemType Directory -Force -Path $unitDir, $mapDir | Out-Null

function New-Color([string]$hex, [int]$alpha = 255) {
  $value = $hex.TrimStart("#")
  return [System.Drawing.Color]::FromArgb(
    $alpha,
    [Convert]::ToInt32($value.Substring(0, 2), 16),
    [Convert]::ToInt32($value.Substring(2, 2), 16),
    [Convert]::ToInt32($value.Substring(4, 2), 16)
  )
}

function Fill-Rect($g, [string]$hex, [int]$x, [int]$y, [int]$w, [int]$h, [int]$alpha = 255) {
  $brush = New-Object System.Drawing.SolidBrush (New-Color $hex $alpha)
  $g.FillRectangle($brush, $x, $y, $w, $h)
  $brush.Dispose()
}

function Fill-Ellipse($g, [string]$hex, [int]$x, [int]$y, [int]$w, [int]$h, [int]$alpha = 255) {
  $brush = New-Object System.Drawing.SolidBrush (New-Color $hex $alpha)
  $g.FillEllipse($brush, $x, $y, $w, $h)
  $brush.Dispose()
}

function Fill-Poly($g, [string]$hex, [array]$points, [int]$alpha = 255) {
  $brush = New-Object System.Drawing.SolidBrush (New-Color $hex $alpha)
  $g.FillPolygon($brush, [System.Drawing.Point[]]$points)
  $brush.Dispose()
}

function Draw-PixelRect($g, [string]$hex, [int]$x, [int]$y, [int]$w, [int]$h, [string]$outline = "#15100b") {
  Fill-Rect $g $outline ($x - 1) ($y - 1) ($w + 2) ($h + 2)
  Fill-Rect $g $hex $x $y $w $h
}

function Save-Bitmap($bmp, [string]$path) {
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

function New-PixelCanvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $g.Clear([System.Drawing.Color]::Transparent)
  return @{ Bitmap = $bmp; Graphics = $g }
}

function Draw-HumanoidUnit(
  [string]$file,
  [string]$body,
  [string]$trim,
  [string]$hair,
  [string]$metal,
  [string]$role,
  [bool]$boss = $false
) {
  $canvas = New-PixelCanvas 32 40
  $g = $canvas.Graphics

  $skin = "#d9a066"
  $outline = "#080705"
  $deep = "#15100b"

  Fill-Ellipse $g "#050403" 5 34 23 5 160

  if ($role -eq "sword" -or $boss) {
    Fill-Poly $g $outline @(
      (New-Object System.Drawing.Point 8,16),
      (New-Object System.Drawing.Point 16,15),
      (New-Object System.Drawing.Point 21,19),
      (New-Object System.Drawing.Point 22,32),
      (New-Object System.Drawing.Point 8,33)
    ) 235
    Fill-Poly $g $trim @(
      (New-Object System.Drawing.Point 9,17),
      (New-Object System.Drawing.Point 16,16),
      (New-Object System.Drawing.Point 20,20),
      (New-Object System.Drawing.Point 20,31),
      (New-Object System.Drawing.Point 9,31)
    ) 210
  }

  Draw-PixelRect $g "#211b16" 10 28 5 7
  Draw-PixelRect $g "#211b16" 18 28 5 7
  Fill-Rect $g "#3a2a1a" 9 35 7 2 225
  Fill-Rect $g "#3a2a1a" 18 35 7 2 225

  Fill-Rect $g $outline 7 16 19 16
  Fill-Rect $g $body 9 17 15 13
  Fill-Rect $g "#ffffff" 10 18 12 1 45
  Fill-Rect $g $deep 9 29 15 2 120
  Fill-Rect $g $trim 10 20 13 2 215
  Fill-Rect $g "#f6d98a" 14 23 5 2 185

  Fill-Rect $g $outline 5 18 6 11
  Fill-Rect $g $body 6 19 5 9
  Fill-Rect $g $outline 23 18 6 11
  Fill-Rect $g $body 23 19 5 9
  Fill-Rect $g $metal 6 18 4 2 150
  Fill-Rect $g $metal 23 18 4 2 150

  if ($role -eq "mage" -or $role -eq "healer") {
    Fill-Poly $g $outline @(
      (New-Object System.Drawing.Point 10,10),
      (New-Object System.Drawing.Point 16,2),
      (New-Object System.Drawing.Point 23,10)
    )
    Fill-Poly $g $body @(
      (New-Object System.Drawing.Point 12,9),
      (New-Object System.Drawing.Point 16,3),
      (New-Object System.Drawing.Point 21,9)
    )
    Fill-Rect $g $trim 11 9 11 2 220
  }

  if ($role -eq "dagger") {
    Fill-Poly $g $outline @(
      (New-Object System.Drawing.Point 9,7),
      (New-Object System.Drawing.Point 16,3),
      (New-Object System.Drawing.Point 24,7),
      (New-Object System.Drawing.Point 22,17),
      (New-Object System.Drawing.Point 11,17)
    )
    Fill-Poly $g $body @(
      (New-Object System.Drawing.Point 11,8),
      (New-Object System.Drawing.Point 16,5),
      (New-Object System.Drawing.Point 22,8),
      (New-Object System.Drawing.Point 20,16),
      (New-Object System.Drawing.Point 12,16)
    )
  } else {
    Draw-PixelRect $g $skin 11 8 11 9
    Fill-Rect $g "#f2c184" 13 9 6 2 140
    Fill-Rect $g "#29180e" 13 13 2 1
    Fill-Rect $g "#29180e" 19 13 2 1
  }

  Draw-PixelRect $g $hair 9 5 15 5
  Fill-Rect $g $trim 10 5 13 2 225
  Fill-Rect $g "#ffffff" 12 6 5 1 80

  if ($role -eq "sword") {
    Fill-Rect $g "#4b2b19" 24 24 6 2
    Fill-Rect $g $outline 26 11 3 17
    Fill-Rect $g $metal 27 10 2 17
    Fill-Rect $g "#fff7d6" 27 10 1 7 210
  } elseif ($role -eq "shield") {
    Fill-Rect $g $outline 3 17 9 14
    Fill-Rect $g $metal 4 18 7 12
    Fill-Rect $g $trim 6 20 3 8
    Fill-Rect $g "#ffffff" 5 19 4 1 80
    Fill-Rect $g "#5b371a" 25 13 2 17
    Fill-Rect $g "#b7833a" 24 15 4 3
  } elseif ($role -eq "mage") {
    Fill-Rect $g "#5b371a" 26 11 2 20
    Fill-Rect $g $outline 23 9 7 7
    Fill-Rect $g $trim 24 10 5 5
    Fill-Rect $g "#fff2aa" 25 11 3 2 220
    Fill-Rect $g $trim 10 27 13 4 190
  } elseif ($role -eq "healer") {
    Fill-Rect $g "#6a4a24" 26 12 2 20
    Fill-Rect $g "#f8f0c0" 23 12 8 2
    Fill-Rect $g "#f8f0c0" 26 8 2 9
    Fill-Rect $g "#6fbfda" 10 26 13 3 180
  } elseif ($role -eq "bow") {
    Fill-Rect $g "#3e2b16" 25 12 2 20
    Fill-Rect $g "#d8c58a" 24 15 1 13
    Fill-Rect $g $trim 6 17 3 12
    Fill-Rect $g "#3f2414" 7 14 2 8 180
    Fill-Rect $g "#f0d090" 8 13 1 10 150
  } elseif ($role -eq "dagger") {
    Draw-PixelRect $g $metal 25 19 2 8
    Draw-PixelRect $g $metal 5 22 2 7
    Fill-Rect $g $trim 10 21 13 2 190
  } elseif ($role -eq "lance") {
    Fill-Rect $g "#5b371a" 26 8 2 23
    Fill-Poly $g $outline @(
      (New-Object System.Drawing.Point 24,6),
      (New-Object System.Drawing.Point 29,10),
      (New-Object System.Drawing.Point 26,13)
    )
    Fill-Poly $g $metal @(
      (New-Object System.Drawing.Point 25,7),
      (New-Object System.Drawing.Point 28,10),
      (New-Object System.Drawing.Point 26,12)
    )
  }

  if ($boss) {
    Fill-Rect $g "#f04430" 6 6 5 3
    Fill-Rect $g "#f04430" 22 6 5 3
    Fill-Rect $g "#ffcf64" 12 3 9 3
    Fill-Rect $g "#fff2aa" 15 2 3 2 210
    Fill-Rect $g "#f04430" 9 23 16 3 220
    Fill-Rect $g "#111111" 8 30 17 2 180
  }

  $g.Dispose()
  Save-Bitmap $canvas.Bitmap (Join-Path $unitDir $file)
}

function Draw-WolfUnit([string]$file) {
  $canvas = New-PixelCanvas 40 48
  $g = $canvas.Graphics
  $outline = "#060403"
  Fill-Ellipse $g "#030201" 5 41 30 5 170
  Fill-Ellipse $g "#1c1208" 9 40 22 3 95
  Fill-Rect $g "#ff5a4a" 7 44 26 2 210

  Fill-Poly $g $outline @(
    (New-Object System.Drawing.Point 6,30),
    (New-Object System.Drawing.Point 10,24),
    (New-Object System.Drawing.Point 21,21),
    (New-Object System.Drawing.Point 30,23),
    (New-Object System.Drawing.Point 35,29),
    (New-Object System.Drawing.Point 32,36),
    (New-Object System.Drawing.Point 13,37),
    (New-Object System.Drawing.Point 7,34)
  )
  Fill-Poly $g "#6f7d80" @(
    (New-Object System.Drawing.Point 8,30),
    (New-Object System.Drawing.Point 12,25),
    (New-Object System.Drawing.Point 21,23),
    (New-Object System.Drawing.Point 29,25),
    (New-Object System.Drawing.Point 33,30),
    (New-Object System.Drawing.Point 30,34),
    (New-Object System.Drawing.Point 14,35),
    (New-Object System.Drawing.Point 9,33)
  )
  Fill-Rect $g "#aebabb" 13 24 12 3 190
  Fill-Rect $g "#4d5b5f" 11 32 19 3 190
  Fill-Rect $g "#31393d" 14 26 2 7 150
  Fill-Rect $g "#31393d" 22 25 2 7 150

  Fill-Poly $g $outline @(
    (New-Object System.Drawing.Point 28,20),
    (New-Object System.Drawing.Point 33,17),
    (New-Object System.Drawing.Point 38,21),
    (New-Object System.Drawing.Point 37,28),
    (New-Object System.Drawing.Point 30,28)
  )
  Fill-Poly $g "#9eacad" @(
    (New-Object System.Drawing.Point 29,21),
    (New-Object System.Drawing.Point 33,19),
    (New-Object System.Drawing.Point 37,22),
    (New-Object System.Drawing.Point 36,27),
    (New-Object System.Drawing.Point 31,27)
  )
  Fill-Poly $g "#d9e4e4" @(
    (New-Object System.Drawing.Point 30,19),
    (New-Object System.Drawing.Point 31,13),
    (New-Object System.Drawing.Point 34,20)
  )
  Fill-Poly $g "#b9c8c8" @(
    (New-Object System.Drawing.Point 35,19),
    (New-Object System.Drawing.Point 36,14),
    (New-Object System.Drawing.Point 38,22)
  )
  Fill-Rect $g "#1b1611" 34 23 2 1
  Fill-Rect $g "#0d0a08" 36 25 2 1
  Fill-Rect $g "#ffeed5" 35 27 2 3 235

  Draw-PixelRect $g "#596769" 11 34 3 7
  Draw-PixelRect $g "#596769" 18 34 3 7
  Draw-PixelRect $g "#596769" 27 33 3 8
  Fill-Rect $g "#e4eeee" 11 40 4 1 190
  Fill-Rect $g "#e4eeee" 27 40 4 1 190

  Fill-Poly $g $outline @(
    (New-Object System.Drawing.Point 9,27),
    (New-Object System.Drawing.Point 1,21),
    (New-Object System.Drawing.Point 4,34)
  )
  Fill-Poly $g "#6b7a7c" @(
    (New-Object System.Drawing.Point 9,28),
    (New-Object System.Drawing.Point 3,23),
    (New-Object System.Drawing.Point 5,32)
  )
  $g.Dispose()
  Save-Bitmap $canvas.Bitmap (Join-Path $unitDir $file)
}

function Draw-ImageNearest($g, $img, [int]$x, [int]$y, [int]$w, [int]$h) {
  $dest = New-Object System.Drawing.Rectangle $x, $y, $w, $h
  $g.DrawImage($img, $dest, 0, 0, $img.Width, $img.Height, [System.Drawing.GraphicsUnit]::Pixel)
}

function Polish-UnitSprite(
  [string]$file,
  [string]$role,
  [string]$team,
  [string]$accent,
  [bool]$boss = $false
) {
  $path = Join-Path $unitDir $file
  if (-not (Test-Path $path)) { return }

  $src = [System.Drawing.Bitmap]::FromFile($path)
  $canvas = New-PixelCanvas 40 48
  $g = $canvas.Graphics
  $outline = "#060403"

  Fill-Ellipse $g "#030201" 5 40 30 6 185
  Fill-Ellipse $g "#1c1208" 8 39 24 4 105

  if ($team -eq "ally") {
    Fill-Rect $g "#48d7ff" 5 43 30 2 210
  } elseif ($team -eq "boss") {
    Fill-Rect $g "#ffcf64" 4 43 32 2 220
    Fill-Rect $g "#ff3c2c" 8 45 24 1 180
  } else {
    Fill-Rect $g "#ff5a4a" 6 43 28 2 210
  }

  Draw-ImageNearest $g $src 4 3 32 40
  $src.Dispose()

  switch ($role) {
    "sword" {
      Fill-Poly $g $outline @(
        (New-Object System.Drawing.Point 7,18),
        (New-Object System.Drawing.Point 15,19),
        (New-Object System.Drawing.Point 13,38),
        (New-Object System.Drawing.Point 5,36)
      ) 185
      Fill-Poly $g $accent @(
        (New-Object System.Drawing.Point 8,19),
        (New-Object System.Drawing.Point 14,20),
        (New-Object System.Drawing.Point 12,36),
        (New-Object System.Drawing.Point 6,35)
      ) 160
      Fill-Rect $g "#f8f0c0" 33 13 2 18 210
      Fill-Rect $g "#ffffff" 33 13 1 8 160
      Fill-Rect $g "#5b371a" 31 28 7 2 210
    }
    "shield" {
      Fill-Rect $g $outline 2 20 12 17 225
      Fill-Rect $g "#9da9a9" 3 21 10 15 245
      Fill-Rect $g $accent 5 23 6 10 210
      Fill-Rect $g "#fff7d6" 4 22 6 1 140
      Fill-Rect $g "#6a421e" 34 15 2 22 220
    }
    "mage" {
      Fill-Ellipse $g $accent 29 5 8 8 185
      Fill-Rect $g "#fff2aa" 32 7 2 2 220
      Fill-Rect $g "#6a3a18" 33 13 2 24 230
      Fill-Rect $g "#f8e6a0" 30 14 8 2 180
      Fill-Rect $g $accent 11 32 18 4 170
    }
    "healer" {
      Fill-Rect $g "#f8f0c0" 32 8 3 25 235
      Fill-Rect $g "#f8f0c0" 28 12 11 3 235
      Fill-Ellipse $g "#9defff" 29 5 9 9 120
      Fill-Rect $g $accent 10 32 20 3 165
    }
    "bow" {
      Fill-Rect $g "#3f2414" 31 11 2 25 225
      Fill-Rect $g "#d8c58a" 30 15 1 17 190
      Fill-Rect $g "#f0d090" 29 18 1 10 160
      Fill-Rect $g $accent 6 19 4 15 180
      Fill-Rect $g "#5b371a" 23 14 8 3 170
    }
    "dagger" {
      Fill-Poly $g $outline @(
        (New-Object System.Drawing.Point 9,6),
        (New-Object System.Drawing.Point 20,1),
        (New-Object System.Drawing.Point 31,6),
        (New-Object System.Drawing.Point 28,17),
        (New-Object System.Drawing.Point 12,17)
      ) 210
      Fill-Poly $g $accent @(
        (New-Object System.Drawing.Point 12,7),
        (New-Object System.Drawing.Point 20,3),
        (New-Object System.Drawing.Point 28,7),
        (New-Object System.Drawing.Point 26,15),
        (New-Object System.Drawing.Point 14,15)
      ) 175
      Fill-Rect $g "#f8f0c0" 31 25 2 9 210
      Fill-Rect $g "#f8f0c0" 6 28 2 8 210
    }
    "lance" {
      Fill-Rect $g "#5b371a" 34 6 2 32 235
      Fill-Poly $g $outline @(
        (New-Object System.Drawing.Point 32,3),
        (New-Object System.Drawing.Point 38,8),
        (New-Object System.Drawing.Point 34,13)
      )
      Fill-Poly $g "#f8f0c0" @(
        (New-Object System.Drawing.Point 33,4),
        (New-Object System.Drawing.Point 37,8),
        (New-Object System.Drawing.Point 34,12)
      ) 225
      Fill-Rect $g $accent 7 24 24 4 195
    }
  }

  if ($boss) {
    Fill-Rect $g "#ffcf64" 14 1 12 3 230
    Fill-Rect $g "#fff2aa" 18 0 4 2 230
    Fill-Rect $g "#ff3c2c" 4 14 5 5 175
    Fill-Rect $g "#ff3c2c" 31 14 5 5 175
    Fill-Rect $g "#7b0b0b" 7 35 26 3 185
  }

  $tmpPath = "$path.tmp.png"
  $g.Dispose()
  $canvas.Bitmap.Save($tmpPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Bitmap.Dispose()
  Move-Item -LiteralPath $tmpPath -Destination $path -Force
}

Draw-HumanoidUnit "hero.png" "#2459a6" "#e0483f" "#1b2e54" "#c6d2dc" "sword"
Draw-HumanoidUnit "bram.png" "#5f6f7d" "#d7b25b" "#2b3340" "#becbd4" "shield"
Draw-HumanoidUnit "lina.png" "#8838a8" "#ff6b52" "#7a2f27" "#f1d68a" "mage"
Draw-HumanoidUnit "aria.png" "#e2dfc8" "#6fbfda" "#b67445" "#fff3bf" "healer"
Draw-HumanoidUnit "leon.png" "#2f7b4f" "#d49a44" "#243a24" "#e3c58a" "bow"
Draw-HumanoidUnit "sera.png" "#7c4fb2" "#f1c45a" "#5a2a54" "#dbc8ef" "mage"
Draw-HumanoidUnit "bandit.png" "#8b4f2b" "#d64a36" "#5b321f" "#b9a27a" "sword"
Draw-HumanoidUnit "archer.png" "#667c32" "#c58b3f" "#49311c" "#d5c177" "bow"
Draw-HumanoidUnit "mage.png" "#6a3a8c" "#d94eaa" "#231330" "#dcbf84" "mage"
Draw-HumanoidUnit "assassin.png" "#31323a" "#9a3c7a" "#111111" "#a9a49c" "dagger"
Draw-HumanoidUnit "shield.png" "#65706f" "#a5b75e" "#2c3538" "#c9d5d7" "shield"
Draw-HumanoidUnit "boss_knight.png" "#30343a" "#df4236" "#171114" "#c9c5bd" "lance" $true
Draw-HumanoidUnit "boss_mage.png" "#552073" "#ff5ed0" "#130d22" "#f0c76d" "mage" $true
Draw-HumanoidUnit "garon.png" "#211a1f" "#ff3c2c" "#0b0809" "#d7c2a0" "sword" $true
Draw-WolfUnit "wolf.png"

Polish-UnitSprite "hero.png" "sword" "ally" "#b01822"
Polish-UnitSprite "bram.png" "shield" "ally" "#d7b25b"
Polish-UnitSprite "lina.png" "mage" "ally" "#ff6b52"
Polish-UnitSprite "aria.png" "healer" "ally" "#6fbfda"
Polish-UnitSprite "leon.png" "bow" "ally" "#d49a44"
Polish-UnitSprite "sera.png" "mage" "ally" "#f1c45a"
Polish-UnitSprite "bandit.png" "sword" "enemy" "#b01822"
Polish-UnitSprite "archer.png" "bow" "enemy" "#c58b3f"
Polish-UnitSprite "mage.png" "mage" "enemy" "#d94eaa"
Polish-UnitSprite "assassin.png" "dagger" "enemy" "#9a3c7a"
Polish-UnitSprite "shield.png" "shield" "enemy" "#a5b75e"
Polish-UnitSprite "boss_knight.png" "lance" "boss" "#df4236" $true
Polish-UnitSprite "boss_mage.png" "mage" "boss" "#ff5ed0" $true
Polish-UnitSprite "garon.png" "sword" "boss" "#ff3c2c" $true

function Get-Noise([int]$x, [int]$y, [int]$stage, [int]$salt) {
  $value = (($x * 73856093) -bxor ($y * 19349663) -bxor ($stage * 83492791) -bxor ($salt * 2654435761))
  return [Math]::Abs($value)
}

function Draw-TileNoise($g, [int]$px, [int]$py, [int]$stage, [int]$x, [int]$y, [string]$a, [string]$b) {
  for ($i = 0; $i -lt 9; $i += 1) {
    $n = Get-Noise $x $y $stage $i
    $cx = $px + ($n % 30)
    $cy = $py + (($n / 7) % 30)
    $color = if (($n % 3) -eq 0) { $a } else { $b }
    Fill-Rect $g $color $cx $cy 2 2 145
  }
}

function Draw-BaseGrass($g, [int]$px, [int]$py, [int]$stage, [int]$x, [int]$y) {
  $seed = Get-Noise $x $y $stage 3
  $base = @("#4c9136", "#5a9e3c", "#51953a", "#62a743")[$seed % 4]
  Fill-Rect $g $base $px $py 32 32
  Fill-Rect $g "#77bd55" $px $py 32 1 45
  Fill-Rect $g "#2c5d29" $px $py 32 1 82
  Fill-Rect $g "#2c5d29" $px $py 1 32 72
  Draw-TileNoise $g $px $py $stage $x $y "#7fba50" "#386e2e"

  if (($seed % 5) -eq 0) {
    Fill-Rect $g "#316b2f" ($px + 7) ($py + 20) 2 7 130
    Fill-Rect $g "#7fc454" ($px + 10) ($py + 18) 1 8 145
  }

  if (($seed % 11) -eq 0) {
    Fill-Rect $g "#d98b70" ($px + 22) ($py + 23) 2 2 155
  }
}

function Draw-ClassicTile($g, [string]$tile, [int]$px, [int]$py, [int]$stage, [int]$x, [int]$y) {
  Draw-BaseGrass $g $px $py $stage $x $y

  switch ($tile) {
    "road" {
      Fill-Rect $g "#9a6b3b" $px $py 32 32
      Fill-Rect $g "#7b4f2b" $px $py 32 3 140
      Fill-Rect $g "#6c472a" $px ($py + 27) 32 5 125
      Fill-Rect $g "#c19758" $px ($py + 10) 32 3 170
      Fill-Rect $g "#deb06a" ($px + 4) ($py + 14) 24 2 120
      Fill-Rect $g "#5b3c23" ($px + 5) ($py + 22) 20 1 120
      Draw-TileNoise $g $px $py $stage $x $y "#5f3f25" "#d0a062"
    }
    "forest" {
      Fill-Rect $g "#4f9238" $px $py 32 32
      Fill-Ellipse $g "#0b2617" ($px + 3) ($py + 9) 20 17 175
      Fill-Ellipse $g "#0b2617" ($px + 10) ($py + 5) 21 18 175
      Fill-Rect $g "#5b351b" ($px + 14) ($py + 18) 4 11
      Fill-Ellipse $g "#164d29" ($px + 6) ($py + 8) 15 14
      Fill-Ellipse $g "#226b33" ($px + 13) ($py + 5) 16 15
      Fill-Ellipse $g "#3d913e" ($px + 9) ($py + 3) 10 8
      Fill-Rect $g "#79bd55" ($px + 14) ($py + 8) 5 2 155
      Fill-Rect $g "#0d351f" ($px + 6) ($py + 20) 22 2 150
    }
    "hill" {
      Fill-Rect $g "#68813a" $px $py 32 32
      Fill-Ellipse $g "#3f3527" ($px + 3) ($py + 11) 26 13 135
      Fill-Ellipse $g "#8a6f4b" ($px + 5) ($py + 9) 22 14
      Fill-Rect $g "#b69a67" ($px + 11) ($py + 10) 8 2
      Fill-Rect $g "#d0b37a" ($px + 16) ($py + 13) 5 1 155
      Fill-Rect $g "#5f4d38" ($px + 8) ($py + 20) 15 2 170
      Draw-TileNoise $g $px $py $stage $x $y "#c3a36c" "#4f6a32"
    }
    "fort" {
      Fill-Rect $g "#444943" $px $py 32 32
      Fill-Rect $g "#2c302d" $px ($py + 27) 32 5 130
      for ($yy = 0; $yy -lt 32; $yy += 8) {
        for ($xx = 0; $xx -lt 32; $xx += 10) {
          Fill-Rect $g "#777b70" ($px + $xx) ($py + $yy) 9 7
          Fill-Rect $g "#282923" ($px + $xx) ($py + $yy) 9 1 160
          Fill-Rect $g "#282923" ($px + $xx) ($py + $yy) 1 7 130
          Fill-Rect $g "#96998e" ($px + $xx + 2) ($py + $yy + 2) 4 1 90
        }
      }
    }
    "gate" {
      Fill-Rect $g "#5d5144" $px $py 32 32
      Fill-Rect $g "#8a552a" ($px + 6) ($py + 7) 20 20
      for ($xx = 8; $xx -lt 26; $xx += 5) { Fill-Rect $g "#4a2c19" ($px + $xx) ($py + 7) 2 20 170 }
      Fill-Rect $g "#c48a44" ($px + 6) ($py + 14) 20 2 180
      Fill-Rect $g "#2b1a0f" ($px + 6) ($py + 25) 20 2 130
    }
    "water" {
      Fill-Rect $g "#2c6f84" $px $py 32 32
      Fill-Rect $g "#4aa8b4" ($px + 2) ($py + 7) 12 2 150
      Fill-Rect $g "#92d6d4" ($px + 14) ($py + 20) 12 2 130
      Fill-Rect $g "#5bb7c0" ($px + 19) ($py + 9) 9 1 120
      Fill-Rect $g "#143d54" ($px + 2) ($py + 27) 22 2 95
      Fill-Rect $g "#194a60" $px ($py + 30) 32 2 150
    }
    "swamp" {
      Fill-Rect $g "#3f6440" $px $py 32 32
      Fill-Ellipse $g "#284f42" ($px + 5) ($py + 7) 20 14
      Fill-Rect $g "#7f9f4d" ($px + 9) ($py + 12) 4 2
      Fill-Rect $g "#243c2d" ($px + 17) ($py + 18) 9 2 120
      Fill-Rect $g "#8fae55" ($px + 21) ($py + 10) 2 2 140
      Draw-TileNoise $g $px $py $stage $x $y "#2b4330" "#7b8d48"
    }
    "fire" {
      Fill-Rect $g "#6a3828" $px $py 32 32
      Fill-Rect $g "#2e1b16" $px ($py + 26) 32 6 145
      Fill-Rect $g "#aa3d26" ($px + 6) ($py + 14) 20 9
      Fill-Poly $g "#ffb347" @(
        (New-Object System.Drawing.Point ($px + 11),($py + 22)),
        (New-Object System.Drawing.Point ($px + 16),($py + 8)),
        (New-Object System.Drawing.Point ($px + 22),($py + 22))
      ) 220
      Fill-Poly $g "#ffef8a" @(
        (New-Object System.Drawing.Point ($px + 15),($py + 20)),
        (New-Object System.Drawing.Point ($px + 18),($py + 13)),
        (New-Object System.Drawing.Point ($px + 21),($py + 20))
      ) 190
    }
    "ice" {
      Fill-Rect $g "#8bb8c8" $px $py 32 32
      Fill-Rect $g "#d6f2f1" ($px + 5) ($py + 7) 18 2 180
      Fill-Rect $g "#5b8faa" ($px + 11) ($py + 18) 17 2 150
      Fill-Rect $g "#e8ffff" ($px + 20) ($py + 11) 6 1 150
      Fill-Rect $g "#4b7895" ($px + 5) ($py + 24) 16 1 120
      Draw-TileNoise $g $px $py $stage $x $y "#c2eeee" "#6d9bb3"
    }
    "dark" {
      Fill-Rect $g "#28312a" $px $py 32 32
      Fill-Ellipse $g "#442d52" ($px + 6) ($py + 8) 20 16 180
      Fill-Rect $g "#7d3bb2" ($px + 13) ($py + 6) 5 18 150
      Fill-Rect $g "#1a171f" $px ($py + 27) 32 5 120
    }
    "rune" {
      Fill-Rect $g "#3f6d38" $px $py 32 32
      Fill-Ellipse $g "#545a68" ($px + 6) ($py + 6) 20 20
      Fill-Rect $g "#78e2ff" ($px + 10) ($py + 15) 12 2 210
      Fill-Rect $g "#78e2ff" ($px + 15) ($py + 10) 2 12 210
      Fill-Rect $g "#d8ffff" ($px + 13) ($py + 13) 6 1 190
    }
    "trap" {
      Fill-Rect $g "#6a5a37" $px $py 32 32
      Fill-Rect $g "#3b2d1c" ($px + 7) ($py + 9) 18 14
      Fill-Rect $g "#b8a66b" ($px + 9) ($py + 11) 14 2
      Fill-Rect $g "#b8a66b" ($px + 9) ($py + 19) 14 2
      Fill-Rect $g "#1b120a" ($px + 8) ($py + 22) 16 1 130
    }
  }
}

function Test-MapTile([array]$map, [int]$x, [int]$y, [array]$types) {
  if ($y -lt 0 -or $y -ge $map.Count) { return $false }
  if ($x -lt 0 -or $x -ge $map[$y].Count) { return $false }
  return $types -contains $map[$y][$x]
}

function Draw-StageOneGrassTile($g, [int]$px, [int]$py, [int]$stage, [int]$x, [int]$y) {
  $seed = Get-Noise $x $y $stage 401
  $base = @("#4f963a", "#579f3f", "#4b8d36", "#5ca644", "#448a34")[$seed % 5]
  Fill-Rect $g $base $px $py 32 32
  Fill-Rect $g "#79bf55" $px $py 32 1 62
  Fill-Rect $g "#2d5a28" $px ($py + 31) 32 1 82
  Fill-Rect $g "#2d5a28" $px $py 1 32 52
  Fill-Rect $g "#6caf48" ($px + 1) ($py + 1) 30 1 34

  for ($i = 0; $i -lt 18; $i += 1) {
    $n = Get-Noise $x $y $stage (420 + $i)
    $gx = $px + ($n % 31)
    $gy = $py + (($n / 9) % 31)
    $color = if (($n % 5) -eq 0) { "#8dcc62" } elseif (($n % 7) -eq 0) { "#315f2b" } else { "#66ad47" }
    Fill-Rect $g $color $gx $gy $(if (($n % 4) -eq 0) { 1 } else { 2 }) 1 155
  }

  if (($seed % 6) -eq 0) {
    Fill-Rect $g "#2f6f32" ($px + 8) ($py + 20) 2 7 150
    Fill-Rect $g "#83c755" ($px + 10) ($py + 18) 2 8 155
    Fill-Rect $g "#2f6f32" ($px + 12) ($py + 21) 1 5 135
  }

  if (($seed % 13) -eq 0) {
    Fill-Rect $g "#d88a6d" ($px + 23) ($py + 22) 2 2 170
    Fill-Rect $g "#f0c57c" ($px + 26) ($py + 19) 1 1 175
  }
}

function Draw-StageOneRoadTile($g, [array]$map, [int]$px, [int]$py, [int]$x, [int]$y) {
  $roadTypes = @("road", "gate")
  $left = Test-MapTile $map ($x - 1) $y $roadTypes
  $right = Test-MapTile $map ($x + 1) $y $roadTypes
  $up = Test-MapTile $map $x ($y - 1) $roadTypes
  $down = Test-MapTile $map $x ($y + 1) $roadTypes

  if (-not ($left -or $right -or $up -or $down)) {
    $left = $true
    $right = $true
  }

  $rim = "#614123"
  $base = "#9a6a3d"
  $mid = "#b9844c"
  $light = "#cf9b5d"
  $speck = "#7a5231"

  Fill-Rect $g $rim ($px + 6) ($py + 6) 20 20 190
  if ($left) { Fill-Rect $g $rim $px ($py + 7) 16 18 190 }
  if ($right) { Fill-Rect $g $rim ($px + 16) ($py + 7) 16 18 190 }
  if ($up) { Fill-Rect $g $rim ($px + 7) $py 18 16 190 }
  if ($down) { Fill-Rect $g $rim ($px + 7) ($py + 16) 18 16 190 }

  Fill-Rect $g $base ($px + 7) ($py + 7) 18 18
  if ($left) { Fill-Rect $g $base $px ($py + 8) 16 16 }
  if ($right) { Fill-Rect $g $base ($px + 16) ($py + 8) 16 16 }
  if ($up) { Fill-Rect $g $base ($px + 8) $py 16 16 }
  if ($down) { Fill-Rect $g $base ($px + 8) ($py + 16) 16 16 }

  Fill-Rect $g $mid ($px + 8) ($py + 11) 16 5 180
  if ($left -or $right) { Fill-Rect $g $mid $px ($py + 12) 32 4 150 }
  if ($up -or $down) { Fill-Rect $g $mid ($px + 12) $py 4 32 130 }

  Fill-Rect $g $light ($px + 9) ($py + 13) 14 2 170
  if ($left) { Fill-Rect $g $light $px ($py + 13) 9 2 130 }
  if ($right) { Fill-Rect $g $light ($px + 23) ($py + 13) 9 2 130 }
  if ($up) { Fill-Rect $g $light ($px + 13) $py 2 9 115 }
  if ($down) { Fill-Rect $g $light ($px + 13) ($py + 23) 2 9 115 }

  Fill-Rect $g "#704728" $px ($py + 6) 32 1 92
  Fill-Rect $g "#704728" $px ($py + 24) 32 1 92
  Fill-Rect $g "#dfb46d" ($px + 7) ($py + 16) 19 1 105

  if (-not $left) {
    Fill-Rect $g "#3e7b33" $px ($py + 9) 5 15 165
    Fill-Rect $g "#79b957" ($px + 2) ($py + 12) 2 8 140
  }
  if (-not $right) {
    Fill-Rect $g "#3e7b33" ($px + 27) ($py + 9) 5 15 165
    Fill-Rect $g "#79b957" ($px + 28) ($py + 15) 2 7 140
  }
  if (-not $up) {
    Fill-Rect $g "#3e7b33" ($px + 9) $py 15 5 160
    Fill-Rect $g "#79b957" ($px + 13) ($py + 2) 8 2 135
  }
  if (-not $down) {
    Fill-Rect $g "#3e7b33" ($px + 9) ($py + 27) 15 5 160
    Fill-Rect $g "#79b957" ($px + 12) ($py + 28) 8 2 135
  }

  for ($i = 0; $i -lt 11; $i += 1) {
    $n = Get-Noise $x $y 1 (520 + $i)
    Fill-Rect $g $speck ($px + ($n % 30)) ($py + (($n / 5) % 30)) 2 1 130
  }
}

function Draw-StageOneGrassClump($g, [int]$x, [int]$y, [int]$variant = 0) {
  $dark = if ($variant % 2 -eq 0) { "#2f6c31" } else { "#356f2d" }
  $light = if ($variant % 3 -eq 0) { "#8ccc5b" } else { "#7cbd50" }
  Fill-Rect $g $dark ($x + 1) ($y + 7) 14 2 120
  Fill-Rect $g $dark ($x + 4) ($y + 1) 2 8 160
  Fill-Rect $g $light ($x + 7) $y 2 10 160
  Fill-Rect $g $dark ($x + 10) ($y + 2) 2 7 145
  Fill-Rect $g "#274e24" ($x + 13) ($y + 4) 1 5 125
}

function Draw-StageOneBush($g, [int]$x, [int]$y, [int]$variant = 0) {
  Fill-Ellipse $g "#132f1c" ($x + 1) ($y + 11) 24 5 120
  Fill-Ellipse $g "#1b5b2f" $x ($y + 5) 13 12
  Fill-Ellipse $g "#267138" ($x + 9) ($y + 3) 16 13
  Fill-Ellipse $g "#3f8f43" ($x + 5) $y 12 10
  Fill-Rect $g "#82bf58" ($x + 8) ($y + 3) 5 2 165
  if ($variant % 2 -eq 0) {
    Fill-Rect $g "#dd8f72" ($x + 18) ($y + 8) 2 2 180
  }
}

function Draw-StageOneTree($g, [int]$x, [int]$y, [int]$variant = 0) {
  $trunk = if ($variant % 2 -eq 0) { "#623c20" } else { "#704520" }
  Fill-Ellipse $g "#111a10" ($x + 4) ($y + 24) 28 5 125
  Fill-Rect $g $trunk ($x + 13) ($y + 16) 5 12
  Fill-Rect $g "#3f2414" ($x + 15) ($y + 17) 2 10 150
  Fill-Ellipse $g "#0b2115" $x ($y + 9) 19 16
  Fill-Ellipse $g "#0b2115" ($x + 10) ($y + 6) 22 18
  Fill-Ellipse $g "#0b2115" ($x + 4) ($y - 1) 20 16
  Fill-Ellipse $g "#163f24" ($x + 2) ($y + 8) 17 15
  Fill-Ellipse $g "#1e5b2f" ($x + 12) ($y + 6) 18 16
  Fill-Ellipse $g "#2f7c38" ($x + 6) ($y + 1) 16 13
  Fill-Ellipse $g "#65a84a" ($x + 9) ($y + 4) 7 4 210
  Fill-Rect $g "#81be55" ($x + 17) ($y + 9) 6 2 145
  Fill-Rect $g "#0e2e1c" ($x + 4) ($y + 21) 24 2 140
}

function Draw-StageOneRock($g, [int]$x, [int]$y, [int]$variant = 0) {
  Fill-Ellipse $g "#2e2a1d" ($x + 1) ($y + 15) 24 5 115
  Fill-Ellipse $g "#2f2a20" ($x - 1) ($y + 5) 28 17 180
  Fill-Ellipse $g "#7b6a4b" $x ($y + 6) 25 15
  Fill-Ellipse $g "#9b8a62" ($x + 4) ($y + 3) 13 8
  Fill-Rect $g "#bca36d" ($x + 7) ($y + 6) 8 2 180
  Fill-Rect $g "#56452f" ($x + 4) ($y + 17) 16 2 170
  if ($variant % 2 -eq 0) {
    Fill-Ellipse $g "#6b5a3e" ($x + 17) ($y + 10) 10 8
  }
}

function Draw-StageOneFence($g, [int]$x, [int]$y, [int]$segments, [string]$orientation = "horizontal") {
  for ($i = 0; $i -lt $segments; $i += 1) {
    if ($orientation -eq "horizontal") {
      $sx = $x + ($i * 16)
      Fill-Rect $g "#2a170b" ($sx + 1) ($y + 1) 5 19 160
      Fill-Rect $g "#7d5128" $sx $y 5 18
      Fill-Rect $g "#b27837" ($sx + 1) ($y + 1) 3 3 170
      Fill-Rect $g "#8c5a2a" $sx ($y + 5) 18 4
      Fill-Rect $g "#8c5a2a" $sx ($y + 13) 18 4
      Fill-Rect $g "#321b0d" $sx ($y + 16) 18 2 130
    } else {
      $sy = $y + ($i * 16)
      Fill-Rect $g "#2a170b" ($x + 1) ($sy + 1) 19 5 160
      Fill-Rect $g "#7d5128" $x $sy 18 5
      Fill-Rect $g "#b27837" ($x + 1) ($sy + 1) 3 3 170
      Fill-Rect $g "#8c5a2a" ($x + 5) $sy 4 18
      Fill-Rect $g "#8c5a2a" ($x + 13) $sy 4 18
      Fill-Rect $g "#321b0d" ($x + 16) $sy 2 18 130
    }
  }
}

function Draw-StageOneWatchPost($g, [int]$x, [int]$y) {
  Fill-Ellipse $g "#10100b" ($x + 3) ($y + 38) 38 8 125
  Fill-Rect $g "#3a2111" ($x + 8) ($y + 23) 5 20
  Fill-Rect $g "#3a2111" ($x + 30) ($y + 23) 5 20
  Fill-Rect $g "#8a552a" ($x + 7) ($y + 21) 30 8
  Fill-Rect $g "#c4863e" ($x + 9) ($y + 22) 26 2 170
  Fill-Poly $g "#31140f" @(
    (New-Object System.Drawing.Point ($x + 3),($y + 20)),
    (New-Object System.Drawing.Point ($x + 22),($y + 5)),
    (New-Object System.Drawing.Point ($x + 41),($y + 20))
  )
  Fill-Poly $g "#7d1f19" @(
    (New-Object System.Drawing.Point ($x + 5),($y + 19)),
    (New-Object System.Drawing.Point ($x + 22),($y + 7)),
    (New-Object System.Drawing.Point ($x + 39),($y + 19))
  )
  Fill-Rect $g "#e0aa57" ($x + 21) ($y + 28) 3 4 210
}

function Draw-StageOneCrate($g, [int]$x, [int]$y) {
  Fill-Rect $g "#4a2a16" ($x - 1) ($y - 1) 22 16
  Fill-Rect $g "#9a5f2c" $x $y 20 14
  Fill-Rect $g "#c9873f" ($x + 2) ($y + 2) 16 2 190
  Fill-Rect $g "#633718" ($x + 9) $y 2 14 190
  Fill-Rect $g "#633718" $x ($y + 6) 20 2 190
}

function Draw-StageOneFortTile($g, [string]$tile, [int]$px, [int]$py, [int]$x, [int]$y) {
  Fill-Rect $g "#3d423d" $px $py 32 32
  Fill-Rect $g "#2b2e2a" $px ($py + 27) 32 5 120
  for ($yy = 0; $yy -lt 32; $yy += 8) {
    $offset = if ((($yy / 8) % 2) -eq 0) { 0 } else { -5 }
    for ($xx = $offset; $xx -lt 32; $xx += 10) {
      Fill-Rect $g "#72766e" ($px + $xx) ($py + $yy) 9 7
      Fill-Rect $g "#2b2c29" ($px + $xx) ($py + $yy) 9 1 150
      Fill-Rect $g "#2b2c29" ($px + $xx) ($py + $yy) 1 7 120
      Fill-Rect $g "#94988c" ($px + $xx + 2) ($py + $yy + 2) 4 1 100
    }
  }
  if ((($x + $y) % 3) -eq 0) {
    Fill-Rect $g "#272824" ($px + 21) ($py + 8) 7 2 160
    Fill-Rect $g "#8e9187" ($px + 8) ($py + 20) 5 1 130
  }

  if ($tile -eq "gate") {
    Fill-Rect $g "#3a2111" ($px + 5) ($py + 8) 22 18
    Fill-Rect $g "#8d5428" ($px + 6) ($py + 9) 20 16
    Fill-Rect $g "#bb7c39" ($px + 8) ($py + 11) 16 2 180
    for ($bar = 9; $bar -le 23; $bar += 5) {
      Fill-Rect $g "#563016" ($px + $bar) ($py + 9) 2 16 180
    }
    Fill-Rect $g "#d6a24a" ($px + 15) ($py + 16) 3 3 200
  }
}

function Draw-StageOneShowcaseMap($g, [array]$largeMap, [int]$stage) {
  $size = 12
  $tileSize = 32

  for ($y = 0; $y -lt $size; $y += 1) {
    for ($x = 0; $x -lt $size; $x += 1) {
      Draw-StageOneGrassTile $g ($x * $tileSize) ($y * $tileSize) $stage $x $y
    }
  }

  for ($y = 0; $y -lt $size; $y += 1) {
    for ($x = 0; $x -lt $size; $x += 1) {
      $tile = $largeMap[$y][$x]
      $px = $x * $tileSize
      $py = $y * $tileSize
      if ($tile -eq "road") {
        Draw-StageOneRoadTile $g $largeMap $px $py $x $y
      } elseif ($tile -eq "fort" -or $tile -eq "gate") {
        Draw-StageOneFortTile $g $tile $px $py $x $y
      }
    }
  }

  for ($y = 0; $y -lt $size; $y += 1) {
    for ($x = 0; $x -lt $size; $x += 1) {
      $tile = $largeMap[$y][$x]
      $px = $x * $tileSize
      $py = $y * $tileSize
      if ($tile -eq "forest") {
        Draw-StageOneTree $g ($px + 1) ($py + 2) (($x + $y) % 3)
      } elseif ($tile -eq "hill") {
        Draw-StageOneRock $g ($px + 4) ($py + 5) (($x * 3 + $y) % 2)
      } elseif ($tile -eq "plain") {
        $n = Get-Noise $x $y $stage 620
        if (($n % 7) -eq 0) {
          Draw-StageOneGrassClump $g ($px + 6) ($py + 18) (($x + $y) % 3)
        }
        if (($n % 11) -eq 0) {
          Fill-Rect $g "#d58b6d" ($px + 22) ($py + 21) 2 2 170
        }
        if (($n % 19) -eq 0) {
          Draw-StageOneBush $g ($px + 4) ($py + 8) (($x * 2 + $y) % 2)
        }
      }
    }
  }

  Draw-StageOneBush $g 18 94 1
  Draw-StageOneBush $g 70 144 0
  Draw-StageOneGrassClump $g 204 205 1
  Draw-StageOneGrassClump $g 252 292 2
  Draw-StageOneGrassClump $g 154 66 0
  Draw-StageOneCrate $g 290 42
  Draw-StageOneCrate $g 330 82
  Draw-StageOneCrate $g 330 26
  Draw-StageOneWatchPost $g 302 4
  Draw-StageOneFence $g 286 112 5 "horizontal"
  Draw-StageOneFence $g 279 38 4 "vertical"
  Draw-StageOneFence $g 360 36 4 "vertical"
  Fill-Rect $g "#5f3f20" 297 116 5 24
  Fill-Rect $g "#5f3f20" 352 116 5 24
  Fill-Rect $g "#8c5a2a" 288 118 80 6
  Fill-Rect $g "#2b1a0e" 288 124 80 2 160
  Fill-Rect $g "#5b3b20" 0 327 150 8 175
  Fill-Rect $g "#b8894e" 0 329 150 2 140
  Draw-StageOneFence $g 4 318 7 "horizontal"
  Draw-StageOneRock $g 224 24 1
  Draw-StageOneRock $g 340 226 0
  Fill-Rect $g "#18110a" 0 0 ($tileSize * $size) 3 150
  Fill-Rect $g "#18110a" 0 (($tileSize * $size) - 3) ($tileSize * $size) 3 150
  Fill-Rect $g "#18110a" 0 0 3 ($tileSize * $size) 150
  Fill-Rect $g "#18110a" (($tileSize * $size) - 3) 0 3 ($tileSize * $size) 150
}

function Get-MapTileSafe([array]$map, [int]$x, [int]$y) {
  if ($y -lt 0 -or $y -ge $map.Count) { return "" }
  if ($x -lt 0 -or $x -ge $map[$y].Count) { return "" }
  return $map[$y][$x]
}

function Draw-ClassicCrack($g, [int]$x, [int]$y, [string]$color = "#2a241c", [int]$alpha = 140) {
  Fill-Rect $g $color $x $y 8 1 $alpha
  Fill-Rect $g $color ($x + 7) ($y + 1) 1 4 $alpha
  Fill-Rect $g $color ($x + 4) ($y + 3) 4 1 $alpha
  Fill-Rect $g $color ($x + 3) ($y + 4) 1 3 $alpha
}

function Draw-ClassicReeds($g, [int]$x, [int]$y) {
  Fill-Rect $g "#2f5b30" ($x + 1) ($y + 4) 2 9 150
  Fill-Rect $g "#7f9f4d" ($x + 3) ($y + 1) 1 12 155
  Fill-Rect $g "#315f33" ($x + 5) ($y + 5) 2 8 140
  Fill-Rect $g "#8aa75a" ($x + 7) ($y + 3) 1 9 140
}

function Draw-ClassicTerrainEdges($g, [array]$map, [int]$tileSize) {
  $h = $map.Count
  $w = $map[0].Count

  for ($y = 0; $y -lt $h; $y += 1) {
    for ($x = 0; $x -lt $w; $x += 1) {
      $tile = $map[$y][$x]
      if ($tile -eq "plain" -or $tile -eq "road") { continue }

      $px = $x * $tileSize
      $py = $y * $tileSize
      $edge = switch ($tile) {
        "forest" { "#0b2617"; break }
        "hill" { "#5a422c"; break }
        "fort" { "#242622"; break }
        "gate" { "#2b1a0f"; break }
        "water" { "#143d54"; break }
        "swamp" { "#243c2d"; break }
        "fire" { "#321411"; break }
        "ice" { "#4b7895"; break }
        "dark" { "#17111f"; break }
        "rune" { "#263c47"; break }
        "trap" { "#26190d"; break }
        default { "#1f2318" }
      }

      $left = Get-MapTileSafe $map ($x - 1) $y
      $right = Get-MapTileSafe $map ($x + 1) $y
      $up = Get-MapTileSafe $map $x ($y - 1)
      $down = Get-MapTileSafe $map $x ($y + 1)

      if ($left -ne $tile) { Fill-Rect $g $edge $px ($py + 2) 2 28 88 }
      if ($right -ne $tile) { Fill-Rect $g $edge ($px + 30) ($py + 2) 2 28 80 }
      if ($up -ne $tile) { Fill-Rect $g "#ffffff" ($px + 2) $py 28 1 24; Fill-Rect $g $edge ($px + 2) ($py + 1) 28 1 60 }
      if ($down -ne $tile) { Fill-Rect $g $edge ($px + 2) ($py + 30) 28 2 90 }
    }
  }
}

function Draw-ClassicTerrainOrnaments($g, [array]$map, [int]$stage, [int]$tileSize) {
  $h = $map.Count
  $w = $map[0].Count

  for ($y = 0; $y -lt $h; $y += 1) {
    for ($x = 0; $x -lt $w; $x += 1) {
      $tile = $map[$y][$x]
      $px = $x * $tileSize
      $py = $y * $tileSize
      $seed = Get-Noise $x $y $stage 940

      switch ($tile) {
        "plain" {
          if (($seed % 9) -eq 0) { Draw-StageOneGrassClump $g ($px + 5 + ($seed % 10)) ($py + 17 + (($seed / 7) % 6)) ($seed % 3) }
          if (($seed % 23) -eq 0) { Draw-StageOneBush $g ($px + 4) ($py + 7) ($seed % 2) }
          if (($seed % 17) -eq 0) {
            Fill-Rect $g "#d98b70" ($px + 21) ($py + 22) 2 2 160
            Fill-Rect $g "#f0c57c" ($px + 24) ($py + 18) 1 1 160
          }
        }
        "road" {
          if (($seed % 2) -eq 0) {
            Fill-Rect $g "#754b2c" ($px + 7) ($py + 11) 17 1 105
            Fill-Rect $g "#d7a967" ($px + 9) ($py + 15) 12 1 95
          }
          if (($seed % 5) -eq 0) {
            Fill-Rect $g "#5e3b21" ($px + 18) ($py + 22) 2 1 120
            Fill-Rect $g "#5e3b21" ($px + 23) ($py + 9) 2 1 120
          }
        }
        "forest" {
          Fill-Ellipse $g "#08180f" ($px + 4) ($py + 21) 24 4 115
          if (($seed % 4) -eq 0) { Fill-Rect $g "#88bf59" ($px + 18) ($py + 7) 5 1 130 }
        }
        "hill" {
          if (($seed % 3) -eq 0) { Draw-ClassicCrack $g ($px + 9) ($py + 15) "#5b4934" 135 }
          if (($seed % 5) -eq 0) { Fill-Ellipse $g "#b69a67" ($px + 18) ($py + 8) 6 3 140 }
        }
        "fort" {
          if (($seed % 3) -eq 0) { Draw-ClassicCrack $g ($px + 9) ($py + 9) "#222520" 155 }
          if (($seed % 7) -eq 0) { Fill-Rect $g "#9a2e26" ($px + 24) ($py + 5) 4 9 170 }
        }
        "gate" {
          Fill-Rect $g "#f1c45a" ($px + 15) ($py + 16) 3 3 185
          Fill-Rect $g "#2b1a0f" ($px + 7) ($py + 24) 18 2 130
        }
        "water" {
          Fill-Rect $g "#a8ecea" ($px + 4) ($py + 8) 9 1 110
          Fill-Rect $g "#6fc5ce" ($px + 17) ($py + 19) 11 1 115
          if (($seed % 3) -eq 0) { Draw-ClassicReeds $g ($px + 3) ($py + 15) }
        }
        "swamp" {
          Draw-ClassicReeds $g ($px + 18) ($py + 14)
          if (($seed % 4) -eq 0) { Fill-Ellipse $g "#5d7442" ($px + 8) ($py + 10) 5 3 145 }
        }
        "fire" {
          Fill-Rect $g "#f7be55" ($px + 16) ($py + 10) 2 2 180
          Fill-Rect $g "#1d1110" ($px + 7) ($py + 24) 18 2 120
          if (($seed % 2) -eq 0) { Fill-Rect $g "#c64a2b" ($px + 23) ($py + 18) 2 2 150 }
        }
        "ice" {
          Draw-ClassicCrack $g ($px + 8) ($py + 12) "#e8ffff" 135
          Fill-Rect $g "#5c91ac" ($px + 5) ($py + 24) 12 1 105
        }
        "dark" {
          Fill-Rect $g "#8b55d6" ($px + 15) ($py + 9) 2 2 130
          Fill-Rect $g "#1a1324" ($px + 8) ($py + 23) 16 2 130
        }
        "rune" {
          Fill-Rect $g "#d8ffff" ($px + 14) ($py + 14) 4 4 150
          Fill-Rect $g "#78e2ff" ($px + 8) ($py + 22) 16 1 150
        }
        "trap" {
          Fill-Rect $g "#d0bd78" ($px + 11) ($py + 13) 10 1 140
          Fill-Rect $g "#25180c" ($px + 8) ($py + 21) 16 2 140
        }
      }
    }
  }
}

function Draw-ClassicStageMood($g, [int]$stage, [int]$width, [int]$height) {
  if ($stage -eq 4) {
    for ($i = 0; $i -lt 34; $i += 1) {
      $n = Get-Noise $i ($stage + $i) $stage 1200
      Fill-Rect $g "#ffb347" ($n % ($width - 4)) (($n / 9) % ($height - 4)) 2 2 95
    }
  } elseif ($stage -eq 6) {
    for ($i = 0; $i -lt 42; $i += 1) {
      $n = Get-Noise $i ($stage + $i) $stage 1240
      Fill-Rect $g "#e8ffff" ($n % ($width - 4)) (($n / 11) % ($height - 4)) 2 1 90
    }
  } elseif ($stage -ge 7 -and $stage -le 12) {
    for ($i = 0; $i -lt 18; $i += 1) {
      $n = Get-Noise $i ($stage + $i) $stage 1280
      Fill-Ellipse $g "#261b34" ($n % ($width - 18)) (($n / 13) % ($height - 18)) 18 10 55
    }
  }
}

function Draw-ClassicMapFinish($g, [array]$map, [int]$stage, [int]$tileSize) {
  $width = $tileSize * $map[0].Count
  $height = $tileSize * $map.Count
  Draw-ClassicTerrainEdges $g $map $tileSize
  Draw-ClassicTerrainOrnaments $g $map $stage $tileSize
  Draw-ClassicStageMood $g $stage $width $height

  Fill-Rect $g "#ffffff" 0 0 $width 1 22
  Fill-Rect $g "#000000" 0 ($height - 1) $width 1 70
  Fill-Rect $g "#000000" ($width - 1) 0 1 $height 58
}

function Get-StageBattlefieldTheme([int]$stage) {
  if (@(12, 25, 26, 27, 28, 29, 30) -contains $stage) { return "final" }
  if (@(6) -contains $stage) { return "frozen" }
  if (@(8, 11, 23) -contains $stage) { return "marsh" }
  if (@(4) -contains $stage) { return "burning" }
  if (@(3, 5, 9, 10, 16, 17, 20) -contains $stage) { return "fortress" }
  if (@(7, 13, 14, 15, 18, 19, 21, 22, 24) -contains $stage) { return "shadow" }
  if (@(2) -contains $stage) { return "canyon" }
  return "frontier"
}

function Get-ThemeSeed([string]$theme) {
  switch ($theme) {
    "frontier" { return 11 }
    "canyon" { return 23 }
    "fortress" { return 37 }
    "burning" { return 41 }
    "frozen" { return 53 }
    "marsh" { return 67 }
    "shadow" { return 79 }
    "final" { return 97 }
    default { return 11 }
  }
}

function Get-StageTileSeed([int]$stage, [int]$x, [int]$y, [int]$salt) {
  $value =
    ([int64]($stage + 13) * 92821) +
    ([int64]($x + 5) * 13717) +
    ([int64]($y + 7) * 27143) +
    ([int64]($salt + 3) * 65537)
  return [Math]::Abs($value % 1000003)
}

function Test-LargeMapAllyZone([int]$x, [int]$y, [int]$width, [int]$height) {
  return $y -ge ($height - 3) -and $x -le ([Math]::Min(6, $width - 1))
}

function Get-ThemedLargeTile(
  [string]$tile,
  [int]$stage,
  [string]$theme,
  [int]$x,
  [int]$y,
  [int]$width,
  [int]$height
) {
  $hazards = @("fire", "ice", "water", "dark", "rune", "trap", "swamp")
  $structures = @("road", "fort", "gate")
  $seed = Get-StageTileSeed $stage $x $y (Get-ThemeSeed $theme)
  $allyZone = Test-LargeMapAllyZone $x $y $width $height
  $bossZone = $x -ge ($width - 4) -and $y -le 3
  $diagonalRoadY = $height - 2 - [Math]::Floor(($x / [Math]::Max(1, $width - 1)) * ($height - 4))
  $roadBand = $x -ge 1 -and $x -le ($width - 2) -and [Math]::Abs($y - $diagonalRoadY) -le $(if (($x % 5) -eq 0) { 1 } else { 0 })
  $midBand = $y -eq [Math]::Floor($height * 0.52) -and $x -ge 2 -and $x -le ($width - 4)

  if ($allyZone) {
    if ($hazards -contains $tile) { return $(if ($x -eq 2 -or $y -eq ($height - 2)) { "road" } else { "plain" }) }
    if ($tile -eq "plain" -and ($seed % 19) -eq 0) { return "forest" }
    return $tile
  }

  if ($bossZone) {
    switch ($theme) {
      "final" { return $(if (($seed % 5) -eq 0) { "rune" } elseif (($seed % 3) -eq 0) { "dark" } else { "fort" }) }
      "shadow" { return $(if (($seed % 4) -eq 0) { "rune" } else { "dark" }) }
      "burning" { return $(if (($seed % 4) -eq 0) { "fire" } else { "fort" }) }
      "frozen" { return $(if (($seed % 3) -eq 0) { "ice" } else { "fort" }) }
      default { return $(if ($x -eq ($width - 3) -or $y -eq 2) { "gate" } else { "fort" }) }
    }
  }

  if (($roadBand -or $midBand) -and -not ($hazards -contains $tile)) {
    if ($theme -eq "frozen" -and ($seed % 7) -eq 0) { return "ice" }
    if ($theme -eq "shadow" -and ($seed % 9) -eq 0) { return "rune" }
    if ($theme -eq "marsh" -and ($seed % 6) -eq 0) { return "water" }
    return "road"
  }

  if (($structures -contains $tile) -and ($seed % 6) -ne 0) { return $tile }

  switch ($theme) {
    "frontier" {
      if (($seed % 10) -eq 0) { return "forest" }
      if (($seed % 17) -eq 0) { return "hill" }
      if ($x -ge ($width - 5) -and $y -le 5 -and ($seed % 13) -eq 0) { return "gate" }
      return $tile
    }
    "canyon" {
      if ($x -le 1 -or $x -ge ($width - 2) -or ($seed % 7) -eq 0) { return "hill" }
      if (($seed % 19) -eq 0) { return "trap" }
      if (($seed % 11) -eq 0) { return "forest" }
      return $tile
    }
    "fortress" {
      if (($seed % 8) -eq 0) { return "fort" }
      if (($seed % 13) -eq 0) { return "gate" }
      if (($seed % 17) -eq 0) { return "trap" }
      if (($seed % 5) -eq 0) { return "hill" }
      return $tile
    }
    "burning" {
      if (($seed % 6) -eq 0) { return "fire" }
      if (($seed % 9) -eq 0) { return "forest" }
      if (($seed % 14) -eq 0) { return "hill" }
      return $tile
    }
    "frozen" {
      if (($seed % 5) -eq 0) { return "ice" }
      if (($seed % 13) -eq 0) { return "water" }
      if (($seed % 11) -eq 0) { return "hill" }
      return $tile
    }
    "marsh" {
      if (($seed % 7) -eq 0) { return "swamp" }
      if (($seed % 11) -eq 0) { return "water" }
      if (($seed % 6) -eq 0) { return "forest" }
      return $tile
    }
    "shadow" {
      if (($seed % 6) -eq 0) { return "dark" }
      if (($seed % 10) -eq 0) { return "rune" }
      if (($seed % 14) -eq 0) { return "trap" }
      if (($seed % 9) -eq 0) { return "forest" }
      return $tile
    }
    "final" {
      if (($seed % 5) -eq 0) { return "dark" }
      if (($seed % 7) -eq 0) { return "fire" }
      if (($seed % 9) -eq 0) { return "rune" }
      if (($seed % 13) -eq 0) { return "fort" }
      return $tile
    }
    default { return $tile }
  }
}

function Apply-StageBattlefieldTheme([array]$map, [int]$stage) {
  $theme = Get-StageBattlefieldTheme $stage
  $height = $map.Count
  $width = $map[0].Count
  $result = @()

  for ($y = 0; $y -lt $height; $y += 1) {
    $row = @()
    for ($x = 0; $x -lt $width; $x += 1) {
      $row += Get-ThemedLargeTile $map[$y][$x] $stage $theme $x $y $width $height
    }
    $result += ,$row
  }

  return $result
}

function Expand-MapToLarge([array]$baseMap, [int]$size = 12, [int]$stage = 1) {
  $hazards = @("fire", "ice", "water", "dark", "rune", "trap")
  $h = $baseMap.Count
  $w = $baseMap[0].Count
  $result = @()
  for ($y = 0; $y -lt $size; $y += 1) {
    $row = @()
    for ($x = 0; $x -lt $size; $x += 1) {
      if ($y -ge $size - 3 -and $x -le 4) {
        $row += $(if ($x -eq 2 -or $y -eq $size - 2) { "road" } else { "plain" })
        continue
      }

      $sourceTile = $baseMap[$y % $h][$x % $w]
      $protectedTile = $hazards -contains $sourceTile

      if ($y -ge $size - 4 -and $x -le 5) {
        $row += $(if ($protectedTile) { "plain" } else { $sourceTile })
        continue
      }

      $diagonalRoadY = $size - 2 - [Math]::Floor($x * 0.62)
      $hasDiagonalRoad = $x -ge 2 -and $x -le $size - 3 -and [Math]::Abs($y - $diagonalRoadY) -le $(if (($x % 4) -eq 0) { 1 } else { 0 })
      $hasUpperPatrolRoad = $y -eq 2 -and $x -ge [Math]::Floor($size * 0.48) -and $x -le $size - 2
      $hasMidRoad = $y -eq [Math]::Floor($size * 0.54) -and $x -ge 2 -and $x -le $size - 4 -and ($x % 2) -eq 0

      if (-not $protectedTile -and ($hasDiagonalRoad -or $hasUpperPatrolRoad -or $hasMidRoad)) {
        $row += "road"
      } elseif (-not $protectedTile -and $x -ge $size - 3 -and $y -le 1) {
        $row += $(if ($x -eq $size - 2) { "gate" } else { "fort" })
      } elseif (-not $protectedTile -and $sourceTile -eq "plain" -and (($x -eq $size - 2 -and $y -eq 3) -or ($x -eq $size - 4 -and $y -eq 1))) {
        $row += "gate"
      } elseif ((($x + $y + $size) % 17) -eq 0) {
        $row += $(if ($sourceTile -eq "plain") { "forest" } else { $sourceTile })
      } elseif ((($x * 3 + $y * 5) % 29) -eq 0) {
        $row += $(if ($sourceTile -eq "plain") { "hill" } else { $sourceTile })
      } elseif (-not $protectedTile -and $sourceTile -eq "plain" -and $x -le 2 -and $y -le 3 -and (($x + $y) % 2) -eq 0) {
        $row += "forest"
      } elseif (-not $protectedTile -and $sourceTile -eq "plain" -and $x -ge $size - 4 -and $y -ge 4 -and $y -le $size - 4 -and (($x + $y) % 3) -eq 0) {
        $row += "hill"
      } else {
        $row += $sourceTile
      }
    }
    $result += ,$row
  }
  return Apply-StageBattlefieldTheme $result $stage
}

$fallbackMap = @(
  @("forest", "plain", "plain", "hill", "plain", "plain", "forest", "plain"),
  @("plain", "plain", "forest", "plain", "road", "plain", "plain", "plain"),
  @("plain", "plain", "plain", "road", "road", "road", "plain", "forest"),
  @("hill", "plain", "plain", "plain", "forest", "plain", "plain", "plain"),
  @("plain", "forest", "plain", "plain", "plain", "plain", "hill", "plain"),
  @("plain", "plain", "road", "road", "plain", "forest", "plain", "plain"),
  @("forest", "plain", "plain", "plain", "plain", "plain", "plain", "hill"),
  @("plain", "plain", "plain", "forest", "plain", "plain", "plain", "plain")
)

$stageMaps = @{}
$stageFile = Join-Path $root "src\data\stages.js"
if (Test-Path $stageFile) {
  $content = Get-Content $stageFile -Raw -Encoding UTF8
  $matches = [regex]::Matches($content, '(?s)\{\s*id:\s*(\d+),.*?map:\s*\[(.*?)\]\s*,\s*units:')
  foreach ($match in $matches) {
    $id = [int]$match.Groups[1].Value
    $mapText = $match.Groups[2].Value
    $rows = @()
    foreach ($rowMatch in [regex]::Matches($mapText, '\[([^\[\]]+)\]')) {
      $tiles = @()
      foreach ($tileMatch in [regex]::Matches($rowMatch.Groups[1].Value, '"([^"]+)"')) {
        $tiles += $tileMatch.Groups[1].Value
      }
      if ($tiles.Count -gt 0) { $rows += ,$tiles }
    }
    if ($rows.Count -gt 0) { $stageMaps[$id] = $rows }
  }
}

for ($stage = 1; $stage -le 30; $stage += 1) {
  $baseMap = if ($stageMaps.ContainsKey($stage)) { $stageMaps[$stage] } else { $fallbackMap }
  $largeMap = Expand-MapToLarge $baseMap 12 $stage
  $tileSize = 32
  $canvas = New-PixelCanvas ($tileSize * 12) ($tileSize * 12)
  $g = $canvas.Graphics

  if ($stage -eq 1) {
    Draw-StageOneShowcaseMap $g $largeMap $stage
  } else {
    for ($y = 0; $y -lt 12; $y += 1) {
      for ($x = 0; $x -lt 12; $x += 1) {
        $tile = $largeMap[$y][$x]
        $px = $x * $tileSize
        $py = $y * $tileSize
        if ($tile -eq "road") {
          Draw-BaseGrass $g $px $py $stage $x $y
          Draw-StageOneRoadTile $g $largeMap $px $py $x $y
        } else {
          Draw-ClassicTile $g $tile $px $py $stage $x $y
        }
      }
    }
  }

  Draw-ClassicMapFinish $g $largeMap $stage $tileSize

  for ($i = 0; $i -lt 32; $i += 1) {
    $n = Get-Noise $i ($i + 5) $stage 91
    $x = $n % 370
    $y = ($n / 11) % 370
    Fill-Rect $g "#10100b" $x $y 2 2 80
  }

  $g.Dispose()
  Save-Bitmap $canvas.Bitmap (Join-Path $mapDir "stage_$stage.png")
}

Write-Host "Generated classic battle assets in public/sprites/classic and public/maps/classic."
