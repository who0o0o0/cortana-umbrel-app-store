# Push to GitHub - Quick Guide

Your Umbrel app is ready! Follow these steps to push it to GitHub:

## Option 1: Using GitHub Website (Easiest)

1. **Create a new repository on GitHub:**
   - Go to https://github.com/new
   - Repository name: `cortana-umbrel-app-store` (or any name you prefer)
   - Make it **Public** (required for Umbrel Community App Stores)
   - **Don't** initialize with README, .gitignore, or license (we already have these)
   - Click "Create repository"

2. **Push your code:**
   Run these commands in PowerShell (you're already in the right directory):

```powershell
git remote add origin https://github.com/YOUR_USERNAME/cortana-umbrel-app-store.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

## Option 2: Using GitHub Desktop

1. Open GitHub Desktop
2. File → Add Local Repository
3. Browse to: `C:\Users\krist\OneDrive\Desktop\Umbrel App`
4. Click "Publish repository" button
5. Name it `cortana-umbrel-app-store`
6. Make sure "Keep this code private" is **unchecked** (must be public)
7. Click "Publish repository"

## After Pushing to GitHub

1. **Add to Umbrel:**
   - Open your Umbrel dashboard
   - Go to **Settings** → **App Store**
   - Click **"Add Community App Store"**
   - Enter your GitHub URL: `https://github.com/YOUR_USERNAME/cortana-umbrel-app-store`
   - Click **Add**

2. **Install the App:**
   - Go to the **App Store** in Umbrel
   - Find **"Cortana Document Filler"** in your Community App Store
   - Click **Install**

## Your Repository URL Format

Once pushed, your repository URL will be:
```
https://github.com/YOUR_USERNAME/cortana-umbrel-app-store
```

Use this exact URL when adding the Community App Store to Umbrel.

