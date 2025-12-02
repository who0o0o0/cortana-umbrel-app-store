# Create GitHub repository and push Cortana Umbrel App
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Creating GitHub Repository & Pushing" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$username = Read-Host "Enter your GitHub username"
$repoName = "cortana-umbrel-app-store"
$repoUrl = "https://github.com/$username/$repoName"

Write-Host ""
Write-Host "We'll create the repository: $repoName" -ForegroundColor Yellow
Write-Host ""

# Check if we can use GitHub API
Write-Host "To create the repository automatically, we need a GitHub Personal Access Token." -ForegroundColor Yellow
Write-Host "You can create one at: https://github.com/settings/tokens/new" -ForegroundColor Cyan
Write-Host "Required scope: 'repo' (full control of private repositories)" -ForegroundColor Gray
Write-Host ""
$useAPI = Read-Host "Do you have a Personal Access Token? (y/n)"

if ($useAPI -eq "y" -or $useAPI -eq "Y") {
    $token = Read-Host "Enter your GitHub Personal Access Token" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($token)
    $plainToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    
    Write-Host ""
    Write-Host "Creating repository on GitHub..." -ForegroundColor Green
    
    $headers = @{
        "Authorization" = "token $plainToken"
        "Accept" = "application/vnd.github.v3+json"
    }
    
    $body = @{
        name = $repoName
        description = "Cortana Document Filler - Umbrel Community App Store"
        public = $true
        auto_init = $false
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method Post -Headers $headers -Body $body -ContentType "application/json"
        Write-Host "Repository created successfully!" -ForegroundColor Green
        Write-Host "Repository URL: $repoUrl" -ForegroundColor Cyan
    } catch {
        Write-Host "Failed to create repository via API: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please create it manually at: https://github.com/new" -ForegroundColor Yellow
        Write-Host "Repository name: $repoName" -ForegroundColor White
        Write-Host "Make it PUBLIC" -ForegroundColor White
        Write-Host ""
        $manual = Read-Host "Press Enter after you've created the repository"
    }
} else {
    Write-Host ""
    Write-Host "Please create the repository manually:" -ForegroundColor Yellow
    Write-Host "1. Go to: https://github.com/new" -ForegroundColor White
    Write-Host "2. Repository name: $repoName" -ForegroundColor White
    Write-Host "3. Make it PUBLIC" -ForegroundColor White
    Write-Host "4. DO NOT initialize with README/gitignore" -ForegroundColor White
    Write-Host "5. Click 'Create repository'" -ForegroundColor White
    Write-Host ""
    $manual = Read-Host "Press Enter after you've created the repository"
}

# Now push the code
Write-Host ""
Write-Host "Setting up git remote and pushing code..." -ForegroundColor Green

# Remove existing remote if it exists
git remote remove origin 2>$null

# Add remote
git remote add origin "$repoUrl.git"

# Rename branch to main
git branch -M main

# Push to GitHub
Write-Host ""
Write-Host "Pushing to GitHub..." -ForegroundColor Yellow
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
    Write-Host "You can also push manually with:" -ForegroundColor Yellow
    Write-Host "  git push -u origin main" -ForegroundColor White
    Write-Host ""
}

