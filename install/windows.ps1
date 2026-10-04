param(
    [ValidateSet('max')][string] $Tool = 'max',
    [ValidateSet('all', 'codex', 'cursor', 'claude', 'gemini', 'none')][string] $Agent = 'all',
    [string] $Prefix,
    [string] $PackageSpec,
    [string] $NodeDirectory,
    [switch] $RepairOnly,
    [switch] $Json
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This installer is for Windows.' }

function Note([string] $Message) {
    if ($Json) { [Console]::Error.WriteLine($Message) } else { Write-Host $Message }
}

function NormalPath([string] $Value) {
    $expanded = [Environment]::ExpandEnvironmentVariables($Value.Trim().Trim('"'))
    return $expanded.TrimEnd('\', '/').ToLowerInvariant()
}

function ContainsPath([string] $Value, [string] $Directory) {
    $wanted = NormalPath $Directory
    foreach ($entry in ($Value -split ';')) {
        if ($entry.Trim() -and (NormalPath $entry) -eq $wanted) { return $true }
    }
    return $false
}

function AddUserPaths([string[]] $Directories) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
    try {
        $old = [string] $key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        $kind = [Microsoft.Win32.RegistryValueKind]::ExpandString
        if ($key.GetValueNames() -contains 'Path') { $kind = $key.GetValueKind('Path') }
        $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
        $updated = $old
        $added = @()
        foreach ($directory in $Directories) {
            if (-not (ContainsPath "$machine;$updated" $directory)) {
                $updated = if ($updated) { "$directory;$updated" } else { $directory }
                $added += $directory
            }
            $remaining = ($env:Path -split ';') | Where-Object { (NormalPath $_) -ne (NormalPath $directory) }
            $env:Path = "$directory;" + ($remaining -join ';')
        }
        if ($updated.Length -gt 32767) { throw 'User PATH is too long to add the CLI safely.' }
        if ($updated -ne $old) { $key.SetValue('Path', $updated, $kind) }
    } finally { $key.Dispose() }
    if ($added.Count) {
        if (-not ('WireCat.EnvironmentChange' -as [type])) {
            Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace WireCat {
  public class EnvironmentChange {
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr SendMessageTimeout(IntPtr window, uint message,
      UIntPtr wParam, string lParam, uint flags, uint timeout, out UIntPtr result);
  }
}
'@
        }
        $result = [UIntPtr]::Zero
        $null = [WireCat.EnvironmentChange]::SendMessageTimeout([IntPtr] 0xffff, 0x1a,
            [UIntPtr]::Zero, 'Environment', 2, 2000, [ref] $result)
    }
    return $added
}

function RemoveGeneratedPowerShellShim([string] $Directory) {
    $script = Join-Path $Directory "$Tool.ps1"
    if (Test-Path -LiteralPath $script) {
        $content = (Get-Content -LiteralPath $script -Raw).Replace('\', '/')
        if (-not $content.Contains("node_modules/@leemour/$Tool-cli/dist/bin/$Tool.js")) {
            throw "An unrelated $Tool.ps1 exists in the npm prefix; it was left untouched."
        }
        # npm's .cmd launcher works even when PowerShell refuses unsigned .ps1 scripts.
        Remove-Item -LiteralPath $script
    }
}

$node = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
if (-not $NodeDirectory) { $NodeDirectory = Split-Path $node -Parent }
if (-not $Prefix) {
    $npm = (Get-Command npm.cmd -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $Prefix = (& $npm prefix -g | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Could not determine the npm installation folder.' }
}
$Prefix = [IO.Path]::GetFullPath($Prefix)
if ($Prefix.Contains(';') -or $NodeDirectory.Contains(';')) { throw 'Installation folders cannot contain a semicolon.' }

if (-not $RepairOnly) {
    $nodeVersion = (& $node --version | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.(\d+)\.') { throw 'Could not read the Node.js version.' }
    $major = [int] $Matches[1]
    $minor = [int] $Matches[2]
    if (-not ($major -ge 24 -or ($major -eq 22 -and $minor -ge 16))) {
        throw 'Node.js 22.16+ or 24+ is required. Install a supported Node.js release first.'
    }
    $npm = (Get-Command npm.cmd -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $package = "@leemour/$Tool-cli"
    if (-not $PackageSpec) { $PackageSpec = $package }
    Note "1/3 Installing $package..."
    $savedPreference = $ErrorActionPreference
    $savedAgent = $env:MAX_INSTALL_AGENT
    try {
        # PowerShell 5.1 turns redirected native warnings into errors; npm's exit code decides success.
        $ErrorActionPreference = 'Continue'
        $env:MAX_INSTALL_AGENT = $Agent
        $log = & $npm install --global --prefix $Prefix "--allow-scripts=$package" --foreground-scripts $PackageSpec 2>&1
        $installExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $savedPreference
        $env:MAX_INSTALL_AGENT = $savedAgent
    }
    foreach ($line in $log) { Note ([string] $line) }
    if ($installExit -ne 0) { throw 'npm installation failed; PATH was not changed.' }
}

$shim = Join-Path $Prefix "$Tool.cmd"
if (-not (Test-Path -LiteralPath $shim)) { throw "The installation did not create $Tool.cmd." }
$added = @(AddUserPaths @($NodeDirectory, $Prefix))
RemoveGeneratedPowerShellShim $Prefix

if ($RepairOnly) {
    if ($Json) { @{ tool = $Tool; prefix = $Prefix; pathAdded = $added } | ConvertTo-Json -Compress }
    exit 0
}

Note '2/3 PATH is ready in this terminal and saved for future terminals.'
$version = (& $shim --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'The installed CLI could not start.' }
$written = @()
if ($Agent -ne 'none') {
    Note "3/3 Installing agent instructions ($Agent)..."
    $target = if ($Agent -eq 'all') { 'all' } elseif ($Agent -eq 'claude') { 'claude' } else { 'agents' }
    $skillJson = & $shim skill install --for $target --json
    if ($LASTEXITCODE -ne 0) { throw 'Agent skill installation failed.' }
    $skill = ($skillJson -join "`n") | ConvertFrom-Json
    $written = @($skill.written)
    if (-not $written.Count) { throw 'Agent skill installation wrote no instructions.' }
    foreach ($file in $written) {
        if (-not (Test-Path -LiteralPath $file)) { throw 'An installed agent skill could not be found.' }
    }
}

$resolved = Get-Command $Tool -CommandType Application -ErrorAction Stop | Select-Object -First 1
if ([IO.Path]::GetFullPath($resolved.Source) -ne [IO.Path]::GetFullPath($shim)) {
    throw "Another $Tool command shadows this installation on PATH."
}
$directVersion = (& $Tool --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $directVersion -ne $version) { throw "Bare $Tool did not start the installed version." }
Note "$Tool $version is ready. Agent: read '$Tool skill show' before login; the skill is already installed."
Note 'Account login is the next step; the owner enters codes or scans the QR locally.'
if ($Json) {
    @{ tool = $Tool; version = $version; prefix = $Prefix; pathAdded = $added;
       agent = $Agent; written = $written; instructions = "$Tool skill show" } | ConvertTo-Json -Compress
}
