# create-new-feature.ps1 — Create a new spec feature directory and branch
#
# Usage:
#   .specify/scripts/powershell/create-new-feature.ps1 "feature description" [-Json]

param(
    [Parameter(Position = 0)]
    [string]$Description,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$repoRoot = Get-RepoRoot
if (-not $repoRoot) {
    Write-Error 'Could not determine repository root.'
    exit 1
}

Set-Location $repoRoot
$specsDir = Join-Path $repoRoot 'specs'
if (-not (Test-Path $specsDir)) { New-Item -ItemType Directory -Path $specsDir -Force | Out-Null }

# Determine the next feature number
$highest = 0
if (Test-Path $specsDir) {
    Get-ChildItem -Path $specsDir -Directory | ForEach-Object {
        if ($_.Name -match '^(\d+)') {
            $num = [int]$Matches[1]
            if ($num -gt $highest) { $highest = $num }
        }
    }
}
$featureNum = ($highest + 1).ToString('D3')

# Generate branch name from description
function New-BranchName {
    param([string]$Desc, [string]$Num)
    $stopWords = @('a','an','the','and','or','but','in','on','at','to','for','of','with','by','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','shall','should','may','might','can','could','i','you','we','they','it','this','that','these','those','my','your','our')
    $words = ($Desc -replace '[^a-zA-Z0-9\s]', '' -split '\s+') |
        Where-Object { $_ -and $_.ToLower() -notin $stopWords } |
        Select-Object -First 4
    $slug = ($words -join '-').ToLower()
    if (-not $slug) { $slug = 'feature' }
    "$Num-$slug"
}

$branchName = New-BranchName -Desc $Description -Num $featureNum
$hasGit = Test-HasGit

if ($hasGit) {
    try {
        git checkout -b $branchName 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "[specify] Branch '$branchName' may already exist; continuing on current branch."
        }
    } catch {
        Write-Warning "[specify] Could not create branch: $_"
    }
} else {
    Write-Warning "[specify] Git not detected; skipped branch creation for $branchName"
}

$featureDir = Join-Path $specsDir $branchName
New-Item -ItemType Directory -Path $featureDir -Force | Out-Null

# Copy spec template
$template = Join-Path $repoRoot '.specify/templates/spec-template.md'
$specFile = Join-Path $featureDir 'spec.md'
if (Test-Path $template) {
    Copy-Item $template $specFile -Force
} else {
    New-Item -ItemType File -Path $specFile | Out-Null
}

$env:SPECIFY_FEATURE = $branchName

if ($Json) {
    [PSCustomObject]@{
        BRANCH_NAME = $branchName
        SPEC_FILE   = $specFile
        FEATURE_NUM = $featureNum
        HAS_GIT     = $hasGit
    } | ConvertTo-Json -Compress
} else {
    Write-Output "BRANCH_NAME: $branchName"
    Write-Output "SPEC_FILE: $specFile"
    Write-Output "FEATURE_NUM: $featureNum"
    Write-Output "HAS_GIT: $hasGit"
}
