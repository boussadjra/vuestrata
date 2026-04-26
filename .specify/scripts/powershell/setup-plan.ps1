# setup-plan.ps1 — Copy plan template into the feature directory
#
# Usage:
#   .specify/scripts/powershell/setup-plan.ps1 [-Json]

param(
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$paths = Get-FeaturePathsEnv

if (-not (Test-Path $paths.FEATURE_DIR -PathType Container)) {
    Write-Error "Feature directory not found: $($paths.FEATURE_DIR)"
    Write-Error "Run /speckit.specify first."
    exit 1
}

# Copy plan template
$template = Join-Path $paths.REPO_ROOT '.specify/templates/plan-template.md'
if (Test-Path $template) {
    Copy-Item $template $paths.IMPL_PLAN -Force
    Write-Output "Copied plan template to $($paths.IMPL_PLAN)"
} else {
    Write-Warning "Plan template not found at $template"
    New-Item -ItemType File -Path $paths.IMPL_PLAN -Force | Out-Null
}

if ($Json) {
    [PSCustomObject]@{
        FEATURE_SPEC = $paths.FEATURE_SPEC
        IMPL_PLAN    = $paths.IMPL_PLAN
        SPECS_DIR    = $paths.FEATURE_DIR
        BRANCH       = $paths.CURRENT_BRANCH
        HAS_GIT      = $paths.HAS_GIT
    } | ConvertTo-Json -Compress
} else {
    Write-Output "FEATURE_SPEC: $($paths.FEATURE_SPEC)"
    Write-Output "IMPL_PLAN: $($paths.IMPL_PLAN)"
    Write-Output "SPECS_DIR: $($paths.FEATURE_DIR)"
    Write-Output "BRANCH: $($paths.CURRENT_BRANCH)"
    Write-Output "HAS_GIT: $($paths.HAS_GIT)"
}
