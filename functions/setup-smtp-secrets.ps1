# PowerShell script to set up Firebase SMTP secrets
# This script configures the required secrets for email functionality

Write-Host "Setting up Firebase SMTP Secrets..." -ForegroundColor Green
Write-Host ""

# SMTP credentials
$SMTP_USER = "uspeertutoring@gmail.com"
$SMTP_PASSWORD = "teiy zvdm uplv ddnv"

# Create temporary files for secrets
$tempUserFile = [System.IO.Path]::GetTempFileName()
$tempPasswordFile = [System.IO.Path]::GetTempFileName()

# Write secrets to temp files (no newline)
[System.IO.File]::WriteAllText($tempUserFile, $SMTP_USER)
[System.IO.File]::WriteAllText($tempPasswordFile, $SMTP_PASSWORD)

try {
    Write-Host "Setting SMTP_USER secret..." -ForegroundColor Yellow
    firebase functions:secrets:set SMTP_USER --data-file $tempUserFile

    Write-Host "Setting SMTP_PASSWORD secret..." -ForegroundColor Yellow
    firebase functions:secrets:set SMTP_PASSWORD --data-file $tempPasswordFile

    Write-Host ""
    Write-Host "✅ SMTP secrets configured successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Deploy your functions: firebase deploy --only functions" -ForegroundColor White
    Write-Host "2. The email system will now use SMTP instead of OAuth" -ForegroundColor White
}
finally {
    # Clean up temp files
    Remove-Item -Path $tempUserFile -ErrorAction SilentlyContinue
    Remove-Item -Path $tempPasswordFile -ErrorAction SilentlyContinue
}

