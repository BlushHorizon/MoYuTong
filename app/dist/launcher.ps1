# 摸鱼瞳 MoYuTong · 一键启动器（由桌面快捷方式调用）
# 参数：-NoBrowser 只启动服务不开网页；-Stop 停止服务；-LiveConsole 实时控制台模式
# 守护模式：启动后常驻，服务进程意外退出 3 秒后自动重启（防抽风）。
# -LiveConsole：日志直接打在本窗口；关闭本窗口 = 服务随窗口一起关停。

param(
    [switch]$NoBrowser,
    [switch]$Stop,
    [switch]$LiveConsole
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$port = 8787
$url = "http://127.0.0.1:$port"
$logDir = Join-Path $root 'data'
$logFile = Join-Path $logDir 'server.log'
$stopFlag = Join-Path $logDir '.svc_stop'

function Show-Msg([string]$text, [string]$title = '摸鱼瞳 MoYuTong') {
    # 总是落日志 + 打到控制台
    try {
        $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        Add-Content -Path (Join-Path $logDir 'launcher.log') -Value "[$stamp] $title`n$text`n" -Encoding UTF8
    } catch { }
    try { Write-Host $text -ForegroundColor Red } catch { }
    # 只有在真实控制台（双击运行）时才弹窗；
    # 被脚本/管道重定向调用时不弹窗，避免自动化被对话框挂死
    if (-not [Console]::IsOutputRedirected) {
        try {
            Add-Type -AssemblyName System.Windows.Forms | Out-Null
            [System.Windows.Forms.MessageBox]::Show($text, $title, 'OK', 'Information') | Out-Null
        } catch { }
    }
}

function Test-BrowserHasUrl([string]$u) {
    # 面板是否已经在某个浏览器窗口里开着。
    # 不查的话，每双击一次「开启」就多一个浏览器窗口，跑一天能堆到几十个。
    try {
        $procs = Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe' OR Name='msedgewebview2.exe'" -ErrorAction SilentlyContinue
        foreach ($p in $procs) {
            if ($p.CommandLine -and $p.CommandLine.Contains($u)) { return $true }
        }
    } catch { }
    return $false
}

function Open-PanelOnce([string]$u) {
    if (Test-BrowserHasUrl $u) {
        try { Write-Host '  面板已在浏览器中打开，跳过重复开窗。' -ForegroundColor DarkGray } catch { }
        return
    }
    Start-Process $u
}

function Test-Port([int]$p) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect('127.0.0.1', $p, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(400)) { return $false }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

# ---------- 停止服务 ----------
if ($Stop) {
    # 1) 先写停止标记：守护循环看到标记就彻底退出、不再拉起
    try { New-Item -ItemType Directory -Force -Path $logDir | Out-Null } catch { }
    try { [System.IO.File]::WriteAllText($stopFlag, (Get-Date -Format 'o')) } catch { }
    $killed = 0
    # 2) 按监听端口找进程（最可靠）
    try {
        $line = netstat -ano | Select-String '127\.0\.0\.1:8787' | Select-String 'LISTENING' | Select-Object -First 1
        if ($line) {
            $portPid = ($line -split '\s+')[-1]
            if ($portPid -and $portPid -match '^\d+$') {
                Stop-Process -Id ([int]$portPid) -Force -ErrorAction SilentlyContinue
                $killed++
            }
        }
    } catch { }
    Start-Sleep -Milliseconds 500
    # 3) 兜底：命令行里带 server.js 的 node 进程
    try {
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -like '*server.js*' } |
            ForEach-Object {
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
                $killed++
            }
    } catch { }
    # 4) 等端口释放 & 守护进程退出
    for ($i = 0; $i -lt 12; $i++) { if (-not (Test-Port $port)) { break }; Start-Sleep -Milliseconds 300 }
    if ($killed -gt 0) { Write-Host "服务已停止（共 $killed 个进程）。" }
    else { Write-Host "没有找到正在运行的服务。" }
    exit 0
}

# ---------- Node 环境检查 ----------
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Show-Msg "未检测到 Node.js。`n`n请先安装 Node.js 18 或更高版本：`nhttps://nodejs.org/`n`n安装完成后重新双击本快捷方式。" '缺少 Node.js'
    exit 1
}

