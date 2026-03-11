param(
  [string]$ProjectRef = $(if ($env:SUPABASE_PROJECT_REF) { $env:SUPABASE_PROJECT_REF } else { $env:SUPABASE_REF }),
  [string]$DbPassword = $env:SUPABASE_DB_PASSWORD
)

$ErrorActionPreference = "Stop"

if (-not $ProjectRef) {
  Write-Host "Project ref is required." -ForegroundColor Yellow
  Write-Host "Usage: .\\scripts\\supabase\\refresh-weekly-agg-mv.ps1 -ProjectRef <project_ref> -DbPassword <db_password>" -ForegroundColor Yellow
  exit 1
}

if (-not $DbPassword) {
  Write-Host "DB password is required." -ForegroundColor Yellow
  Write-Host "Usage: .\\scripts\\supabase\\refresh-weekly-agg-mv.ps1 -ProjectRef <project_ref> -DbPassword <db_password>" -ForegroundColor Yellow
  exit 1
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  Write-Host "psql not found. Install PostgreSQL client first." -ForegroundColor Yellow
  exit 1
}

$env:PGPASSWORD = $DbPassword
$sqlPath = Join-Path $PSScriptRoot "..\\..\\supabase\\sql\\refresh_weekly_agg_mv.sql"

psql "host=db.$ProjectRef.supabase.co port=5432 dbname=postgres user=postgres sslmode=require" -v ON_ERROR_STOP=1 -f $sqlPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[supabase] weekly_agg_mv rebuild done." -ForegroundColor Green
