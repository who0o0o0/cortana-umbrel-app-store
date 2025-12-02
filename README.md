# Cortana Umbrel App Store

This is a Community App Store for Umbrel containing the Cortana Document Filler application.

## Structure

```
.
├── umbrel-app-store.yml          # App store configuration
└── cortana-document-filler/      # The Cortana app
    ├── umbrel-app.yml            # App metadata
    ├── docker-compose.yml        # Docker services configuration
    ├── Dockerfile                # Docker image definition
    └── ...                       # Application files
```

## How to Use This App Store

1. **Push this repository to GitHub** (or your preferred Git hosting service)

2. **Add the App Store to Umbrel**:
   - Open your Umbrel dashboard
   - Go to Settings → App Store
   - Click "Add Community App Store"
   - Enter the GitHub URL of this repository (e.g., `https://github.com/yourusername/cortana-umbrel-app-store`)

3. **Install the App**:
   - Navigate to the App Store in Umbrel
   - Find "Cortana Document Filler" in the Community App Store
   - Click Install

## App Store Configuration

The `umbrel-app-store.yml` file defines:
- **id**: `cortana` - Unique identifier for this app store
- **name**: `Cortana App Store` - Display name in Umbrel

## App Configuration

The `cortana-document-filler/umbrel-app.yml` file contains:
- App metadata (name, description, version)
- Port configuration (3000)
- Category and other display information

## Customization

Before publishing, you may want to update:
- Repository URL in `cortana-document-filler/umbrel-app.yml`
- Icon URL (if you have one hosted)
- App store name and ID in `umbrel-app-store.yml`

## Notes

- The app runs on port 3000 by default
- The PDF converter server runs on port 3002
- All data is processed locally - no external API calls
- The app requires Node.js 18+ and builds the frontend during Docker image creation