# ---------- 服务已在运行则直接开网页 ----------
if (Test-Port $port) {
    if (-not $NoBrowser) { Open-PanelOnce $url }
    if ($LiveConsole) {
        try { $Host.UI.RawUI.WindowTitle = 'MoYuTong' } catch { }
        Write-Host ''
        Write-Host '  服务已在运行。' -ForegroundColor Yellow
        Write-Host '  如需日志窗口：先双击「关闭」，再重新双击「开启」。'
        Write-Host ''
        Start-Sleep -Seconds 5
    }
    exit 0
}

# ---------- 清理旧的停止标记，准备守护启动 ----------
try { Remove-Item $stopFlag -Force -ErrorAction SilentlyContinue } catch { }
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
# 日志统一由 node 侧写入 data\app.log（追加式，控制台窗口是它的实时视图），无需重定向

if (-not $NoBrowser) { Open-PanelOnce $url }

if ($LiveConsole) {
    # 实时控制台模式：本窗口就是程序 —— 日志直接滚动，关掉窗口 = 停止服务
    try { $Host.UI.RawUI.WindowTitle = 'MoYuTong ' + [char]0x6478 + [char]0x9C7C + [char]0x77B3 + ' ' + [char]0x65E5 + [char]0x5FD7 } catch { }
    Write-Host ''
    Write-Host ('  摸鱼瞳 MoYuTong 已启动 · ' + (Get-Date -Format 'HH:mm:ss')) -ForegroundColor Green
    Write-Host '  关闭本窗口 = 停止服务；也可用「关闭」停止。'
    Write-Host '  ------------------------------------------------------------'
}

# ---------- 守护循环：拉起服务，挂了就自动重启 ----------
# 控制台句柄兜底检测：日志窗口一旦关闭，守护同步退出
if ($LiveConsole) {
    try { Add-Type -Namespace Wdeep -Name Native -MemberDefinition '[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();' -ErrorAction SilentlyContinue } catch { }
}
while ($true) {
    if ($LiveConsole) {
        try { if ([Wdeep.Native]::GetConsoleWindow() -eq [IntPtr]::Zero) { exit 0 } } catch { /* 类型未加载则跳过，13A 检测仍兜底 */ }
    }
    $proc = $null
    try {
        # -NoNewWindow：node 挂在本控制台 —— 窗口即日志实时视图（日志本体由 node 写入 data\app.log）
        $proc = Start-Process -FilePath $node.Source `
            -ArgumentList 'server\server.js' `
            -WorkingDirectory $root `
            -NoNewWindow `
            -PassThru
    } catch {
        Show-Msg "启动服务失败：`n$($_.Exception.Message)" '启动失败'
        exit 1
    }
    # 监控：进程退出 或 收到停止标记
    while (-not $proc.HasExited) {
        Start-Sleep -Seconds 3
        if (Test-Path $stopFlag) {
            try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch { }
            break
        }
    }
    if (Test-Path $stopFlag) {
        try { Remove-Item $stopFlag -Force -ErrorAction SilentlyContinue } catch { }
        exit 0
    }
    # 进程意外退出 → 提示并 3 秒后自动重启（防抽风）
    $exitCode = $proc.ExitCode
    if ($exitCode -eq -1073741510) {
        # 0xC000013A = 控制台关闭 / Ctrl+C 信号 —— 用户主动关停，守护同步退出，不复活
        try {
            $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
            Add-Content -Path (Join-Path $logDir 'launcher.log') -Value "[$stamp] 收到窗口关闭信号（0xC000013A），守护退出，服务已停止。" -Encoding UTF8
        } catch { }
        if ($LiveConsole) { Write-Host '  服务已停止（窗口信号）。' -ForegroundColor Yellow }
        exit 0
    }
    try {
        $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        Add-Content -Path (Join-Path $logDir 'launcher.log') -Value "[$stamp] 服务进程退出(code=$exitCode)，3 秒后自动重启…" -Encoding UTF8
    } catch { }
    if ($LiveConsole) {
        Write-Host ('  [!] 服务进程意外退出，3 秒后自动重启… (' + (Get-Date -Format 'HH:mm:ss') + ')') -ForegroundColor Yellow
    }
    Start-Sleep -Seconds 3
}
