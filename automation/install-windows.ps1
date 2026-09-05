param(
  [Parameter(Mandatory=$true)][string]$PrivateDirectory,
  [Parameter(Mandatory=$true)][string]$NodePath
)
$ErrorActionPreference = 'Stop'
$tjRepository = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$tjDirectory = (Resolve-Path -LiteralPath $PrivateDirectory).Path
$tjEnvironment = Join-Path $tjDirectory 'collector.env'
if (-not (Test-Path -LiteralPath $tjEnvironment)) { throw 'collector.env is required' }
if (-not (Test-Path -LiteralPath $NodePath)) { throw 'Node.js executable is required' }
$tjTaskName = 'TradeJournal-Toss-Collector'
function Quote-TjLiteral([string]$Value) { return "'" + $Value.Replace("'", "''") + "'" }
# Only fixed executable/config paths appear in the action; no API credentials.
$tjArguments = '--env-file="' + $tjEnvironment + '" "' + (Join-Path $tjRepository 'automation\toss\collect.mjs') + '" --watch'
$tjCommand = '$tjChild = Start-Process -FilePath ' + (Quote-TjLiteral $NodePath) +
  ' -ArgumentList ' + (Quote-TjLiteral $tjArguments) +
  ' -WorkingDirectory ' + (Quote-TjLiteral $tjRepository) +
  ' -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput ' + (Quote-TjLiteral (Join-Path $tjDirectory 'collector.log')) +
  ' -RedirectStandardError ' + (Quote-TjLiteral (Join-Path $tjDirectory 'collector-error.log')) + '; exit $tjChild.ExitCode'
# Quoting is literal PowerShell syntax. Escaping double quotes preserves the nested native arguments.
$tjActionArguments = '-NoProfile -NonInteractive -WindowStyle Hidden -Command "' + $tjCommand.Replace('"', '\"') + '"'
$tjAction = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument $tjActionArguments
$tjUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$tjTrigger = New-ScheduledTaskTrigger -AtLogOn -User $tjUser
$tjPrincipal = New-ScheduledTaskPrincipal -UserId $tjUser -LogonType Interactive -RunLevel Limited
$tjSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$tjExisting = Get-ScheduledTask -TaskName $tjTaskName -ErrorAction SilentlyContinue
if ($tjExisting -and $tjExisting.Description -notlike 'Trade journal PC collector*') {
  throw 'An unrelated task already uses this name; nothing was changed.'
}
if ($tjExisting -and $tjExisting.State -eq 'Running') { throw 'Collector is already running; stop it before reinstalling.' }
Register-ScheduledTask -TaskName $tjTaskName -Action $tjAction -Trigger $tjTrigger -Principal $tjPrincipal `
  -Settings $tjSettings -Description 'Trade journal PC collector: read-only Toss history and private cloud sync every five minutes.' -Force | Out-Null
Start-ScheduledTask -TaskName $tjTaskName
Get-ScheduledTask -TaskName $tjTaskName | Select-Object TaskName,State
