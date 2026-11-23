param(
    [string]$Directory,
    [ValidateRange(1, 3650)][int]$RetentionDays
)

$ErrorActionPreference = 'Stop'
$runtime = Join-Path $env:LOCALAPPDATA 'AnimalShelterMySQL'
$keyFile = Join-Path $runtime 'backup.key'
$settingsFile = Join-Path $runtime 'backup-settings.json'
$legacyDirectory = Join-Path $runtime 'system-backups'
if (-not (Test-Path -LiteralPath (Join-Path $runtime 'credentials.json') -PathType Leaf)) {
    throw '找不到本机数据库配置。请先按部署说明配置拾光守护。'
}

$settings = @{}
if (Test-Path -LiteralPath $settingsFile -PathType Leaf) {
    $previous = Get-Content -LiteralPath $settingsFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not ($previous -is [pscustomobject])) { throw '备份配置格式无效，请先核对原配置。' }
    foreach ($property in $previous.PSObject.Properties) { $settings[$property.Name] = $property.Value }
}
$previousDirectory = $settings['directory']
if ($PSBoundParameters.ContainsKey('Directory')) {
    if ($Directory -notmatch '^[a-zA-Z]:[\\/]') { throw '请输入本机磁盘的完整目录，例如 D:\拾光守护备份。' }
    $fullDirectory = [IO.Path]::GetFullPath($Directory)
    $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($fullDirectory))
    if ($drive.DriveType -notin @([IO.DriveType]::Fixed, [IO.DriveType]::Removable) -or -not $drive.IsReady) {
        throw '请选择已连接的本机磁盘或可移动硬盘。'
    }
    $settings['directory'] = $fullDirectory
}
if ($PSBoundParameters.ContainsKey('RetentionDays')) { $settings['retentionDays'] = $RetentionDays }

$serverDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'server'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$validator = Join-Path $serverDirectory 'backup-paths.js'
$configuredDirectory = if ($settings['directory']) { $settings['directory'] } else { $legacyDirectory }
$activeKey = if ($env:SHELTER_BACKUP_KEY_FILE) { $env:SHELTER_BACKUP_KEY_FILE } else { $keyFile }
foreach ($root in @($configuredDirectory, $env:SHELTER_BACKUP_ROOT) | Where-Object { $_ } | Select-Object -Unique) {
    & $node $validator $runtime $serverDirectory $root $activeKey
    if ($LASTEXITCODE -ne 0) { throw '备份路径校验未通过，原配置已保留。' }
}

if (Test-Path -LiteralPath $keyFile) {
    if (-not (Test-Path -LiteralPath $keyFile -PathType Leaf)) { throw '密钥位置被非文件占用，请核对本机配置。' }
    Write-Host '已有本机备份密钥，已保留。'
} else {
    foreach ($root in @($legacyDirectory, $previousDirectory, $settings['directory'], $env:SHELTER_BACKUP_ROOT) | Where-Object { $_ } | Select-Object -Unique) {
        if (Test-Path -LiteralPath $root -PathType Container) {
            foreach ($item in Get-ChildItem -LiteralPath $root -Directory) {
                if (Test-Path -LiteralPath (Join-Path $item.FullName 'contents.enc') -PathType Leaf) {
                    throw '发现已有加密备份。请找回原密钥并放回本机密钥位置。'
                }
            }
        }
    }

    $pending = Join-Path $runtime ('.backup-key-' + [guid]::NewGuid().ToString('N'))
    $secret = New-Object byte[] 32
    $encoded = $null
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        [IO.File]::Open($pending, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None).Dispose()
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
        $acl = New-Object Security.AccessControl.FileSecurity
        $acl.SetOwner($identity)
        $acl.SetAccessRuleProtection($true, $false)
        foreach ($sid in @($identity, $system)) {
            $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'Allow')
            $acl.AddAccessRule($rule)
        }
        Set-Acl -LiteralPath $pending -AclObject $acl
        $rng.GetBytes($secret)
        $encoded = [Text.Encoding]::ASCII.GetBytes([Convert]::ToBase64String($secret))
        [IO.File]::WriteAllBytes($pending, $encoded)
        [IO.File]::Move($pending, $keyFile)
        Write-Host '本机备份密钥已初始化。迁移时请将密钥和备份分开保管。'
    } finally {
        $rng.Dispose()
        [Array]::Clear($secret, 0, $secret.Length)
        if ($null -ne $encoded) { [Array]::Clear($encoded, 0, $encoded.Length) }
        if (Test-Path -LiteralPath $pending -PathType Leaf) { Remove-Item -LiteralPath $pending }
    }
}

if ($PSBoundParameters.ContainsKey('Directory') -or $PSBoundParameters.ContainsKey('RetentionDays')) {
    $pendingSettings = Join-Path $runtime ('.backup-settings-' + [guid]::NewGuid().ToString('N'))
    try {
        $json = ($settings | ConvertTo-Json) + [Environment]::NewLine
        [IO.File]::WriteAllText($pendingSettings, $json, [Text.UTF8Encoding]::new($false))
        if (Test-Path -LiteralPath $settingsFile -PathType Leaf) {
            [IO.File]::Replace($pendingSettings, $settingsFile, [NullString]::Value)
        } else {
            [IO.File]::Move($pendingSettings, $settingsFile)
        }
    } finally {
        if (Test-Path -LiteralPath $pendingSettings -PathType Leaf) { Remove-Item -LiteralPath $pendingSettings }
    }
    Write-Host '备份配置已保存。重启系统后，重新读取备份页面。'
}
