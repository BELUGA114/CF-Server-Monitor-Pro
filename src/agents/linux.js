import { encodeBase64 } from './commands.js';

export function renderLinuxInstaller(osType, host, cfg) {
  const sh_bin = osType === 'alpine' ? "/bin/sh" : "/bin/bash";

  let realBashScript = `#!${sh_bin}
SERVER_ID=\$1
SECRET=\$2
WORKER_URL="${host}/update"

if [ -z "\$SERVER_ID" ] || [ -z "\$SECRET" ]; then echo "错误: 缺少参数。"; exit 1; fi
echo "开始安装全面增强版 CF Probe Agent (${osType === 'alpine' ? 'Alpine/OpenRC' : 'Systemd'})..."

`;

  if (osType === 'alpine') realBashScript += `rc-service cf-probe stop 2>/dev/null\n`;
  else realBashScript += `systemctl stop cf-probe.service 2>/dev/null\n`;

  realBashScript += `pkill -f cf-probe.sh 2>/dev/null

cat << EOF > /usr/local/bin/cf-probe.sh
#!${sh_bin}
SERVER_ID="\$SERVER_ID"
SECRET="\$SECRET"
WORKER_URL="\$WORKER_URL"

get_net_bytes() { awk 'NR>2 {rx+=\\$2; tx+=\\$10} END {printf "%.0f %.0f", rx, tx}' /proc/net/dev; }
get_cpu_stat() { awk '/^cpu / {print \\$2+\\$3+\\$4+\\$5+\\$6+\\$7+\\$8+\\$9, \\$5+\\$6}' /proc/stat; }
get_http_ping() { rtt=\\$(curl \\$PROBE_AF -o /dev/null -s -m 2 -w "%{time_total}" "http://\\$1" 2>/dev/null | awk '{printf "%.0f", \\$1*1000}'); echo "\\\${rtt:-0}"; }
PING_COUNT=5
ICMP_OK=0
command -v ping >/dev/null 2>&1 && ICMP_OK=1
# 三网目标是双栈域名,本机取 A 还是 AAAA 会随 IPv6 状态漂移(无关的 WARP/TUN 起来就会变),
# 有 IPv4 出口时固定走 IPv4。老 busybox 的 ping 不认 -4,启动自检一次,认不出就退回原命令。
PING4_OK=0
ping -4 -c 1 -W 1 127.0.0.1 >/dev/null 2>&1 && PING4_OK=1
# 统计文件必须放在父目录仅 root 可写的位置。放 /tmp 会被非特权用户预置符号链接,
# root 的重定向跟随后可任意截断文件(CWE-59)
ICMP_DIR=""
for d in /run/cf-probe /var/lib/cf-probe; do
  if (umask 077; mkdir -p "\\$d" 2>/dev/null); then ICMP_DIR="\\$d"; chmod 700 "\\$d" 2>/dev/null; break; fi
done
[ -z "\\$ICMP_DIR" ] && ICMP_OK=0
# 四个目标并行探测,统计输出按目标后缀落文件,解析统一放在 wait 之后
icmp_probe() { ping \\$PROBE_AF -c \\$PING_COUNT -w 6 -q "\\$1" > "\\$ICMP_DIR/icmp-\\$2" 2>/dev/null; }
# 丢包百分比;输出为空表示 ICMP 不可用(命令缺失、无权限或解析失败)
icmp_loss() { awk '/packet loss/ { for (i = 1; i <= NF; i++) if (\\$i ~ /%\\$/) { sub(/%\\$/, "", \\$i); printf "%.0f", \\$i + 0; exit } }' "\\$ICMP_DIR/icmp-\\$1" 2>/dev/null; }
# 平均 RTT;输出为空表示一个回包都没有,此时延迟回退 HTTP 探测
# 同城目标的亚毫秒 RTT 会四舍五入成 0,而前台把 ping 0 当超时,故成功探测下限取 1ms
icmp_avg() { awk -F'=' '/min\\/avg\\/max/ { split(\\$2, a, "/"); v = a[2] + 0; if (v < 1) v = 1; printf "%.0f", v; exit }' "\\$ICMP_DIR/icmp-\\$1" 2>/dev/null; }

NET_STAT=\\$(get_net_bytes)
RX_PREV=\\$(echo \\$NET_STAT | awk '{print \\$1}')
TX_PREV=\\$(echo \\$NET_STAT | awk '{print \\$2}')
if [ -z "\\$RX_PREV" ]; then RX_PREV=0; fi
if [ -z "\\$TX_PREV" ]; then TX_PREV=0; fi

CPU_STAT=\\$(get_cpu_stat)
PREV_CPU_TOTAL=\\$(echo \\$CPU_STAT | awk '{print \\$1}')
PREV_CPU_IDLE=\\$(echo \\$CPU_STAT | awk '{print \\$2}')

LOOP_COUNT=0
PROBE_AF=""
IPV4="0"; IPV6="0"
PING_CT="0"; PING_CU="0"; PING_CM="0"; PING_BD="0"
LOSS_CT="-1"; LOSS_CU="-1"; LOSS_CM="-1"; LOSS_BD="-1"

REPORT_INTERVAL="${cfg.reportInterval}"
PING_NODE_CT="${cfg.pingCt}"
PING_NODE_CU="${cfg.pingCu}"
PING_NODE_CM="${cfg.pingCm}"

while true; do
  if [ \\$((LOOP_COUNT % 60)) -eq 0 ]; then
    curl -s -4 -m 3 https://cloudflare.com/cdn-cgi/trace 2>/dev/null | grep -q "ip=" && IPV4="1" || IPV4="0"
    curl -s -6 -m 3 https://cloudflare.com/cdn-cgi/trace 2>/dev/null | grep -q "ip=" && IPV6="1" || IPV6="0"
  fi
  
  if [ \\$((LOOP_COUNT % 6)) -eq 0 ]; then
    D_CT="sh-ct-dualstack.ip.zstaticcdn.com"; D_CU="sh-cu-dualstack.ip.zstaticcdn.com"; D_CM="sh-cm-dualstack.ip.zstaticcdn.com"
    BD_NODE="lf3-ips.zstaticcdn.com"
    
    CT_NODE="\\$PING_NODE_CT"
    CU_NODE="\\$PING_NODE_CU"
    CM_NODE="\\$PING_NODE_CM"
    
    [ "\\$CT_NODE" = "default" ] && CT_NODE="\\$D_CT"
    [ "\\$CU_NODE" = "default" ] && CU_NODE="\\$D_CU"
    [ "\\$CM_NODE" = "default" ] && CM_NODE="\\$D_CM"

    # ICMP 与 HTTP 回退必须同族,否则会出现 ICMP 走 v6 全丢、延迟却取 v4 回退值的混合结果
    PROBE_AF=""
    if [ "\\$PING4_OK" = "1" ] && [ "\\$IPV4" = "1" ]; then PROBE_AF="-4"; fi

    if [ "\\$ICMP_OK" = "1" ]; then
      icmp_probe "\\$CT_NODE" ct &
      icmp_probe "\\$CU_NODE" cu &
      icmp_probe "\\$CM_NODE" cm &
      icmp_probe "\\$BD_NODE" bd &
      wait
    fi

    LOSS_CT=\\$(icmp_loss ct); PING_CT=\\$(icmp_avg ct)
    [ -z "\\$LOSS_CT" ] && LOSS_CT="-1"
    [ -z "\\$PING_CT" ] && PING_CT=\\$(get_http_ping "\\$CT_NODE")

    LOSS_CU=\\$(icmp_loss cu); PING_CU=\\$(icmp_avg cu)
    [ -z "\\$LOSS_CU" ] && LOSS_CU="-1"
    [ -z "\\$PING_CU" ] && PING_CU=\\$(get_http_ping "\\$CU_NODE")

    LOSS_CM=\\$(icmp_loss cm); PING_CM=\\$(icmp_avg cm)
    [ -z "\\$LOSS_CM" ] && LOSS_CM="-1"
    [ -z "\\$PING_CM" ] && PING_CM=\\$(get_http_ping "\\$CM_NODE")

    LOSS_BD=\\$(icmp_loss bd); PING_BD=\\$(icmp_avg bd)
    [ -z "\\$LOSS_BD" ] && LOSS_BD="-1"
    [ -z "\\$PING_BD" ] && PING_BD=\\$(get_http_ping "\\$BD_NODE")

    [ -n "\\$ICMP_DIR" ] && rm -f "\\$ICMP_DIR/icmp-ct" "\\$ICMP_DIR/icmp-cu" "\\$ICMP_DIR/icmp-cm" "\\$ICMP_DIR/icmp-bd"
  fi
  
  LOOP_COUNT=\\$((LOOP_COUNT + 1))

  OS=\\$(awk -F= '/^PRETTY_NAME/{print \\$2}' /etc/os-release 2>/dev/null | tr -d '"')
  if [ -z "\\$OS" ]; then OS=\\$(uname -srm); fi
  ARCH=\\$(uname -m)
  BOOT_TIME=\\$(uptime -s 2>/dev/null || stat -c %y / 2>/dev/null | cut -d'.' -f1 || echo "Unknown")
  
  CORE_COUNT=\\$(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || echo 1)
  CPU_INFO=\\$(grep -m 1 'model name' /proc/cpuinfo | awk -F: '{print \\$2}' | xargs | tr -d '"')
  if [ -z "\\$CPU_INFO" ]; then CPU_INFO=\\$(uname -p 2>/dev/null || echo "Unknown CPU"); fi
  CPU_INFO="\\\${CPU_INFO} (\\\${CORE_COUNT} Cores)"
  
  VIRT=""
  if command -v systemd-detect-virt >/dev/null 2>&1; then VIRT=\\$(systemd-detect-virt 2>/dev/null); fi
  if [ -z "\\$VIRT" ] || [ "\\$VIRT" = "none" ]; then
    if grep -q "lxc" /proc/1/environ 2>/dev/null; then VIRT="lxc"
    elif grep -q "docker" /proc/1/environ 2>/dev/null; then VIRT="docker"
    elif [ -f /proc/user_beancounters ]; then VIRT="openvz"
    elif grep -qi "kvm" /proc/cpuinfo 2>/dev/null; then VIRT="kvm"
    elif grep -qi "qemu" /proc/cpuinfo 2>/dev/null; then VIRT="qemu"
    elif [ -f /sys/class/dmi/id/product_name ]; then VIRT=\\$(cat /sys/class/dmi/id/product_name | head -n1 | cut -d' ' -f1)
    else VIRT="Unknown"
    fi
  fi
  VIRT=\\$(echo "\\$VIRT" | tr '[:lower:]' '[:upper:]')

  CPU_STAT=\\$(get_cpu_stat)
  CPU_TOTAL=\\$(echo \\$CPU_STAT | awk '{print \\$1}')
  CPU_IDLE=\\$(echo \\$CPU_STAT | awk '{print \\$2}')
  DIFF_TOTAL=\\$((CPU_TOTAL - PREV_CPU_TOTAL))
  DIFF_IDLE=\\$((CPU_IDLE - PREV_CPU_IDLE))
  
  CPU=\\$(awk -v t=\\$DIFF_TOTAL -v i=\\$DIFF_IDLE 'BEGIN {if (t<=0) print 0; else {pct=(1 - i/t)*100; if(pct<0) print 0; else if(pct>100) print 100; else printf "%.2f", pct}}')
  PREV_CPU_TOTAL=\\$CPU_TOTAL; PREV_CPU_IDLE=\\$CPU_IDLE
  
  MEM_INFO=\\$(free -m 2>/dev/null)
  RAM_TOTAL=\\$(echo "\\$MEM_INFO" | awk '/Mem:/ {print \\$2}')
  RAM_USED=\\$(echo "\\$MEM_INFO" | awk '/Mem:/ {print \\$3}')
  RAM=\\$(awk "BEGIN {if(\\$RAM_TOTAL>0) printf \\"%.2f\\", \\$RAM_USED/\\$RAM_TOTAL * 100.0; else print 0}")
  
  SWAP_TOTAL=\\$(echo "\\$MEM_INFO" | awk '/Swap:/ {print \\$2}')
  SWAP_USED=\\$(echo "\\$MEM_INFO" | awk '/Swap:/ {print \\$3}')
  if [ -z "\\$SWAP_TOTAL" ]; then SWAP_TOTAL=0; fi
  if [ -z "\\$SWAP_USED" ]; then SWAP_USED=0; fi

  DISK_INFO=\\$(df -m / 2>/dev/null | tail -n1 | awk '{print \\$2, \\$3, \\$5}')
  DISK_TOTAL=\\$(echo "\\$DISK_INFO" | awk '{print \\$1}')
  DISK_USED=\\$(echo "\\$DISK_INFO" | awk '{print \\$2}')
  DISK=\\$(echo "\\$DISK_INFO" | awk '{print \\$3}' | tr -d '%')

  LOAD=\\$(cat /proc/loadavg | awk '{print \\$1, \\$2, \\$3}')
  UPTIME=\\$(awk '{d=int(\\$1/86400); h=int((\\$1%86400)/3600); m=int((\\$1%3600)/60); if(d>0) printf "%d days, %02d:%02d\\n", d, h, m; else printf "%02d:%02d\\n", h, m}' /proc/uptime 2>/dev/null || uptime -p 2>/dev/null | sed 's/up //')
  
  PROCESSES=\\$(ps -e 2>/dev/null | grep -v "PID" | wc -l)
  
  if command -v ss >/dev/null 2>&1; then
    TCP_CONN=\\$(ss -ant 2>/dev/null | grep -v "State" | wc -l)
    UDP_CONN=\\$(ss -anu 2>/dev/null | grep -v "State" | wc -l)
  else
    TCP_CONN=\\$(netstat -ant 2>/dev/null | grep -c "^tcp")
    UDP_CONN=\\$(netstat -anu 2>/dev/null | grep -c "^udp")
  fi
  if [ -z "\\$TCP_CONN" ]; then TCP_CONN=0; fi
  if [ -z "\\$UDP_CONN" ]; then UDP_CONN=0; fi
  
  NET_STAT=\\$(get_net_bytes)
  RX_NOW=\\$(echo \\$NET_STAT | awk '{print \\$1}')
  TX_NOW=\\$(echo \\$NET_STAT | awk '{print \\$2}')
  if [ -z "\\$RX_NOW" ]; then RX_NOW=0; fi
  if [ -z "\\$TX_NOW" ]; then TX_NOW=0; fi

  RX_SPEED=\\$(((RX_NOW - RX_PREV) / 5))
  TX_SPEED=\\$(((TX_NOW - TX_PREV) / 5))
  RX_PREV=\\$RX_NOW; TX_PREV=\\$TX_NOW
  
  PAYLOAD="{\\"id\\": \\"\\$SERVER_ID\\", \\"secret\\": \\"\\$SECRET\\", \\"metrics\\": { \\"cpu\\": \\"\\$CPU\\", \\"ram\\": \\"\\$RAM\\", \\"ram_total\\": \\"\\$RAM_TOTAL\\", \\"ram_used\\": \\"\\$RAM_USED\\", \\"swap_total\\": \\"\\$SWAP_TOTAL\\", \\"swap_used\\": \\"\\$SWAP_USED\\", \\"disk\\": \\"\\$DISK\\", \\"disk_total\\": \\"\\$DISK_TOTAL\\", \\"disk_used\\": \\"\\$DISK_USED\\", \\"load\\": \\"\\$LOAD\\", \\"uptime\\": \\"\\$UPTIME\\", \\"boot_time\\": \\"\\$BOOT_TIME\\", \\"net_rx\\": \\"\\$RX_NOW\\", \\"net_tx\\": \\"\\$TX_NOW\\", \\"net_in_speed\\": \\"\\$RX_SPEED\\", \\"net_out_speed\\": \\"\\$TX_SPEED\\", \\"os\\": \\"\\$OS\\", \\"arch\\": \\"\\$ARCH\\", \\"cpu_info\\": \\"\\$CPU_INFO\\", \\"processes\\": \\"\\$PROCESSES\\", \\"tcp_conn\\": \\"\\$TCP_CONN\\", \\"udp_conn\\": \\"\\$UDP_CONN\\", \\"ip_v4\\": \\"\\$IPV4\\", \\"ip_v6\\": \\"\\$IPV6\\", \\"ping_ct\\": \\"\\$PING_CT\\", \\"ping_cu\\": \\"\\$PING_CU\\", \\"ping_cm\\": \\"\\$PING_CM\\", \\"ping_bd\\": \\"\\$PING_BD\\", \\"loss_ct\\": \\"\\$LOSS_CT\\", \\"loss_cu\\": \\"\\$LOSS_CU\\", \\"loss_cm\\": \\"\\$LOSS_CM\\", \\"loss_bd\\": \\"\\$LOSS_BD\\", \\"virt\\": \\"\\$VIRT\\" }}"
  
  RES=\\$(curl -s -X POST -H "Content-Type: application/json" -d "\\$PAYLOAD" "\\$WORKER_URL" 2>/dev/null)
  if echo "\\$RES" | grep -q "INTERVAL="; then
    NEW_INV=\\$(echo "\\$RES" | awk -F'INTERVAL=' '{print \\$2}' | awk -F'|' '{print \\$1}')
    if [ -n "\\$NEW_INV" ] && [ "\\$NEW_INV" -eq "\\$NEW_INV" ] 2>/dev/null; then REPORT_INTERVAL=\\$NEW_INV; fi
    
    NEW_CT=\\$(echo "\\$RES" | awk -F'CT=' '{print \\$2}' | awk -F'|' '{print \\$1}')
    [ -n "\\$NEW_CT" ] && PING_NODE_CT="\\$NEW_CT"
    
    NEW_CU=\\$(echo "\\$RES" | awk -F'CU=' '{print \\$2}' | awk -F'|' '{print \\$1}')
    [ -n "\\$NEW_CU" ] && PING_NODE_CU="\\$NEW_CU"
    
    NEW_CM=\\$(echo "\\$RES" | awk -F'CM=' '{print \\$2}' | awk -F'|' '{print \\$1}')
    [ -n "\\$NEW_CM" ] && PING_NODE_CM="\\$NEW_CM"
  fi
  sleep \\$REPORT_INTERVAL
done
EOF

chmod +x /usr/local/bin/cf-probe.sh

`;

  if (osType === 'alpine') {
    realBashScript += `cat << EOF > /etc/init.d/cf-probe
#!/sbin/openrc-run
name="cf-probe"
command="/usr/local/bin/cf-probe.sh"
command_background="yes"
pidfile="/run/cf-probe.pid"
EOF

chmod +x /etc/init.d/cf-probe
rc-update add cf-probe default
rc-service cf-probe restart
echo "✅ Alpine 探针安装成功！"
`;
  } else {
    realBashScript += `cat << EOF > /etc/systemd/system/cf-probe.service
[Unit]
Description=Cloudflare Worker Probe Agent
After=network.target

[Service]
ExecStart=/usr/local/bin/cf-probe.sh
Restart=always
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable cf-probe.service
systemctl restart cf-probe.service
echo "✅ Linux 探针安装成功！"
`;
  }

  const b64BashScript = encodeBase64(realBashScript);
  const bashWrapper = `#!/bin/sh
echo ">> Downloading Secure Payload from CF-Monitor..."
echo "${b64BashScript}" | base64 -d > /tmp/cf_install.sh
sh /tmp/cf_install.sh "$1" "$2"
rm -f /tmp/cf_install.sh
`;
  return bashWrapper;
}
