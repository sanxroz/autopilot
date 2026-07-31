---
source_name: animations.dev (Emil's Design Engineering skill)
source_url: https://animations.dev
installer_url: https://animations.dev/api/activate-design-engineering?email=<maintainer-email>
last_reviewed: 2026-04-16
---

# Upstream: animations.dev Design Engineering skill

Canonical copy in this repo: `.agents/skills/emil-design-engineering/`.

- **Source site:** https://animations.dev
- **Installer endpoint:** `https://animations.dev/api/activate-design-engineering?email=<maintainer-email>` (URL-encode the address when you substitute a real email)
- **Observed installer target on this machine:** `~/.cursor/skills/emil-design-engineering/`
- **Installed slug:** `emil-design-engineering`

## Refresh from upstream

1. Download the installer without executing it: `curl --fail --show-error --location "https://animations.dev/api/activate-design-engineering?email=<maintainer-email>" --output /tmp/emil-design-engineering-installer.sh`.
2. Review `/tmp/emil-design-engineering-installer.sh`, then run the reviewed local file. The installer currently writes to `~/.cursor/skills/emil-design-engineering/`.
3. Copy the updated skill files into `.agents/skills/emil-design-engineering/`, preserving this `references/upstream.md` file.
4. Review the update with `git diff --check` and `git diff -- .agents/skills/emil-design-engineering/`.

## Repo-specific notes to preserve after refresh

- Keep this `references/upstream.md` file in place.
