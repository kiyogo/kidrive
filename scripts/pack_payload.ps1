$ErrorActionPreference = "Stop"
$root = "e:\DATA\source\Nas\LocalDrive"
$staging = "$root\dist-payload"
$runner = "$root\localdrive\build\windows\x64\runner"
$installerDir = "$root\windows-installer"

Write-Host "Creating staging directory: $staging"
if (Test-Path $staging) {
    Remove-Item $staging -Recurse -Force
}
New-Item -ItemType Directory -Path $staging | Out-Null

Write-Host "Copying runner files..."
Copy-Item "$runner\*" -Destination $staging -Recurse -Force
if (Test-Path "$staging\CMakeFiles") {
    Remove-Item "$staging\CMakeFiles" -Recurse -Force
}

Write-Host "Copying server and icons..."
Copy-Item "$root\server\localdrive-server.exe" -Destination "$staging\localdrive-server.exe" -Force
Copy-Item "$installerDir\app_icon.ico" -Destination "$staging\app_icon.ico" -Force

$zipPath = "$installerDir\payload.zip"
Write-Host "Zipping payload into: $zipPath"
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Compress-Archive -Path "$staging\*" -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item $staging -Recurse -Force

$len = (Get-Item $zipPath).Length
Write-Host "Payload zip created successfully! Size: $len bytes"
