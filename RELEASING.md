# Releasing Autopilot

This document describes how to release new versions of Autopilot with automatic updates.

## Prerequisites

### GitHub Secrets (One-time setup)

Go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret Name | Value |
|-------------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/autopilot.key` |

### Local Key Backup

Keep these files safe - if lost, you cannot sign future updates:

```
~/.tauri/autopilot.key      # Private key (NEVER share)
~/.tauri/autopilot.key.pub  # Public key
```

## Release Process

### 1. Update Version Numbers

Edit both files with the new version:

**src-tauri/tauri.conf.json**
```json
{
  "version": "0.2.0"
}
```

**package.json**
```json
{
  "version": "0.2.0"
}
```

### 2. Commit Changes

```bash
git add -A
git commit -m "chore: bump version to 0.2.0"
git push origin main
```

### 3. Create and Push Tag

```bash
git tag v0.2.0
git push origin v0.2.0
```

### 4. Wait for Build

GitHub Actions will automatically:
- Build for macOS (Intel + Apple Silicon)
- Build for Windows x64
- Build for Linux x64
- Sign all update artifacts
- Create a draft release

Monitor progress at: `https://github.com/sanxroz/autopilot/actions`

### 5. Publish Release

1. Go to **Releases** on GitHub
2. Find the draft release
3. Edit release notes if needed
4. Click **Publish release**

## Release Artifacts

Each release includes:

| Platform | Files |
|----------|-------|
| macOS (Apple Silicon) | `.dmg`, `.dmg.sig` |
| macOS (Intel) | `.dmg`, `.dmg.sig` |
| Windows | `.msi`, `.msi.sig`, `.exe`, `.exe.sig` |
| Linux | `.AppImage`, `.AppImage.sig`, `.deb` |
| Update Manifest | `latest.json` |

## How Updates Reach Users

1. App checks `https://github.com/sanxroz/autopilot/releases/latest/download/latest.json`
2. Compares remote version with installed version
3. If newer version exists, shows update notification
4. User downloads and installs update
5. App restarts with new version

## Versioning

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.1.0): New features, backwards compatible
- **PATCH** (0.0.1): Bug fixes

## Troubleshooting

### Build fails with signing error

Verify `TAURI_SIGNING_PRIVATE_KEY` secret is set correctly in GitHub.

### Users don't see updates

1. Check the release is published (not draft)
2. Verify `latest.json` exists in release assets
3. Check version in `tauri.conf.json` is higher than installed version

### Regenerate signing keys

If keys are compromised or lost:

```bash
npx tauri signer generate -w ~/.tauri/autopilot.key --ci
```

Then update:
1. GitHub secret with new private key
2. `tauri.conf.json` with new public key

**Warning**: Existing installations won't auto-update after key change.
