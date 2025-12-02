# Quick push script
$username = Read-Host "Enter your GitHub username"
$repoName = "cortana-umbrel-app-store"
$repoUrl = "https://github.com/$username/$repoName"

Write-Host "`nSetting up remote: $repoUrl" -ForegroundColor Green
git remote remove origin 2>$null
git remote add origin "$repoUrl.git"
git branch -M main

Write-Host "`nPushing to GitHub..." -ForegroundColor Yellow
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ SUCCESS! Repository: $repoUrl" -ForegroundColor Green
} else {
    Write-Host "`n❌ Push failed. Make sure:" -ForegroundColor Red
    Write-Host "   1. Repository exists at: $repoUrl" -ForegroundColor Yellow
    Write-Host "   2. Repository is PUBLIC" -ForegroundColor Yellow
    Write-Host "   3. You have push access" -ForegroundColor Yellow
}

