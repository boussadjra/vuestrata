# check-prerequisites.ps1 — Verify spec-kit prerequisite files exist
#
# Usage:
#   .specify/scripts/powershell/check-prerequisites.ps1 [-Json] [-PathsOnly] [-RequireTasks]

param(
    [switch]$Json,
    [switch]$PathsOnly,
    [switch]$RequireTasks
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$paths = Get-FeaturePathsEnv

if ($PathsOnly) {
    if ($Json) {
        $paths | Select-Object FEATURE_DIR, FEATURE_SPEC, IMPL_PLAN, TASKS, CURRENT_BRANCH |
            ConvertTo-Json -Compress
    } else {
        Write-Output "BRANCH: $($paths.CURRENT_BRANCH)"
        Write-Output "FEATURE_DIR: $($paths.FEATURE_DIR)"
        Write-Output "FEATURE_SPEC: $($paths.FEATURE_SPEC)"
        Write-Output "IMPL_PLAN: $($paths.IMPL_PLAN)"
        Write-Output "TASKS: $($paths.TASKS)"
    }
    exit 0
}

# Validate required directories and files
if (-not (Test-Path $paths.FEATURE_DIR -PathType Container)) {
    Write-Output "ERROR: Feature directory not found: $($paths.FEATURE_DIR)"
    Write-Output "Run /speckit.specify first to create the feature structure."
    exit 1
}

if (-not (Test-Path $paths.IMPL_PLAN -PathType Leaf)) {
    Write-Output "ERROR: plan.md not found in $($paths.FEATURE_DIR)"
    Write-Output "Run /speckit.plan first to create the implementation plan."
    exit 1
}

if ($RequireTasks -and -not (Test-Path $paths.TASKS -PathType Leaf)) {
    Write-Output "ERROR: tasks.md not found in $($paths.FEATURE_DIR)"
    Write-Output "Run /speckit.tasks first to create the task list."
    exit 1
}

# Build list of available documents
$docs = @()
if (Test-Path $paths.RESEARCH)    { $docs += 'research.md' }
if (Test-Path $paths.DATA_MODEL)  { $docs += 'data-model.md' }
if ((Test-Path $paths.CONTRACTS_DIR) -and (Get-ChildItem $paths.CONTRACTS_DIR -ErrorAction SilentlyContinue)) {
    $docs += 'contracts/'
}
if (Test-Path $paths.QUICKSTART)  { $docs += 'quickstart.md' }
if (-not $RequireTasks -and (Test-Path $paths.TASKS)) { $docs += 'tasks.md' }

if ($Json) {
    [PSCustomObject]@{
        FEATURE_DIR    = $paths.FEATURE_DIR
        FEATURE_SPEC   = $paths.FEATURE_SPEC
        IMPL_PLAN      = $paths.IMPL_PLAN
        TASKS          = $paths.TASKS
        BRANCH         = $paths.CURRENT_BRANCH
        HAS_GIT        = $paths.HAS_GIT
        AVAILABLE_DOCS = $docs
    } | ConvertTo-Json -Compress
} else {
    Write-Output "FEATURE_DIR: $($paths.FEATURE_DIR)"
    Write-Output "AVAILABLE_DOCS: $($docs -join ', ')"
}
