# PowerShell script to set up Firebase SMTP secrets
# Prompts for the Gmail app password so it is never stored in this repo.

Write-Host "Setting up Firebase SMTP Secrets..." -ForegroundColor Green
Write-Host ""

$SMTP_USER = Read-Host "SMTP user (Gmail address) [uspeertutoring@gmail.com]"
if ([string]::IsNullOrWhiteSpace($SMTP_USER)) { $SMTP_USER = "uspeertutoring@gmail.com" }

$secure = Read-Host "Gmail app password (16 chars, spaces ok)" -AsSecureString
$SMTP_PASSWORD = [System.Net.NetworkCredential]::new("", $secure).Password
if ([string]::IsNullOrWhiteSpace($SMTP_PASSWORD)) {
    Write-Host "No password entered. Aborting." -ForegroundColor Red
    exit 1
}

# Create temporary files for secrets (no trailing newline)
$tempUserFile = [System.IO.Path]::GetTempFileName()
$tempPasswordFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tempUserFile, $SMTP_USER)
[System.IO.File]::WriteAllText($tempPasswordFile, $SMTP_PASSWORD)

try {
    Write-Host "Setting SMTP_USER secret..." -ForegroundColor Yellow
    firebase functions:secrets:set SMTP_USER --data-file $tempUserFile

    Write-Host "Setting SMTP_PASSWORD secret..." -ForegroundColor Yellow
    firebase functions:secrets:set SMTP_PASSWORD --data-file $tempPasswordFile

    Write-Host ""
    Write-Host "SMTP secrets configured." -ForegroundColor Green
    Write-Host "Next: firebase deploy --only functions" -ForegroundColor Cyan
}
finally {
    Remove-Item -Path $tempUserFile -ErrorAction SilentlyContinue
    Remove-Item -Path $tempPasswordFile -ErrorAction SilentlyContinue
}
