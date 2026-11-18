import { encodeBase64 } from './commands.js';

export function renderWindowsInstaller(serverId, secret, host, cfg) {
  let realPsScript = `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "==========================================================" -ForegroundColor Red
    Write-Host " ❌ 错误: 请以【管理员身份】(Run as Administrator) 运行 PowerShell！" -ForegroundColor Red
    Write-Host "    请右键点击开始菜单，选择 'Windows PowerShell (管理员)' 或 '终端 (管理员)'" -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Red
    exit
}

$SERVER_ID = "${serverId}"
$SECRET = "${secret}"
$WORKER_URL = "${host}/update"

Write-Host "开始安装全面增强版 CF Probe Agent (Windows)..." -ForegroundColor Cyan

$agentDir = "C:\\ProgramData\\CFProbe"
if (!(Test-Path $agentDir)) { New-Item -ItemType Directory -Path $agentDir | Out-Null }
$agentScript = "$agentDir\\cf-probe.ps1"

$scriptContent = @'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
$SERVER_ID = "%%SERVER_ID%%"
$SECRET = "%%SECRET%%"
$WORKER_URL = "%%WORKER_URL%%"

$REPORT_INTERVAL = ${cfg.reportInterval}
$PING_NODE_CT = "${cfg.pingCt}"
$PING_NODE_CU = "${cfg.pingCu}"
$PING_NODE_CM = "${cfg.pingCm}"

$RX_PREV = 0; $TX_PREV = 0
$LOOP_COUNT = 0
$IPV4 = "0"; $IPV6 = "0"
$PING_CT = "0"; $PING_CU = "0"; $PING_CM = "0"; $PING_BD = "0"
$LOSS_CT = -1; $LOSS_CU = -1; $LOSS_CM = -1; $LOSS_BD = -1
$PING_COUNT = 5

# 三网目标是双栈域名,本机取 A 还是 AAAA 会随 IPv6 状态漂移(无关的 WARP/TUN 起来就会变),
# 有 IPv4 地址时探测固定走 IPv4。只看本机网卡地址、不依赖网络,避免在 IPv6 黑洞的机器上
# 把连不上 Cloudflare 误判成没有 IPv4。
$PROBE_IPV4 = $false
try {
    $PROBE_IPV4 = @([System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
        Where-Object { $_.OperationalStatus -eq 'Up' } |
        ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
        Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' -and $_.Address.IPAddressToString -notlike '127.*' -and $_.Address.IPAddressToString -notlike '169.254.*' }).Count -gt 0
} catch { $PROBE_IPV4 = $false }

function Get-HttpPing {
    param([string]$node)
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        $target = $node
        if ($PROBE_IPV4) {
            # 只挑 A 记录;交给系统自己选会按 IPv6 优先落到 AAAA
            $v4 = @([System.Net.Dns]::GetHostAddresses($node) | Where-Object { $_.AddressFamily -eq 'InterNetwork' })
            if ($v4.Count -eq 0) { return 0 }
            $target = $v4[0].IPAddressToString
        }
        $req = [System.Net.WebRequest]::Create("http://" + $target)
        # 连的是 IPv4 字面量,Host 头必须还是域名,否则虚拟主机可能不回
        if ($target -ne $node) { $req.Host = $node }
        $req.Timeout = 2000; $req.Method = "HEAD"
        $res = $req.GetResponse(); $res.Close()
        $sw.Stop()
        return [math]::Round($sw.Elapsed.TotalMilliseconds)
    } catch {
        # PowerShell 把 .NET 方法抛出的异常包在 MethodInvocationException 里,直接看
        # $_.Exception.Response 永远是空,必须顺着 InnerException 找到真正的 WebException
        $web = $_.Exception
        while ($web -and $web -isnot [System.Net.WebException]) { $web = $web.InnerException }
        if ($web -and $web.Response) {
            $web.Response.Close()
            $sw.Stop()
            return [math]::Round($sw.Elapsed.TotalMilliseconds)
        }
        return 0
    }
}

function Get-IcmpStat {
    param([string]$node)
    # 返回 @(丢包百分比, 平均RTT);丢包 -1 表示无法测量,RTT -1 表示一个回包都没有
    $pings = @()
    try {
        $target = $node
        if ($PROBE_IPV4) {
            # 只挑 A 记录;交给 Ping 自己解析会按系统偏好落到 AAAA
            $v4 = @([System.Net.Dns]::GetHostAddresses($node) | Where-Object { $_.AddressFamily -eq 'InterNetwork' })
            if ($v4.Count -eq 0) { return @(-1, -1) }
            $target = $v4[0]
        }
        $tasks = @()
        for ($i = 0; $i -lt $PING_COUNT; $i++) {
            $p = New-Object System.Net.NetworkInformation.Ping
            $pings += $p
            $tasks += $p.SendPingAsync($target, 1000)
        }
        try { [Threading.Tasks.Task]::WaitAll($tasks, 4000) | Out-Null } catch { }
        $done = 0; $ok = 0; $sum = 0
        foreach ($t in $tasks) {
            if ($t.Status -ne "RanToCompletion") { continue }
            $done++
            if ($t.Result.Status -eq "Success") { $ok++; $sum += $t.Result.RoundtripTime }
        }
        # 任务未完成(DNS 失败等)与完成但超时是两回事,前者报 -1,后者是真丢包
        if ($done -eq 0) { return @(-1, -1) }
        $loss = [math]::Round(($done - $ok) * 100 / $done)
        if ($ok -eq 0) { return @($loss, -1) }
        # 同城目标的亚毫秒 RTT 会四舍五入成 0,而前台把 ping 0 当超时,成功探测下限取 1ms
        $avg = [math]::Round($sum / $ok)
        if ($avg -lt 1) { $avg = 1 }
        return @($loss, $avg)
    } catch {
        return @(-1, -1)
    } finally {
        # Ping 持有原生 socket 句柄,不显式释放只能等 finalizer,常驻循环下句柄会堆积
        foreach ($p in $pings) { try { $p.Dispose() } catch { } }
    }
}

while ($true) {
    if ($LOOP_COUNT % 60 -eq 0) {
        try { $ipv4_req = (Invoke-RestMethod -Uri "https://cloudflare.com/cdn-cgi/trace" -UseBasicParsing -TimeoutSec 3); if ($ipv4_req -match "ip=") { $IPV4 = "1" } else { $IPV4 = "0" } } catch { $IPV4 = "0" }
    }
    
    if ($LOOP_COUNT % 6 -eq 0) {
        $D_CT = "sh-ct-dualstack.ip.zstaticcdn.com"; $D_CU = "sh-cu-dualstack.ip.zstaticcdn.com"; $D_CM = "sh-cm-dualstack.ip.zstaticcdn.com"
        $c_bd = "lf3-ips.zstaticcdn.com"
        
        $c_ct = if ($PING_NODE_CT -eq "default") { $D_CT } else { $PING_NODE_CT }
        $c_cu = if ($PING_NODE_CU -eq "default") { $D_CU } else { $PING_NODE_CU }
        $c_cm = if ($PING_NODE_CM -eq "default") { $D_CM } else { $PING_NODE_CM }

        $r = Get-IcmpStat $c_ct
        $LOSS_CT = $r[0]
        $PING_CT = if ($r[1] -ge 0) { $r[1] } else { Get-HttpPing $c_ct }

        $r = Get-IcmpStat $c_cu
        $LOSS_CU = $r[0]
        $PING_CU = if ($r[1] -ge 0) { $r[1] } else { Get-HttpPing $c_cu }

        $r = Get-IcmpStat $c_cm
        $LOSS_CM = $r[0]
        $PING_CM = if ($r[1] -ge 0) { $r[1] } else { Get-HttpPing $c_cm }

        $r = Get-IcmpStat $c_bd
        $LOSS_BD = $r[0]
        $PING_BD = if ($r[1] -ge 0) { $r[1] } else { Get-HttpPing $c_bd }
    }

    $LOOP_COUNT++

    $os = Get-CimInstance Win32_OperatingSystem
    $OS_NAME = $os.Caption
    $ARCH = (Get-CimInstance Win32_ComputerSystem).SystemType
    
    $cpu_obj = Get-CimInstance Win32_Processor
    $cpu_name = ($cpu_obj | Select-Object -First 1).Name
    $core_count = ($cpu_obj | Measure-Object -Property NumberOfCores -Sum).Sum
    $CPU_INFO = "$cpu_name ($core_count Cores)"

    $CPU = [math]::Round((Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average, 2)
    
    $RAM_TOTAL = [math]::Round($os.TotalVisibleMemorySize / 1024, 0)
    $RAM_FREE = [math]::Round($os.FreePhysicalMemory / 1024, 0)
    $RAM_USED = $RAM_TOTAL - $RAM_FREE
    $RAM_PCT = if ($RAM_TOTAL -gt 0) { [math]::Round(($RAM_USED / $RAM_TOTAL) * 100, 2) } else { 0 }

    $pagefile = Get-CimInstance Win32_PageFileUsage -ErrorAction SilentlyContinue
    $SWAP_TOTAL = 0; $SWAP_USED = 0
    if ($pagefile) {
        $SWAP_TOTAL = ($pagefile | Measure-Object -Property AllocatedBaseSize -Sum).Sum
        $SWAP_USED = ($pagefile | Measure-Object -Property CurrentUsage -Sum).Sum
    }

    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction SilentlyContinue
    $DISK_TOTAL = 0; $DISK_USED = 0; $DISK_PCT = 0
    if ($disk) {
        $DISK_TOTAL = [math]::Round($disk.Size / 1048576, 0)
        $diskFreeMB = [math]::Round($disk.FreeSpace / 1048576, 0)
        $DISK_USED = $DISK_TOTAL - $diskFreeMB
        $DISK_PCT = if ($DISK_TOTAL -gt 0) { [math]::Round(($DISK_USED / $DISK_TOTAL) * 100, 2) } else { 0 }
    }

    $uptimeSpan = (Get-Date) - $os.LastBootUpTime
    $UPTIME = "{0} days, {1:d2}:{2:d2}" -f $uptimeSpan.Days, $uptimeSpan.Hours, $uptimeSpan.Minutes
    $BOOT_TIME = $os.LastBootUpTime.ToString("yyyy-MM-dd HH:mm:ss")
    
    $loadArr = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
    $loadAvg = [math]::Round($loadArr, 2)
    $LOAD = "$loadAvg $loadAvg $loadAvg"

    $PROCESSES = (Get-Process).Count
    $TCP_CONN = (netstat -ano -p tcp | Measure-Object).Count
    $UDP_CONN = (netstat -ano -p udp | Measure-Object).Count

    $netStats = Get-NetAdapterStatistics -ErrorAction SilentlyContinue
    $RX_NOW = 0; $TX_NOW = 0
    if ($netStats) {
        $RX_NOW = ($netStats | Measure-Object -Property ReceivedBytes -Sum).Sum
        $TX_NOW = ($netStats | Measure-Object -Property SentBytes -Sum).Sum
    }
    
    if ($RX_PREV -eq 0) { $RX_PREV = $RX_NOW }
    if ($TX_PREV -eq 0) { $TX_PREV = $TX_NOW }
    
    $inv = if ($REPORT_INTERVAL -gt 0) { $REPORT_INTERVAL } else { 5 }
    $RX_SPEED = [math]::Round(($RX_NOW - $RX_PREV) / $inv)
    $TX_SPEED = [math]::Round(($TX_NOW - $TX_PREV) / $inv)
    $RX_PREV = $RX_NOW; $TX_PREV = $TX_NOW

    $VIRT = "Windows" 

    $payload = @{
        id = $SERVER_ID
        secret = $SECRET
        metrics = @{
            cpu = "$CPU"
            ram = "$RAM_PCT"
            ram_total = "$RAM_TOTAL"
            ram_used = "$RAM_USED"
            swap_total = "$SWAP_TOTAL"
            swap_used = "$SWAP_USED"
            disk = "$DISK_PCT"
            disk_total = "$DISK_TOTAL"
            disk_used = "$DISK_USED"
            load = "$LOAD"
            uptime = "$UPTIME"
            boot_time = "$BOOT_TIME"
            net_rx = "$RX_NOW"
            net_tx = "$TX_NOW"
            net_in_speed = "$RX_SPEED"
            net_out_speed = "$TX_SPEED"
            os = "$OS_NAME"
            arch = "$ARCH"
            cpu_info = "$CPU_INFO"
            processes = "$PROCESSES"
            tcp_conn = "$TCP_CONN"
            udp_conn = "$UDP_CONN"
            ip_v4 = "$IPV4"
            ip_v6 = "$IPV6"
            ping_ct = "$PING_CT"
            ping_cu = "$PING_CU"
            ping_cm = "$PING_CM"
            ping_bd = "$PING_BD"
            loss_ct = "$LOSS_CT"
            loss_cu = "$LOSS_CU"
            loss_cm = "$LOSS_CM"
            loss_bd = "$LOSS_BD"
            virt = "$VIRT"
        }
    }
    
    $json = $payload | ConvertTo-Json -Depth 10 -Compress
    $jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($json)

    try {
        $res = Invoke-RestMethod -Uri $WORKER_URL -Method Post -Body $jsonBytes -ContentType "application/json; charset=utf-8" -TimeoutSec 10
        if ($res -match "INTERVAL=") {
            $parts = $res -split '\\|'
            foreach ($p in $parts) {
                if ($p -match "INTERVAL=(.+)") { $REPORT_INTERVAL = [int]$matches[1] }
                if ($p -match "CT=(.+)") { $PING_NODE_CT = $matches[1] }
                if ($p -match "CU=(.+)") { $PING_NODE_CU = $matches[1] }
                if ($p -match "CM=(.+)") { $PING_NODE_CM = $matches[1] }
            }
        }
    } catch {
        $_ | Out-File "C:\\ProgramData\\CFProbe\\error.log" -Append
    }

    Start-Sleep -Seconds $REPORT_INTERVAL
}
'@

$scriptContent = $scriptContent -replace "%%SERVER_ID%%", $SERVER_ID -replace "%%SECRET%%", $SECRET -replace "%%WORKER_URL%%", $WORKER_URL

Set-Content -Path $agentScript -Value $scriptContent -Encoding UTF8

$taskName = "CFProbeAgent"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File \`"$agentScript\`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Description "CF Server Monitor Agent" | Out-Null
Start-ScheduledTask -TaskName $taskName | Out-Null
Write-Host "✅ Windows 探针安装成功！服务已在后台(计划任务 $taskName)运行。" -ForegroundColor Green
Write-Host "大盘约需 5-10 秒钟同步最新数据，请刷新网页查看。" -ForegroundColor Yellow
`;

  const b64PsScript = encodeBase64(realPsScript);
  const psWrapper = `$b64 = "${b64PsScript}"
$bytes = [System.Convert]::FromBase64String($b64)
$script = [System.Text.Encoding]::UTF8.GetString($bytes)
Invoke-Expression $script
`;
  return psWrapper;
}
