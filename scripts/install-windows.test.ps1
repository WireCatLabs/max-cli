param([Parameter(Mandatory = $true)][string] $Tarball)
$ErrorActionPreference = 'Stop'
$testRoot = Join-Path $env:RUNNER_TEMP 'max ready install'
$prefix = Join-Path $testRoot 'npm prefix'
$secondPrefix = Join-Path $testRoot 'npm ignored scripts'
$env:CI = 'true'
$env:MAX_CONFIG_DIR = Join-Path $testRoot 'config'
$env:MAX_STATE_DIR = Join-Path $testRoot 'state'
$env:MAX_CACHE_DIR = Join-Path $testRoot 'cache'
$env:MESSAGING_STORE = Join-Path $testRoot 'messages.db'
$env:MAX_INSTALL_AGENT = 'all'
$env:MAX_NO_UPDATE_CHECK = '1'
$node = (Get-Command node | Select-Object -First 1).Source
$powershell = (Get-Command powershell.exe | Select-Object -First 1).Source
$nodeDirectory = Split-Path $node -Parent
$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
$sentinel = '%LOCALAPPDATA%\WireCat existing folder'
$key.SetValue('Path', $sentinel, [Microsoft.Win32.RegistryValueKind]::ExpandString)
$key.Dispose()
if (Get-Command max -ErrorAction SilentlyContinue) { throw 'Expected max to be absent before install.' }

# The actual packed npm lifecycle hook must persist PATH and install skills without login.
& npm.cmd install --global --prefix $prefix --allow-scripts=@leemour/max-cli --foreground-scripts $Tarball
if ($LASTEXITCODE -ne 0) { throw 'Packed global npm install failed.' }
$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')
$userPath = [string] $key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
$kind = $key.GetValueKind('Path')
$key.Dispose()
if (-not $userPath.Contains($sentinel) -or -not $userPath.Contains($prefix)) { throw 'User PATH was lost or not repaired.' }
if ($kind -ne [Microsoft.Win32.RegistryValueKind]::ExpandString) { throw 'PATH registry type changed.' }
foreach ($dir in @('.agents', '.claude')) {
    $file = Join-Path $env:USERPROFILE "$dir/skills/max-cli/SKILL.md"
    if (-not (Test-Path $file) -or (Get-Content $file -Raw) -notmatch 'name: max-cli') { throw 'Install did not install the skill.' }
}
if (Test-Path (Join-Path $prefix 'max.ps1')) { throw 'Unsigned PowerShell shim still shadows max.cmd.' }

# Rebuild PATH from persistent registry values, not the installer or npm process environment.
$env:Path = [Environment]::ExpandEnvironmentVariables("$([Environment]::GetEnvironmentVariable('Path', 'Machine'));$userPath")
& $powershell -NoProfile -ExecutionPolicy Restricted -Command 'max --version; if ($LASTEXITCODE -ne 0) { exit 1 }; max skill show | Out-Null; if ($LASTEXITCODE -ne 0) { exit 1 }'
if ($LASTEXITCODE -ne 0) { throw 'Fresh restricted PowerShell cannot run bare max.' }

$installer = Join-Path $prefix 'node_modules/@leemour/max-cli/install/windows.ps1'
$before = $userPath
& $installer -RepairOnly -Prefix $prefix -NodeDirectory $nodeDirectory -Json
if ($LASTEXITCODE -ne 0) { throw 'Repeated PATH repair failed.' }
$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')
$after = [string] $key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
$key.Dispose()
if ($before -cne $after) { throw 'Repeated repair duplicated or rewrote PATH.' }

# Explicit installer must complete even when npm lifecycle scripts are disabled.
$env:npm_config_ignore_scripts = 'true'
$result = & $installer -Prefix $secondPrefix -PackageSpec $Tarball -Agent codex -Json
if ($LASTEXITCODE -ne 0) { throw 'Installer did not handle disabled lifecycle scripts.' }
$result = ($result -join "`n") | ConvertFrom-Json
if ($result.tool -ne 'max' -or $result.written.Count -ne 1) { throw 'Installer result is incomplete.' }
& max --version
if ($LASTEXITCODE -ne 0) { throw 'Current shell cannot run bare max after installer.' }

# Windows' built-in PowerShell 5.1 must also complete npm installation despite stderr warnings.
Remove-Item Env:npm_config_ignore_scripts
$env:MAX_TEST_INSTALLER = $installer
$env:MAX_TEST_TARBALL = $Tarball
$env:MAX_TEST_PREFIX = Join-Path $testRoot 'npm Windows PowerShell 51'
$agentDirectory = if ($env:HOME) { $env:HOME } else { $env:USERPROFILE }
$claudeSkill = Join-Path $agentDirectory '.claude/skills/max-cli/SKILL.md'
$claudeTime = (Get-Item $claudeSkill).LastWriteTimeUtc
$code = '& $env:MAX_TEST_INSTALLER -Prefix $env:MAX_TEST_PREFIX -PackageSpec $env:MAX_TEST_TARBALL -Agent codex -Json'
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($code))
$native = & $powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand $encoded
if ($LASTEXITCODE -ne 0) { throw 'PowerShell 5.1 installation failed.' }
$native = ($native -join "`n") | ConvertFrom-Json
if ($native.tool -ne 'max' -or $native.written.Count -ne 1) { throw 'PowerShell 5.1 installer result is incomplete.' }
if ((Get-Item $claudeSkill).LastWriteTimeUtc -ne $claudeTime) { throw 'Codex-only installation rewrote the Claude skill.' }
Write-Output 'PASS: persistent/current PATH, restricted shell, skills, repeat, disabled scripts, full PowerShell 5.1 installation'
