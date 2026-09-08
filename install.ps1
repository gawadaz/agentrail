<#
  AgentRail skill installer (Windows / PowerShell).
    irm https://raw.githubusercontent.com/gawadaz/agentrail/main/install.ps1 | iex
    & ([scriptblock]::Create((irm https://raw.githubusercontent.com/gawadaz/agentrail/main/install.ps1))) -Global
#>
[CmdletBinding()]
param(
  [switch]$Global,
  [string]$Version = 'latest'
)

$ErrorActionPreference = 'Stop'
$repo = 'gawadaz/agentrail'

if ($env:AGENTRAIL_SKILL_DIR) {
  $target = $env:AGENTRAIL_SKILL_DIR
} elseif ($Global) {
  $target = Join-Path $HOME '.claude/skills/agentrail'
} else {
  $target = Join-Path (Get-Location) '.claude/skills/agentrail'
}

# Node check - warn, do not abort.
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  $major = [int](& node -p 'process.versions.node.split(".")[0]')
  if ($major -lt 18) {
    Write-Warning "Node $(& node -v) detected; AgentRail needs Node >= 18 to run."
  }
} else {
  Write-Warning 'Node.js not found on PATH; AgentRail needs Node >= 18 to run.'
}

if ($Version -eq 'latest') {
  $url = "https://github.com/$repo/releases/latest/download/agentrail-skill.tar.gz"
} else {
  $url = "https://github.com/$repo/releases/download/$Version/agentrail-skill.tar.gz"
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("agentrail-" + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$archive = Join-Path $tmp 'skill.tar.gz'

try {
  Write-Host "Downloading AgentRail skill ($Version)..."
  try {
    Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
  } catch {
    Write-Error "Failed to download $url. Check the version exists at https://github.com/$repo/releases"
    exit 1
  }

  if (Test-Path $target) { Remove-Item -Recurse -Force $target }
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  & tar -xzf $archive -C $target
  if ($LASTEXITCODE -ne 0) { Write-Error 'tar extraction failed'; exit 1 }
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

Write-Host "Installed AgentRail skill to $target"
Write-Host ''
Write-Host 'Next steps:'
Write-Host '  1. Reload Claude Code so it picks up the new skill.'
Write-Host '  2. Ask Claude: "set up an AgentRail workflow" or "run my feature workflow".'
Write-Host ''
Write-Host "Uninstall: Remove-Item -Recurse -Force `"$target`""
