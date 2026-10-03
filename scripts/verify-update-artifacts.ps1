param([switch]$ApkOnly)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$apkPath = Join-Path $root "cheonsu_${version}_update_debug.apk"
$otaPath = Join-Path $root "update-release/$version/cheonsu_${version}_ota.zip"
$dist = (Resolve-Path (Join-Path $root 'dist')).Path
$windowsHost = [Environment]::OSVersion.Platform -eq 'Win32NT'
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } elseif ($windowsHost) { Join-Path $env:LOCALAPPDATA 'Android/Sdk' } else { throw 'Set ANDROID_HOME to the Android SDK directory.' }
$buildTools = Get-ChildItem (Join-Path $sdk 'build-tools') -Directory | Sort-Object Name -Descending | Select-Object -First 1
if (!$env:JAVA_HOME -and $windowsHost) { $env:JAVA_HOME = 'C:/Program Files/Android/Android Studio/jbr' }
$signer = if ($windowsHost) { 'apksigner.bat' } else { 'apksigner' }
$aapt = if ($windowsHost) { 'aapt.exe' } else { 'aapt' }
$signature = & (Join-Path $buildTools.FullName $signer) verify --verbose --print-certs $apkPath
$signerExitCode = $LASTEXITCODE
$signature | Where-Object { $_ -match 'certificate SHA-256 digest|Verified using|Verifies' }
if ($signerExitCode -ne 0) { throw "APK signature verification failed (exit $signerExitCode)." }
if (($signature -join "`n") -notmatch '1d4b2f3f8e7b30e2b9202121def34d4da6e39b4119bdd93c44a01aebfcd0518f') { throw 'APK signing certificate mismatch.' }
$badging = & (Join-Path $buildTools.FullName $aapt) dump badging $apkPath
if ($LASTEXITCODE -ne 0 -or ($badging -join "`n") -notmatch "versionName='$([Regex]::Escape($version))'") { throw 'APK version mismatch.' }
$badging | Select-Object -First 1
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Read-ZipText($zip, $name) {
    $entry = $zip.GetEntry($name)
    if (!$entry) { throw "Missing ZIP entry: $name" }
    $reader = [IO.StreamReader]::new($entry.Open())
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}
function Compare-ZipFiles($zip, $prefix) {
    $count = 0
    foreach ($file in Get-ChildItem -LiteralPath $dist -File -Recurse) {
        $relative = $file.FullName.Substring($dist.Length + 1).Replace('\', '/')
        $entry = $zip.GetEntry("$prefix$relative")
        if (!$entry) { throw "Missing bundle file: $relative" }
        $stream = $entry.Open()
        $hash = [Security.Cryptography.SHA256]::Create()
        try { $actual = [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '') }
        finally { $stream.Dispose(); $hash.Dispose() }
        if ($actual -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash) { throw "Bundle hash mismatch: $relative" }
        $count++
    }
    return $count
}
$apk = [IO.Compression.ZipFile]::OpenRead($apkPath)
$ota = if (!$ApkOnly) { [IO.Compression.ZipFile]::OpenRead($otaPath) } else { $null }
try {
    $apkCount = Compare-ZipFiles $apk 'assets/public/'
    $otaCount = 'not packaged'
    if ($ota) {
        $otaCount = Compare-ZipFiles $ota ''
        foreach ($entry in $ota.Entries) {
            if ($entry.FullName -match '(^/|(^|/)\.\.(/|$)|\\|\.pem$|\.keystore$)') { throw 'Unsafe OTA ZIP entry.' }
        }
    }
    $config = Read-ZipText $apk 'assets/capacitor.config.json' | ConvertFrom-Json
    $trust = Get-Content (Join-Path $root 'src/data/updateTrust.json') -Raw | ConvertFrom-Json
    if ($config.android.adjustMarginsForEdgeToEdge -ne 'auto') { throw 'Android system-bar fitting is disabled.' }
    if ($config.plugins.LiveUpdate.publicKey -ne $trust.publicKey -or $config.plugins.LiveUpdate.readyTimeout -ne 30000 -or !$config.plugins.LiveUpdate.autoBlockRolledBackBundles -or $config.server.url) { throw 'Native OTA trust/rollback/origin configuration mismatch.' }
    $plugins = Read-ZipText $apk 'assets/capacitor.plugins.json'
    $dexContainsLiveUpdate = $false
    foreach ($entry in $apk.Entries | Where-Object { $_.FullName -match '^classes\d*\.dex$' }) {
        $reader = [IO.StreamReader]::new($entry.Open(), [Text.Encoding]::GetEncoding(28591))
        try { if ($reader.ReadToEnd().Contains('Lio/capawesome/capacitorjs/plugins/liveupdate/LiveUpdatePlugin;')) { $dexContainsLiveUpdate = $true } } finally { $reader.Dispose() }
    }
    if ($plugins -notmatch 'LiveUpdatePlugin' -and !$dexContainsLiveUpdate) { throw 'LiveUpdate native plugin missing from APK.' }
    "PASS APK web files: $apkCount; OTA files: $otaCount; signature, native plugin, rollback and origin"
} finally { $apk.Dispose(); if ($ota) { $ota.Dispose() } }
$artifacts = if ($ApkOnly) { @($apkPath) } else { @($apkPath, $otaPath) }
Get-FileHash -Algorithm SHA256 -LiteralPath $artifacts | Select-Object Path, Hash
