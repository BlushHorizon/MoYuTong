# 群崽 QunZai · 安装器专用停止脚本
# 只结束命令行里带 server\server.js 的 node 进程，避免误杀其他 Node 程序。
param(
    [Parameter(Mandatory = $true)]
    [string]$Root
)

$ErrorActionPreference = 'SilentlyContinue'

# 先写停止标记：如果服务是由 launcher 守护模式拉起的，看到标记就不会再拉起。
try {
    $dataDir = Join-Path $Root 'data'
    New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $dataDir '.svc_stop'), (Get-Date -Format 'o'))
} catch { }

$killed = 0
try {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -and $_.CommandLine -match 'server[\\/]server\.js' } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            $killed++
        }
} catch { }

# 给端口一点释放时间，避免安装器马上启动新服务时撞端口。
Start-Sleep -Milliseconds 600
Write-Host "QunZai service stopped: $killed process(es)"
exit 0
