# Installs the VibeAssist git hooks in the current repository (Windows PowerShell):
#   pre-commit   scans the lines you're committing for secrets
#   post-commit  saves a local checkpoint (refs/vibe/checkpoints/<time>) you can rewind to
# Run from the repository root:  powershell -File path\to\vibeassist-engine\hooks\install.ps1
# Rewind with:  git switch -c rewind/<name> refs/vibe/checkpoints/<name>
$ErrorActionPreference = 'Stop'
$actionDir = Split-Path -Parent $PSScriptRoot
$hooksDir = git rev-parse --git-path hooks
New-Item -ItemType Directory -Force $hooksDir, '.vibeassist' | Out-Null
Copy-Item (Join-Path $actionDir 'scripts\scan-staged.mjs'), (Join-Path $actionDir 'scripts\secret-patterns.json') '.vibeassist\'

# Git for Windows runs hooks with its own sh, so the hooks themselves are shell scripts
$preCommit = "#!/usr/bin/env sh`nnode .vibeassist/scan-staged.mjs`n"
$postCommit = "#!/usr/bin/env sh`ngit update-ref `"refs/vibe/checkpoints/`$(date -u +%Y%m%d-%H%M%S)`" HEAD`n"
[System.IO.File]::WriteAllText((Join-Path $hooksDir 'pre-commit'), $preCommit)
[System.IO.File]::WriteAllText((Join-Path $hooksDir 'post-commit'), $postCommit)

if (-not (Select-String -Path .gitignore -Pattern '^\.vibeassist/$' -Quiet -ErrorAction SilentlyContinue)) {
  Add-Content .gitignore '.vibeassist/'
}
Write-Host 'VibeAssist hooks installed. List checkpoints with: git for-each-ref refs/vibe/checkpoints'
