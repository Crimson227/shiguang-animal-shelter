param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$runtime = Join-Path $env:LOCALAPPDATA 'AnimalShelterMySQL'
$project = Split-Path $PSScriptRoot -Parent
$mysqlBin = Join-Path $env:ProgramFiles 'MySQL\MySQL Server 8.4\bin'
$appPort = if ($env:PORT) { $env:PORT } else { '27471' }
$dbHost = if ($env:DB_HOST) { $env:DB_HOST } else { '127.0.0.1' }
$dbPort = if ($env:DB_PORT) { $env:DB_PORT } else { '3306' }
$dbUser = if ($env:DB_USER) { $env:DB_USER } else { 'animal_app' }
$dbName = if ($env:DB_NAME) { $env:DB_NAME } else { 'animal_shelter_react' }
$appUrl = "http://127.0.0.1:$appPort"

function Test-AppReady {
    try {
        $target = 'dbHost={0}&dbPort={1}&dbName={2}' -f [uri]::EscapeDataString($dbHost), $dbPort, [uri]::EscapeDataString($dbName)
        $health = Invoke-RestMethod -Uri "$appUrl/api/health?$target" -TimeoutSec 2
        return ($health.ok -is [bool] -and $health.ok -and $health.service -ceq 'shiguang-animal-shelter' -and $health.targetVerified -is [bool] -and $health.targetVerified)
    } catch { return $false }
}

try {
    Write-Host '[1/3] 检查本机运行环境……' -ForegroundColor Cyan
    foreach ($port in @($appPort, $dbPort)) {
        if ($port -notmatch '^[1-9][0-9]{0,4}$' -or [int]$port -gt 65535) { throw '端口必须是 1 到 65535 之间的整数。' }
    }
    $credentialsFile = Join-Path $runtime 'credentials.json'
    $mysql = Join-Path $mysqlBin 'mysql.exe'
    $mysqlServer = Join-Path $mysqlBin 'mysqld.exe'
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    foreach ($file in @($credentialsFile, $mysql, $mysqlServer,
        (Join-Path $project 'server\index.js'), (Join-Path $project 'client\dist\index.html'))) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
            throw "找不到必要文件：$file"
        }
    }
    try {
        $creds = Get-Content -LiteralPath $credentialsFile -Raw | ConvertFrom-Json
    } catch {
        throw '无法读取本机数据库连接配置，请检查文件权限和 JSON 格式。'
    }
    if ($creds.appPassword -isnot [string] -or [string]::IsNullOrWhiteSpace($creds.appPassword)) {
        throw '本机数据库连接配置不完整。'
    }

    Write-Host '[2/3] 启动并等待数据库……' -ForegroundColor Cyan
    if ($dbHost -in @('127.0.0.1', 'localhost') -and -not (Get-NetTCPConnection -LocalPort $dbPort -State Listen -ErrorAction SilentlyContinue)) {
        $mysqlArgs = '--no-defaults --basedir="{0}" --datadir="{1}" --bind-address=127.0.0.1 --port={2}' -f (Split-Path $mysqlBin -Parent), (Join-Path $runtime 'data'), $dbPort
        if ($dbPort -ne '3306') { $mysqlArgs += ' --mysqlx=OFF' }
        Start-Process -FilePath $mysqlServer -ArgumentList $mysqlArgs -WindowStyle Hidden | Out-Null
    }
    $previousMysqlPassword = $env:MYSQL_PWD
    $previousErrorPreference = $ErrorActionPreference
    try {
        $env:MYSQL_PWD = $creds.appPassword
        $ErrorActionPreference = 'Continue'
        $mysqlReady = $false
        for ($i = 0; $i -lt 40; $i++) {
            $mysqlResult = & $mysql --no-defaults --protocol=TCP "--host=$dbHost" "--port=$dbPort" "--user=$dbUser" "--database=$dbName" --connect-timeout=2 --batch --execute='SELECT 1' 2>&1 | Out-String
            if ($LASTEXITCODE -eq 0) { $mysqlReady = $true; break }
            if ($mysqlResult -match 'ERROR (1044|1045|1049|1130)\b') { throw '无法登录目标数据库。请核对数据库名、账号、密码和权限。' }
            Start-Sleep -Milliseconds 500
        }
    } finally {
        $env:MYSQL_PWD = $previousMysqlPassword
        $ErrorActionPreference = $previousErrorPreference
    }
    if (-not $mysqlReady) { throw "数据库未能就绪。请检查 $runtime\data 中的错误日志。" }

    Write-Host '[3/3] 启动并检查网站……' -ForegroundColor Cyan
    $appReady = Test-AppReady
    if (-not $appReady) {
        if (Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue) {
            throw "$appPort 端口已有程序占用，且不是连接目标数据库的拾光守护实例。"
        }
        $previousDbPassword = $env:ANIMAL_SHELTER_DB_PASSWORD
        $previousAppPort = $env:PORT
        try {
            $env:ANIMAL_SHELTER_DB_PASSWORD = $creds.appPassword
            $env:PORT = $appPort
            $app = Start-Process -FilePath $node -ArgumentList 'index.js' -WorkingDirectory (Join-Path $project 'server') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'react.stdout.log') -RedirectStandardError (Join-Path $runtime 'react.stderr.log')
        } finally {
            $env:ANIMAL_SHELTER_DB_PASSWORD = $previousDbPassword
            $env:PORT = $previousAppPort
        }
        for ($i = 0; $i -lt 40; $i++) {
            if (Test-AppReady) { $appReady = $true; break }
            if ($app.HasExited) { break }
            Start-Sleep -Milliseconds 500
        }
    }
    if (-not $appReady) { throw "网站未能启动。请查看 $runtime\react.stderr.log。" }
    $page = Invoke-WebRequest -Uri "$appUrl/catalog" -UseBasicParsing -TimeoutSec 10
    if ($page.StatusCode -ne 200) { throw '网站页面未能正常加载。' }

    Write-Host ''
    Write-Host "启动成功：$appUrl/catalog" -ForegroundColor Green
    Write-Host '可以关闭此窗口，系统会继续在后台运行。'
    if (-not $NoBrowser) {
        try { Start-Process "$appUrl/catalog" }
        catch { Write-Host '浏览器未能自动打开，请复制上方地址到浏览器。' -ForegroundColor Yellow }
    }
} catch {
    Write-Host ''
    Write-Host "启动失败：$($_.Exception.Message)" -ForegroundColor Red
    try {
        $diagnostic = [ordered]@{
            time = (Get-Date -Format o)
            windowsUser = [Environment]::UserName
            configPath = (Join-Path $runtime 'credentials.json')
            configExists = (Test-Path -LiteralPath (Join-Path $runtime 'credentials.json') -PathType Leaf)
            errorType = $_.Exception.GetType().FullName
        }
        $diagnostic | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtime 'startup-failure.json') -Encoding UTF8
        Write-Host "失败记录：$runtime\startup-failure.json"
    } catch { }
    exit 1
}
