# Spec Kit Helper Scripts — Vuestrata
#
# Shared functions used by all spec-kit PowerShell scripts.
# Sourced from: .specify/scripts/powershell/common.ps1

function Get-RepoRoot {
    if (Get-Command git -ErrorAction SilentlyContinue) {
        try {
            $root = git rev-parse --show-toplevel 2>$null
            if ($LASTEXITCODE -eq 0 -and $root) {
                return $root.Trim()
            }
        } catch { }
    }

    # Fallback: walk up looking for .specify/ or .git/
    $current = Get-Location
    while ($true) {
        if ((Test-Path (Join-Path $current '.specify')) -or (Test-Path (Join-Path $current '.git'))) {
            return $current.ToString()
        }
        $parent = Split-Path $current -Parent
        if ($parent -eq $current) { return $null }
        $current = $parent
    }
}

function Get-CurrentBranch {
    try {
        $branch = git rev-parse --abbrev-ref HEAD 2>$null
        if ($LASTEXITCODE -eq 0) { return $branch.Trim() }
    } catch { }
    return 'main'
}

function Test-HasGit {
    try {
        git rev-parse --git-dir 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } catch { return $false }
}

function Test-FeatureBranch {
    param([string]$Branch)
    if (-not (Test-HasGit)) {
        Write-Warning '[specify] Git repository not detected; skipped branch validation'
        return $true
    }
    if ($Branch -notmatch '^\d{3}-') {
        Write-Output "ERROR: Not on a feature branch. Current branch: $Branch"
        Write-Output "Feature branches should be named like: 001-feature-name"
        return $false
    }
    return $true
}

function Get-FeatureDir {
    param([string]$RepoRoot, [string]$Branch)
    Join-Path $RepoRoot "specs/$Branch"
}

function Get-FeaturePathsEnv {
    $repoRoot  = Get-RepoRoot
    $branch    = Get-CurrentBranch
    $hasGit    = Test-HasGit
    $featureDir = Get-FeatureDir -RepoRoot $repoRoot -Branch $branch

    [PSCustomObject]@{
        REPO_ROOT      = $repoRoot
        CURRENT_BRANCH = $branch
        HAS_GIT        = $hasGit
        FEATURE_DIR    = $featureDir
        FEATURE_SPEC   = Join-Path $featureDir 'spec.md'
        IMPL_PLAN      = Join-Path $featureDir 'plan.md'
        TASKS          = Join-Path $featureDir 'tasks.md'
        RESEARCH       = Join-Path $featureDir 'research.md'
        DATA_MODEL     = Join-Path $featureDir 'data-model.md'
        QUICKSTART     = Join-Path $featureDir 'quickstart.md'
        CONTRACTS_DIR  = Join-Path $featureDir 'contracts'
    }
}
