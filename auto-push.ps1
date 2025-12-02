# Auto-push script for Cortana Umbrel App
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Cortana Umbrel App - Auto Push" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Prompt for repository URL
Write-Host "After creating the repository on GitHub, enter the repository URL below." -ForegroundColor Yellow
Write-Host "Example: https://github.com/yourusername/cortana-umbrel-app-store" -ForegroundColor Gray
Write-Host ""
$repoUrl = Read-Host "Enter your GitHub repository URL"

if ([string]::IsNullOrWhiteSpace($repoUrl)) {
    Write-Host "No URL provided. Exiting." -ForegroundColor Red
    exit
}

# Remove .git if present
$repoUrl = $repoUrl -replace '\.git$', ''

Write-Host ""
Write-Host "Setting up remote and pushing..." -ForegroundColor Green

# Remove existing remote if it exists
git remote remove origin 2>$null

# Add remote
git remote add origin "$repoUrl.git"

# Rename branch to main
git branch -M main

# Push to GitHub
Write-Host ""
Write-Host "Pushing to GitHub (you may be prompted for credentials)..." -ForegroundColor Yellow
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "SUCCESS! Your app is now on GitHub!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Repository URL: $repoUrl" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Go to Umbrel → Settings → App Store" -ForegroundColor White
    Write-Host "2. Click 'Add Community App Store'" -ForegroundColor White
    Write-Host "3. Enter this URL: $repoUrl" -ForegroundColor White
    Write-Host "4. Install 'Cortana Document Filler' from your app store" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "Push failed. Please check:" -ForegroundColor Red
    Write-Host "- Repository exists and is public" -ForegroundColor Yellow
    Write-Host "- You have push access" -ForegroundColor Yellow
    Write-Host "- Your credentials are correct" -ForegroundColor Yellow
    Write-Host ""
}

