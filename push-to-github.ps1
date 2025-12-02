# PowerShell script to push Cortana Umbrel App to GitHub
# Run this after creating a GitHub repository

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Cortana Umbrel App - GitHub Push Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get GitHub username
$username = Read-Host "Enter your GitHub username"

# Get repository name
$repoName = Read-Host "Enter repository name (default: cortana-umbrel-app-store)"
if ([string]::IsNullOrWhiteSpace($repoName)) {
    $repoName = "cortana-umbrel-app-store"
}

# Construct GitHub URL
$githubUrl = "https://github.com/$username/$repoName"

Write-Host ""
Write-Host "Repository URL will be: $githubUrl" -ForegroundColor Yellow
Write-Host ""
Write-Host "IMPORTANT: Make sure you've created this repository on GitHub first!" -ForegroundColor Red
Write-Host "Go to: https://github.com/new" -ForegroundColor Yellow
Write-Host ""
$confirm = Read-Host "Have you created the repository? (y/n)"

if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "Please create the repository first, then run this script again." -ForegroundColor Red
    exit
}

# Add remote
Write-Host ""
Write-Host "Adding GitHub remote..." -ForegroundColor Green
git remote add origin $githubUrl 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Remote might already exist. Updating..." -ForegroundColor Yellow
    git remote set-url origin $githubUrl
}

# Rename branch to main
Write-Host "Renaming branch to main..." -ForegroundColor Green
git branch -M main

# Push to GitHub
Write-Host ""
Write-Host "Pushing to GitHub..." -ForegroundColor Green
Write-Host "You may be prompted for your GitHub credentials." -ForegroundColor Yellow
Write-Host ""
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Success! Your app is now on GitHub!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Add this URL to Umbrel: $githubUrl" -ForegroundColor White
    Write-Host "2. Go to Umbrel Settings → App Store → Add Community App Store" -ForegroundColor White
    Write-Host "3. Install 'Cortana Document Filler' from your app store" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "Push failed. Please check:" -ForegroundColor Red
    Write-Host "1. Repository exists on GitHub" -ForegroundColor Yellow
    Write-Host "2. You have push access" -ForegroundColor Yellow
    Write-Host "3. Your credentials are correct" -ForegroundColor Yellow
    Write-Host ""
}

