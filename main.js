const { app, BrowserWindow, ipcMain } = require('electron')
const { exec, execFile } = require('child_process')
const path = require('path')
const fs = require('fs')

let mainWin = null
let overlayWin = null
let overlayTimer = null
let splash = null

function createSplash () {
  try {
    splash = new BrowserWindow({
      width: 420, height: 470,
      frame: false, transparent: true, resizable: false,
      alwaysOnTop: true, center: true, skipTaskbar: true, hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })
    splash.loadFile(path.join(__dirname, 'src', 'splash.html'))
    splash.on('closed', () => { splash = null })
  } catch (e) { splash = null }
}

function closeSplash () {
  try { if (splash && !splash.isDestroyed()) splash.close() } catch (e) {}
  splash = null
}

function createWindow () {
  mainWin = new BrowserWindow({
    width: 1080, height: 720, minWidth: 900, minHeight: 600,
    show: false,
    title: 'Set Computer Ty.ppw & Power By Chubby.com',
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#07060d',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'src', 'preload.js')
    }
  })
  mainWin.loadFile(path.join(__dirname, 'src', 'index.html'))
  mainWin.setMenu(null)

  // ── เปิดหน้าต่างหลักแบบรับประกัน (ไม่พึ่ง event ใด ๆ) ──
  let revealed = false
  const reveal = () => {
    if (revealed) return
    revealed = true
    // สั่ง splash เล่นอนิเมชันขยายออกก่อนปิด (เอฟเฟกต์พุ่งเข้าโปรแกรม)
    try {
      if (splash && !splash.isDestroyed()) {
        splash.webContents.executeJavaScript('window.__exit && window.__exit()').catch(() => {})
      }
    } catch (e) {}
    setTimeout(() => {
      closeSplash()
      try { if (mainWin && !mainWin.isDestroyed()) { mainWin.show(); mainWin.focus() } } catch (e) {}
    }, 460)
  }
  setTimeout(reveal, 6000)                              // ปกติ: โชว์หลัง 6 วิ
  setTimeout(() => { closeSplash(); try { if (mainWin && !mainWin.isDestroyed() && !mainWin.isVisible()) mainWin.show() } catch (e) {} }, 13000) // failsafe สุดท้าย
  mainWin.webContents.on('did-fail-load', () => setTimeout(reveal, 500))
  mainWin.on('closed', () => { closeSplash(); mainWin = null })
}

// ── helper: run powershell, parse JSON ──────────────────────────
// ── ตัวช่วยรัน PowerShell แบบเขียนไฟล์ (ASCII + BOM เสมอ) ──
//    ย้ายมาพร้อม handler ชุด os-profile / svc-disable / health-check
//    ถ้าลืมตัวนี้ handler ทั้งชุดจะพังทันทีที่ถูกเรียก
function runPs (script, name, timeout, cb) {
  let f
  try {
    f = path.join(app.getPath('temp'), name || 'gb_tmp.ps1')
    fs.writeFileSync(f, '\ufeff' + script, 'utf8')
  } catch (e) { return cb('') }
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f],
    { windowsHide: true, timeout: timeout || 30000, maxBuffer: 8 * 1024 * 1024 },
    (err, stdout) => { try { fs.unlinkSync(f) } catch (e) {} ; cb(String(stdout || '')) })
}

function psJson (ps, fallback) {
  return new Promise(resolve => {
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps.replace(/"/g, '\\"')}"`,
      { windowsHide: true, timeout: 12000 }, (err, stdout) => {
        if (err) return resolve(fallback)
        try { resolve(JSON.parse((stdout || '').trim())) } catch { resolve(fallback) }
      })
  })
}

// ── run a shell command ─────────────────────────────────────────
ipcMain.handle('run-cmd', (e, cmd) => new Promise(resolve => {
  exec(cmd, { shell: 'cmd.exe', windowsHide: true, timeout: 20000 }, (err, stdout, stderr) => {
    resolve({ ok: !err, out: (stdout || '').trim(), err: (stderr || '').trim() })
  })
}))

// ── system info (CPU / GPU / RAM) — dedicated-GPU scoring ────────
// ── รันหลายคำสั่งใน process เดียว — ลด spawn จากหลักร้อยเหลือหลักสิบ ──
// เขียนเป็น .bat แล้วรันครั้งเดียว คั่นผลด้วย marker เพื่อแยกผลรายคำสั่งได้เหมือนเดิม
ipcMain.handle('run-batch', (_e, cmds) => new Promise(resolve => {
  const list = Array.isArray(cmds) ? cmds.filter(c => typeof c === 'string' && c.trim()) : []
  if (!list.length) return resolve([])
  const MARK = '###GB'
  const lines = ['@echo off', 'chcp 65001 > nul']
  list.forEach((c, i) => {
    lines.push(c)
    lines.push(`echo ${MARK}:${i}:%ERRORLEVEL%${MARK}`)
  })
  let bat
  try {
    bat = path.join(app.getPath('temp'), 'gb_batch_' + Date.now() + '.bat')
    fs.writeFileSync(bat, lines.join('\r\n'), 'utf8')
  } catch (e) {
    return resolve(list.map(() => ({ ok: false, out: '', err: 'temp write failed' })))
  }
  exec(`"${bat}"`, { shell: 'cmd.exe', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024 },
    (err, stdout, stderr) => {
      try { fs.unlinkSync(bat) } catch (e) {}
      const raw = String(stdout || '')
      const out = []
      // ตัดผลลัพธ์ตาม marker — ข้อความก่อน marker ตัวที่ i คือ output ของคำสั่งที่ i
      const re = new RegExp(MARK + ':(\\d+):(\\d+)' + MARK)
      let rest = raw
      for (let i = 0; i < list.length; i++) {
        const m = rest.match(re)
        if (!m) { out.push({ ok: !err, out: '', err: '' }); continue }
        const idx = rest.indexOf(m[0])
        out.push({ ok: m[2] === '0', out: rest.slice(0, idx).trim(), err: '' })
        rest = rest.slice(idx + m[0].length)
      }
      if (out.length && String(stderr || '').trim()) out[out.length - 1].err = String(stderr).trim()
      resolve(out)
    })
}))

ipcMain.handle('sysinfo', () => {
  const ps = `$p=Get-CimInstance Win32_Processor | Select-Object -First 1; $c=$p.Name; ` +
             `$cores=[int]$p.NumberOfCores; $threads=[int]$p.NumberOfLogicalProcessors; ` +
             `$gpus=Get-CimInstance Win32_VideoController | Where-Object {$_.Name -and $_.PNPDeviceID -notlike 'ROOT\\*' -and $_.Name -notmatch 'Microsoft|Basic|Remote|Virtual|Parsec|Meta|Citrix|VNC|DisplayLink'}; ` +
             `$scored=$gpus | ForEach-Object { $n=$_.Name; $s=1; ` +
             `if($n -match 'NVIDIA|GeForce|RTX|GTX|Quadro|Radeon RX|Radeon Pro|Arc A[0-9]|Arc B[0-9]'){$s=3} ` +
             `elseif($n -match 'Radeon.*Graphics|Vega|Intel.*Graphics|UHD|Iris|HD Graphics'){$s=0}; ` +
             `[pscustomobject]@{N=$n; S=$s; R=[int64]($_.AdapterRAM)} }; ` +
             `$g=($scored | Sort-Object S,R -Descending | Select-Object -First 1).N; ` +
             `if(-not $g){$g=(Get-CimInstance Win32_VideoController | Select-Object -First 1).Name}; ` +
             `$allg=(($gpus | ForEach-Object { $_.Name }) -join '|'); ` +
             `$r=[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB); ` +
             `$ct=@(); try{ $ct=@((Get-CimInstance Win32_SystemEnclosure).ChassisTypes) }catch{}; ` +
             `$port=$false; foreach($t in $ct){ if(@(8,9,10,11,12,14,18,21,30,31,32) -contains [int]$t){$port=$true} }; ` +
             `$bat=$false; try{ if(Get-CimInstance Win32_Battery -EA SilentlyContinue){$bat=$true} }catch{}; ` +
             `$lap=[bool]($port -or $bat); ` +
             // RAM รายละเอียด: ชนิด (DDR3/4/5), ความเร็วจริง, จำนวนแถว, ขนาดต่อแถว, ช่องที่ใช้
             `$mm=@(); try{ $mm=@(Get-CimInstance Win32_PhysicalMemory) }catch{}; ` +
             `$sticks=$mm.Count; ` +
             `$mspeed=0; if($sticks -gt 0){ $mspeed=[int](($mm | ForEach-Object { if($_.ConfiguredClockSpeed){[int]$_.ConfiguredClockSpeed}else{[int]$_.Speed} } | Measure-Object -Minimum).Minimum) }; ` +
             `$mrated=0; if($sticks -gt 0){ $mrated=[int](($mm | ForEach-Object { [int]$_.Speed } | Measure-Object -Maximum).Maximum) }; ` +
             `$mtype=0; if($sticks -gt 0){ $mtype=[int]($mm[0].SMBIOSMemoryType) }; ` +
             `$msizes=(($mm | ForEach-Object { [int]([int64]$_.Capacity/1GB) }) -join ','); ` +
             `$mslots=(($mm | ForEach-Object { [string]$_.DeviceLocator }) -join ','); ` +
             `$hz=0; try{ $hz=[int]((Get-CimInstance Win32_VideoController | Measure-Object -Property CurrentRefreshRate -Maximum).Maximum) }catch{}; ` +
             `$onbat=$false; try{ $bb=Get-CimInstance Win32_Battery -EA SilentlyContinue | Select-Object -First 1; if($bb -and [int]$bb.BatteryStatus -eq 1){$onbat=$true} }catch{}; ` +
             `ConvertTo-Json -Compress @{cpu=$c; gpu=$g; ram=$r; cores=$cores; threads=$threads; laptop=$lap; allGpu=$allg; ramSticks=$sticks; ramSpeed=$mspeed; ramRated=$mrated; ramType=$mtype; ramSizes=$msizes; ramSlots=$mslots; hz=$hz; onBattery=$onbat}`
  return psJson(ps, { cpu: null, gpu: null, ram: null, cores: 0, threads: 0, laptop: false, allGpu: '', ramSticks: 0, ramSpeed: 0, ramRated: 0, ramType: 0, ramSizes: '', ramSlots: '', hz: 0, onBattery: false })
})

// ── live hardware stats: load / ram / temps ─────────────────────
function getHwStats () {
  const ps = `$l=[math]::Round((Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average); ` +
             `$os=Get-CimInstance Win32_OperatingSystem; ` +
             `$ru=[math]::Round(($os.TotalVisibleMemorySize-$os.FreePhysicalMemory)/1MB,1); ` +
             `$rt=[math]::Round($os.TotalVisibleMemorySize/1MB,1); ` +
             `$ct=$null; try{ $t=Get-CimInstance -Namespace root/wmi -Class MSAcpi_ThermalZoneTemperature -EA Stop | Select-Object -First 1; if($t){$ct=[math]::Round(($t.CurrentTemperature/10)-273.15)} }catch{}; ` +
             `$gt=$null; try{ $q=(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>$null | Select-Object -First 1); if($q){$gt=[int]($q.Trim())} }catch{}; ` +
             `ConvertTo-Json -Compress @{cpuLoad=$l; ramUsed=$ru; ramTot=$rt; cpuTemp=$ct; gpuTemp=$gt}`
  return psJson(ps, {})
}
ipcMain.handle('hwstats', () => getHwStats())

// ── quick ping (ms) ─────────────────────────────────────────────
function getPing (host) {
  const h = (host || '1.1.1.1').replace(/[^a-zA-Z0-9.\-]/g, '')
  return new Promise(resolve => {
    exec(`ping -n 1 -w 1000 ${h}`, { windowsHide: true, timeout: 5000 }, (err, stdout) => {
      const m = (stdout || '').match(/[=<]\s*(\d+)\s*ms/i)
      resolve({ ms: m ? parseInt(m[1]) : null })
    })
  })
}
ipcMain.handle('quick-ping', (e, host) => getPing(host))

// ── detect running games ────────────────────────────────────────
// ── Startup Manager: อ่านรายการโปรแกรมที่เปิดตอนบูตจริง ──
// ══════════ LICENSE ══════════
// ตรวจคีย์กับเซิร์ฟเวอร์ + ผูกกับเครื่อง (HWID)
// หมายเหตุตามตรง: การตรวจฝั่งไคลเอนต์แก้ได้เสมอ ระบบนี้มีไว้คุมการแจกจ่าย
// และให้ถอนคีย์ได้ ไม่ใช่การป้องกันการแคร็ก
const LICENSE_API = 'https://YOUR-WORKER.workers.dev'   // <<< เปลี่ยนเป็น URL ของคุณ
const LIC_FILE = () => path.join(app.getPath('userData'), 'lic.dat')

// รหัสเครื่อง: CPU + เมนบอร์ด + ดิสก์ + ชื่อเครื่อง แล้วแฮชเป็น 32 ตัว
ipcMain.handle('get-hwid', () => new Promise(resolve => {
  const ps = [
    '$p = ""',
    'try { $p += (Get-CimInstance Win32_Processor | Select-Object -First 1).ProcessorId } catch {}',
    'try { $p += (Get-CimInstance Win32_BaseBoard | Select-Object -First 1).SerialNumber } catch {}',
    'try { $p += (Get-CimInstance Win32_DiskDrive | Sort-Object Index | Select-Object -First 1).SerialNumber } catch {}',
    'try { $p += (Get-CimInstance Win32_ComputerSystemProduct).UUID } catch {}',
    '$p = ($p -replace "\s","")',
    'if ($p.Length -lt 8) { $p = $env:COMPUTERNAME + $env:PROCESSOR_IDENTIFIER }',
    '$h = [System.Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($p))',
    'Write-Output ("HWID:" + (($h | ForEach-Object { $_.ToString("x2") }) -join "").Substring(0,32))'
  ].join('\r\n')
  let script
  try {
    script = path.join(app.getPath('temp'), 'gb_hwid.ps1')
    fs.writeFileSync(script, '\ufeff' + ps, 'utf8')
  } catch (e) { return resolve({ ok: false }) }
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
    { windowsHide: true, timeout: 25000 }, (err, stdout) => {
      try { fs.unlinkSync(script) } catch (e) {}
      const m = String(stdout || '').match(/HWID:([0-9a-f]{32})/)
      resolve(m ? { ok: true, hwid: m[1] } : { ok: false })
    })
}))

// อ่าน/เขียนไฟล์ license ในเครื่อง
function licRead () {
  try { return JSON.parse(Buffer.from(fs.readFileSync(LIC_FILE(), 'utf8'), 'base64').toString('utf8')) }
  catch (e) { return null }
}
function licWrite (obj) {
  try { fs.writeFileSync(LIC_FILE(), Buffer.from(JSON.stringify(obj), 'utf8').toString('base64'), 'utf8'); return true }
  catch (e) { return false }
}

ipcMain.handle('license-load', () => Promise.resolve(licRead()))
ipcMain.handle('license-clear', () => { try { fs.unlinkSync(LIC_FILE()) } catch (e) {} ; return Promise.resolve({ ok: true }) })

// ตรวจคีย์ในเครื่อง — คีย์คำนวณจากรหัสเครื่อง จึงใช้ได้เครื่องเดียว
// ไม่มีเซิร์ฟเวอร์ = ไม่มีอะไรพัง แต่ก็ถอนคีย์ทีหลังไม่ได้
const LIC_SALT = 'TyPPW-GameBoost-2026-CringeEXE-9f3a'
function licExpected (hwid) {
  const crypto = require('crypto')
  const hex = crypto.createHash('sha256').update(LIC_SALT + String(hwid || '')).digest('hex')
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 16; i++) out += A[parseInt(hex.substr(i * 2, 2), 16) % A.length]
  return 'GBFPS-' + out.slice(0, 4) + '-' + out.slice(4, 8) + '-' + out.slice(8, 12) + '-' + out.slice(12, 16)
}

ipcMain.handle('license-call', (_e, args) => {
  const key = String((args && args.key) || '').trim().toUpperCase()
  const hwid = String((args && args.hwid) || '').trim()
  if (!key || !hwid) return Promise.resolve({ ok: false, code: 'BADREQ', msg: 'ข้อมูลไม่ครบ' })
  if (key === licExpected(hwid)) {
    licWrite({ key, hwid, ok: true, at: Date.now() })
    return Promise.resolve({ ok: true, msg: 'เปิดใช้งานสำเร็จ' })
  }
  try { fs.unlinkSync(LIC_FILE()) } catch (e) {}
  return Promise.resolve({ ok: false, code: 'BADKEY', msg: 'คีย์ไม่ถูกต้องสำหรับเครื่องนี้' })
})

/* ══════════ อ่านความสามารถของการ์ดจอจากของจริง ══════════
   ไม่เดาว่า DLSS รุ่นไหนออกแล้ว  อ่านเวอร์ชันจาก nvngx_dlss.dll ในเครื่อง
   แล้วบอกว่ารองรับอะไร  ใช้ได้กับ DLSS 4, 5 หรือรุ่นไหนก็ตามที่มาใหม่ */
/* ══ REMOTE BLOCKLIST ══════════════════════════════════════════════
   A small signed JSON on the owner's GitHub lets a bad card be switched
   off for every customer without rebuilding (e.g. BBR2 on 24H2+, Oct 2026).
   - Signed with Ed25519. The private key never ships; only this public key.
   - Unsigned, wrongly signed or older files are ignored (no rollback).
   - Offline or placeholder URL = the app works normally with its own rules.
   File format: {"payload":"<json text>","sig":"<base64 ed25519 signature of payload>"}
   payload:     {"seq":3,"issued":"2026-10-14","rules":{"net_bbr":{"maxBuild":26100,"why":"..."}}}
   ════════════════════════════════════════════════════════════════════ */
const BLOCKLIST_URL = 'https://raw.githubusercontent.com/papinwitlertwilai-max/gameboostfps/HEAD/blocklist.json'
const BLOCKLIST_PUBKEY = 'MCowBQYDK2VwAyEA7VXk797CL8fQVR4I2J6rZKswcMp6VCEqT8ihTt2h3H8='
const BL_CACHE = () => path.join(app.getPath('userData'), 'blocklist.json')
function blVerify (obj) {
  try {
    if (!obj || typeof obj.payload !== 'string' || typeof obj.sig !== 'string') return null
    const key = require('crypto').createPublicKey({ key: Buffer.from(BLOCKLIST_PUBKEY, 'base64'), format: 'der', type: 'spki' })
    if (!require('crypto').verify(null, Buffer.from(obj.payload, 'utf8'), key, Buffer.from(obj.sig, 'base64'))) return null
    const data = JSON.parse(obj.payload)
    if (!data || typeof data.seq !== 'number' || !data.rules || typeof data.rules !== 'object') return null
    return data
  } catch (e) { return null }
}
function blFetch () {
  return new Promise(resolve => {
    if (/OWNER\/REPO/.test(BLOCKLIST_URL)) return resolve(null)
    let done = false; const fin = v => { if (!done) { done = true; resolve(v) } }
    try {
      const req = require('https').get(BLOCKLIST_URL + '?t=' + Date.now(), { timeout: 6000 }, res => {
        if (res.statusCode !== 200) { res.resume(); return fin(null) }
        let body = ''; res.setEncoding('utf8')
        res.on('data', d => { body += d; if (body.length > 256 * 1024) { req.destroy(); fin(null) } })
        res.on('end', () => { try { fin(JSON.parse(body)) } catch (e) { fin(null) } })
      })
      req.on('timeout', () => { req.destroy(); fin(null) })
      req.on('error', () => fin(null))
    } catch (e) { fin(null) }
  })
}
ipcMain.handle('blocklist-get', async () => {
  let cached = null
  try { cached = blVerify(JSON.parse(fs.readFileSync(BL_CACHE(), 'utf8'))) } catch (e) {}
  const raw = await blFetch()
  const fresh = raw ? blVerify(raw) : null
  if (fresh && (!cached || fresh.seq >= cached.seq)) {
    try { fs.writeFileSync(BL_CACHE(), JSON.stringify(raw), 'utf8') } catch (e) {}
    return { ok: true, source: 'net', seq: fresh.seq, issued: fresh.issued || '', rules: fresh.rules }
  }
  if (cached) return { ok: true, source: 'cache', seq: cached.seq, issued: cached.issued || '', rules: cached.rules }
  return { ok: true, source: /OWNER\/REPO/.test(BLOCKLIST_URL) ? 'off' : 'none', seq: 0, rules: {} }
})

/* ══ SUPPORT BUNDLE ═════════════════════════════════════════════════
   One zip on the Desktop the customer can drop into Discord. Built after a
   Steam case that took four rounds of scripts over Parsec to diagnose.
   Contains system/driver/network/service/Steam-log state and the app log.
   No browser data, no documents, no passwords.
   ════════════════════════════════════════════════════════════════════ */
const SUPPORT_PS = `$ErrorActionPreference = 'SilentlyContinue'
$D = '@@DIR@@'
function W($name, $lines){ $lines | Out-File -FilePath (Join-Path $D $name) -Encoding UTF8 -Width 400 }
$os = Get-CimInstance Win32_OperatingSystem
$cv = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
$sys = @()
$sys += 'OS      : ' + $os.Caption + ' ' + $cv.DisplayVersion + ' build ' + $cv.CurrentBuild + '.' + $cv.UBR + ' ' + $cv.EditionID
$sys += 'Boot    : ' + $os.LastBootUpTime
$sys += 'CPU     : ' + ((Get-CimInstance Win32_Processor | Select-Object -First 1).Name)
Get-CimInstance Win32_VideoController | ForEach-Object { $sys += 'GPU     : ' + $_.Name + '  driver ' + $_.DriverVersion + '  ' + $_.CurrentRefreshRate + ' Hz' }
Get-CimInstance Win32_PhysicalMemory | ForEach-Object { $sys += 'RAM     : ' + [math]::Round($_.Capacity/1GB) + ' GB  rated ' + $_.Speed + '  running ' + $_.ConfiguredClockSpeed + '  type ' + $_.SMBIOSMemoryType + '  ' + $_.Manufacturer + ' ' + $_.PartNumber }
$sys += 'Power   : ' + (powercfg /getactivescheme)
$sys += 'HAGS    : ' + (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers').HwSchMode
$sys += 'VBS/HVCI: ' + (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity').Enabled
$sys += 'SAC     : ' + (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy').VerifiedAndReputablePolicyState
$sys += 'UAC     : EnableLUA=' + (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System').EnableLUA
W 'system.txt' $sys
W 'network.txt' ((netsh int tcp show supplemental) + '' + (netsh int tcp show global) + '' + (Get-NetAdapter | Format-Table Name, InterfaceDescription, Status, LinkSpeed -AutoSize | Out-String))
$ifeo = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options'
$il = @()
Get-ChildItem $ifeo | ForEach-Object {
  $p = Get-ItemProperty $_.PSPath; $po = Get-ItemProperty (Join-Path $_.PSPath 'PerfOptions')
  if($p.Debugger -or $p.MitigationOptions -or $po){ $il += $_.PSChildName + '  Debugger=' + $p.Debugger + '  Cpu=' + $po.CpuPriorityClass + '  Io=' + $po.IoPriority + '  Page=' + $po.PagePriority }
}
W 'ifeo.txt' $il
W 'services_disabled.txt' (Get-CimInstance Win32_Service -Filter "StartMode='Disabled'" | Sort-Object Name | ForEach-Object { $_.Name + '  (' + $_.DisplayName + ')' })
$vc = @()
foreach($f in 'msvcp140.dll','msvcp140_1.dll','msvcp140_2.dll','vcruntime140.dll','vcruntime140_1.dll','mfplat.dll'){
  $p = Join-Path $env:windir ('System32\\' + $f)
  if(Test-Path $p){ $vc += 'OK      ' + $f + '  ' + (Get-Item $p).VersionInfo.FileVersion } else { $vc += 'MISSING ' + $f }
}
W 'runtimes.txt' $vc
W 'processes.txt' (('-- top CPU --') + (Get-Process | Sort-Object CPU -Descending | Select-Object -First 25 | Format-Table Name, Id, CPU, @{n='MB';e={[int]($_.WorkingSet64/1MB)}} -AutoSize | Out-String) + ('-- top RAM --') + (Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 25 | Format-Table Name, Id, @{n='MB';e={[int]($_.WorkingSet64/1MB)}} -AutoSize | Out-String))
W 'boot.txt' (bcdedit /enum '{current}')
$since = (Get-Date).AddDays(-3)
W 'events.txt' (Get-WinEvent -FilterHashtable @{LogName='Application'; Level=1,2; StartTime=$since} -MaxEvents 40 | ForEach-Object { $_.TimeCreated.ToString('s') + '  ' + $_.ProviderName + '  ' + (($_.Message -replace '\\s+',' ') -replace '^(.{0,300}).*','$1') })
$sp = (Get-ItemProperty 'HKCU:\\Software\\Valve\\Steam').SteamPath
if($sp){
  $sp = $sp -replace '/', '\\'
  $sd = Join-Path $D 'steam'; New-Item -ItemType Directory -Path $sd -Force | Out-Null
  'SteamPath = ' + $sp | Out-File (Join-Path $sd 'path.txt') -Encoding UTF8
  foreach($lg in 'console_log.txt','bootstrap_log.txt','webhelper.txt','cef_log.txt','connection_log.txt'){
    $f = Join-Path $sp ('logs\\' + $lg)
    if(Test-Path $f){ Get-Content $f -Tail 200 | Out-File (Join-Path $sd $lg) -Encoding UTF8 }
  }
}
$zip = Join-Path ([Environment]::GetFolderPath('Desktop')) ((Split-Path $D -Leaf) + '.zip')
Compress-Archive -Path (Join-Path $D '*') -DestinationPath $zip -Force
if(Test-Path $zip){ 'ZIP=' + $zip } else { 'FAIL' }
`
ipcMain.handle('support-bundle', (_e, info) => new Promise(resolve => {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const dir = path.join(app.getPath('temp'), 'GameBoost_Support_' + stamp)
    fs.mkdirSync(dir, { recursive: true })
    const i = info || {}
    fs.writeFileSync(path.join(dir, 'app_state.json'), JSON.stringify({
      created: new Date().toISOString(), app: i.app || {}, os: i.os || {}, gpu: i.gpu || {}, sys: i.sys || {},
      blocklist: i.blocklist || null, applied: i.applied || [], brain: i.brain || null
    }, null, 1), 'utf8')
    fs.writeFileSync(path.join(dir, 'app_log.txt'), (i.log || []).join('\r\n'), 'utf8')
    runPs(SUPPORT_PS.replace('@@DIR@@', dir.replace(/'/g, "''")), 'gb_support.ps1', 120000, out => {
      const m = /ZIP=(.+)/.exec(out || '')
      const zip = m ? m[1].trim() : ''
      try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) {}
      if (zip) { try { require('electron').shell.showItemInFolder(zip) } catch (e) {} }
      resolve(zip ? { ok: true, path: zip } : { ok: false, out: String(out || '').slice(-400) })
    })
  } catch (e) { resolve({ ok: false, out: String(e) }) }
}))

ipcMain.handle('gpu-caps', () => new Promise(resolve => {
  const L = [
    '$o = @{}',
    'try {',
    '  $g = Get-CimInstance Win32_VideoController -EA Stop | Where-Object { $_.PNPDeviceID -match "^PCI" } | Select-Object -First 1',
    '  $o.name = $g.Name',
    '  $o.driver = $g.DriverVersion',
    '  $o.vram = [math]::Round($g.AdapterRAM / 1GB, 1)',
    '} catch {}',
    '$o.vendor = "unknown"',
    'if ($o.name -match "NVIDIA|GeForce|RTX|GTX|Quadro") { $o.vendor = "nvidia" }',
    'elseif ($o.name -match "Radeon|AMD") { $o.vendor = "amd" }',
    'elseif ($o.name -match "Intel|Arc") { $o.vendor = "intel" }',
    '#',
    '$dlss = $null',
    'foreach ($p in @("$env:SystemRoot\\System32\\nvngx_dlss.dll","$env:ProgramFiles\\NVIDIA Corporation\\NGX\\nvngx_dlss.dll")) {',
    '  if (Test-Path $p) { try { $dlss = (Get-Item $p).VersionInfo.FileVersion } catch {} ; if ($dlss) { break } }',
    '}',
    'if (-not $dlss) {',
    '  try { $f = Get-ChildItem "$env:SystemRoot\\System32\\DriverStore\\FileRepository" -Filter nvngx_dlss.dll -Recurse -EA SilentlyContinue | Select-Object -First 1; if ($f) { $dlss = $f.VersionInfo.FileVersion } } catch {}',
    '}',
    '$o.dlssVer = $dlss',
    'if ($dlss) { $o.dlssMajor = [int](($dlss -split "[.,]")[0].Trim()) } else { $o.dlssMajor = 0 }',
    '#',
    '$o.hasFG = (Test-Path "$env:SystemRoot\\System32\\nvngx_dlssg.dll")',
    'if (-not $o.hasFG) { try { $o.hasFG = [bool](Get-ChildItem "$env:SystemRoot\\System32\\DriverStore\\FileRepository" -Filter nvngx_dlssg.dll -Recurse -EA SilentlyContinue | Select-Object -First 1) } catch { $o.hasFG = $false } }',
    '$o.hasRR = (Test-Path "$env:SystemRoot\\System32\\nvngx_dlssd.dll")',
    'if (-not $o.hasRR) { try { $o.hasRR = [bool](Get-ChildItem "$env:SystemRoot\\System32\\DriverStore\\FileRepository" -Filter nvngx_dlssd.dll -Recurse -EA SilentlyContinue | Select-Object -First 1) } catch { $o.hasRR = $false } }',
    '#',
    '$o.hasFSR = $false',
    'try { $o.hasFSR = [bool](Get-ChildItem "$env:SystemRoot\\System32" -Filter "amdxcffx64.dll" -EA SilentlyContinue) } catch {}',
    '$o.hasXeSS = (Test-Path "$env:SystemRoot\\System32\\libxess.dll")',
    '#',
    'try { $o.autoHDR = [bool](Get-ItemProperty "HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences" -EA SilentlyContinue) } catch { $o.autoHDR = $false }',
    'try { $o.dstorage = (Test-Path "$env:SystemRoot\\System32\\dstorage.dll") } catch { $o.dstorage = $false }',
    'ConvertTo-Json -Compress $o'
  ].join('\r\n')
  runPs(L, 'gb_gpucaps.ps1', 60000, out => {
    try {
      const line = String(out).split(/\r?\n/).filter(x => x.trim().startsWith('{')).pop()
      resolve(JSON.parse(line))
    } catch (e) { resolve({}) }
  })
}))

/* ══════════ อ่านสภาพเครื่อง ══════════
   Windows แต่ละรุ่นรองรับค่าไม่เท่ากัน  และเครื่องที่ debloat มาอาจถูกถอด component ออก
   เก็บข้อมูลนี้ไว้ให้การ์ดตัดสินใจเอง แทนที่จะรันแล้วหวังว่าจะผ่าน */
ipcMain.handle('os-profile', () => new Promise(resolve => {
  const L = [
    '$o = @{}',
    'try {',
    '  $cv = "HKLM:\\\\SOFTWARE\\\\Microsoft\\\\Windows NT\\\\CurrentVersion"',
    '  $o.build   = [int](Get-ItemProperty $cv -Name CurrentBuildNumber -EA SilentlyContinue).CurrentBuildNumber',
    '  $o.ubr     = [int](Get-ItemProperty $cv -Name UBR -EA SilentlyContinue).UBR',
    '  $o.edition = (Get-ItemProperty $cv -Name EditionID -EA SilentlyContinue).EditionID',
    '  $o.product = (Get-ItemProperty $cv -Name ProductName -EA SilentlyContinue).ProductName',
    '  $o.display = (Get-ItemProperty $cv -Name DisplayVersion -EA SilentlyContinue).DisplayVersion',
    '} catch {}',
    '$o.win11 = ($o.build -ge 22000)',
    '#',
    'try {',
    '  $lic = Get-CimInstance SoftwareLicensingProduct -EA Stop | Where-Object { $_.PartialProductKey -and $_.ApplicationID -eq "55c92734-d682-4d71-983e-d6ec3f16059f" } | Select-Object -First 1',
    '  $o.activated = ($lic -and $lic.LicenseStatus -eq 1)',
    '} catch { $o.activated = $null }',
    '#',
    '$o.hasDefender = [bool](Get-Service WinDefend -EA SilentlyContinue)',
    '$o.hasMF       = (Test-Path "$env:SystemRoot\\\\System32\\\\mfplat.dll")',
    '$o.hasWU       = [bool](Get-Service wuauserv -EA SilentlyContinue)',
    '$o.hasStore    = [bool](Get-Service InstallService -EA SilentlyContinue)',
    '$o.hasXbox     = [bool](Get-Service XblAuthManager -EA SilentlyContinue)',
    '$o.hasSearch   = [bool](Get-Service WSearch -EA SilentlyContinue)',
    '#',
    'try { $o.svcCount = @(Get-Service -EA SilentlyContinue).Count } catch { $o.svcCount = 0 }',
    '$o.debloated = ($o.svcCount -gt 0 -and $o.svcCount -lt 150)',
    '#',
    'try { $o.lastBoot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString("o") } catch { $o.lastBoot = $null }',
    '#',
    'try {',
    '  Add-Type -Name RS -Namespace W -MemberDefinition "[DllImport(\\"user32.dll\\")] public static extern int GetSystemMetrics(int i);" -EA SilentlyContinue',
    '  $o.remoteSession = ([W.RS]::GetSystemMetrics(4096) -ne 0)',
    '} catch { $o.remoteSession = $null }',
    '#',
    '$rt = @()',
    'foreach ($pn in @("parsecd","parsec","AnyDesk","TeamViewer","rustdesk","mstsc")) { if (Get-Process -Name $pn -EA SilentlyContinue) { $rt += $pn } }',
    'if (Get-Service parsecd -EA SilentlyContinue) { $rt += "parsecd-svc" }',
    '$o.remoteTools = ($rt -join ",")',
    '$o.viaParsec = ($rt -match "parsec").Count -gt 0',
    '#',
    'try {',
    '  $hf = Get-HotFix -EA SilentlyContinue | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 1',
    '  if ($hf) { $o.lastUpdate = $hf.InstalledOn.ToString("yyyy-MM-dd"); $o.lastKB = $hf.HotFixID }',
    '} catch {}',
    '#',
    'try {',
    '  $dg = Get-CimInstance -ClassName Win32_DeviceGuard -Namespace root\\Microsoft\\Windows\\DeviceGuard -EA SilentlyContinue',
    '  $o.vbs = ($dg -and $dg.VirtualizationBasedSecurityStatus -eq 2)',
    '  $o.hvci = ($dg -and ($dg.SecurityServicesRunning -contains 2))',
    '} catch { $o.vbs = $null; $o.hvci = $null }',
    '#',
    'try {',
    '  $sac = (Get-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy" -Name VerifiedAndReputablePolicyState -EA SilentlyContinue).VerifiedAndReputablePolicyState',
    '  $o.sac = $sac',
    '} catch { $o.sac = $null }',
    '#',
    'try { $o.hasUdpGlobal = ((netsh int udp show global 2>&1 | Out-String) -notmatch "not found|invalid|unknown") } catch { $o.hasUdpGlobal = $false }',
    'ConvertTo-Json -Compress $o',
  ].join('\r\n')
  runPs(L, 'gb_osprofile.ps1', 45000, out => {
    try {
      const line = String(out).split(/\r?\n/).filter(x => x.trim().startsWith('{')).pop()
      resolve(JSON.parse(line))
    } catch (e) { resolve({}) }
  })
}))
/* ══════════ ปิด service อย่างปลอดภัย ══════════
   ก่อนหน้านี้สั่ง sc config X start=disabled ตรง ๆ  ถ้า service นั้นมีตัวอื่นพึ่งพาอยู่
   ตัวที่พึ่งพาจะพังตามโดยไม่มีใครบอก  และเป็นเหตุให้โปรแกรมอื่นเปิดไม่ขึ้นแบบหาสาเหตุยาก
   ตอนนี้เช็ค 3 ชั้น: มีอยู่จริง -> ไม่มีใครพึ่งพา -> ไม่ใช่ service ที่ระบบขาดไม่ได้ */
const SVC_PROTECTED = [
  'RpcSs','DcomLaunch','RpcEptMapper','AppInfo','CryptSvc','EventLog','Winmgmt',
  'Power','PlugPlay','LSM','ProfSvc','UserManager','SamSs','Schedule','BFE','nsi',
  'Dhcp','Dnscache','NlaSvc','netprofm','AudioSrv','Audiosrv','AudioEndpointBuilder',
  'Themes','ShellHWDetection','StateRepository','TokenBroker','SystemEventsBroker',
  'CoreMessagingRegistrar','DeviceInstall','WinDefend','SecurityHealthService','mpssvc'
]

ipcMain.handle('svc-disable', (_e, args) => new Promise(resolve => {
  const names = (args && Array.isArray(args.names) ? args.names : []).filter(n => /^[A-Za-z0-9_.]+$/.test(n))
  if (!names.length) return resolve({ ok: false, out: 'ไม่มีรายชื่อ service' })
  const L = [
    '$want = @(@@NAMES@@)',
    '$prot = @(@@PROT@@)',
    '$done = @(); $missing = @(); $blocked = @(); $protected = @()',
    'foreach ($n in $want) {',
    '  if ($prot -contains $n) { $protected += $n; continue }',
    '  $s = Get-Service -Name $n -EA SilentlyContinue',
    '  if (-not $s) { $missing += $n; continue }',
    '  if ($s.StartType -eq "Disabled") { $done += $n; continue }',
    '  # do not disable if something running depends on it',
    '  $dep = @()',
    '  try { $dep = @($s.DependentServices | Where-Object { $_.Status -eq "Running" -and $prot -notcontains $_.Name }) } catch {}',
    '  $depProt = @()',
    '  try { $depProt = @($s.DependentServices | Where-Object { $prot -contains $_.Name }) } catch {}',
    '  if ($depProt.Count -gt 0) { $blocked += ($n + "<-" + (($depProt | ForEach-Object { $_.Name }) -join ",")) ; continue }',
    '  if ($dep.Count -gt 0) { $blocked += ($n + "<-" + (($dep | ForEach-Object { $_.Name }) -join ",")) ; continue }',
    '  try {',
    '    Stop-Service -Name $n -Force -EA SilentlyContinue',
    '    Set-Service -Name $n -StartupType Disabled -EA Stop',
    '    $done += $n',
    '  } catch { $blocked += ($n + "<-err") }',
    '}',
    '$r = @{ done = $done; missing = $missing; blocked = $blocked; prot = $protected }',
    'ConvertTo-Json -Compress $r',
  ].join('\r\n')
    .replace('@@NAMES@@', names.map(n => "'" + n + "'").join(','))
    .replace('@@PROT@@', SVC_PROTECTED.map(n => "'" + n + "'").join(','))
  runPs(L, 'gb_svc.ps1', 90000, out => {
    try {
      const line = String(out).split(/\r?\n/).filter(x => x.trim().startsWith('{')).pop()
      const j = JSON.parse(line)
      const arr = v => Array.isArray(v) ? v : (v ? [v] : [])
      resolve({ ok: true, done: arr(j.done), missing: arr(j.missing), blocked: arr(j.blocked), prot: arr(j.prot) })
    } catch (e) { resolve({ ok: false, out: 'อ่านผลไม่ได้' }) }
  })
}))

// เปิด service กลับ
ipcMain.handle('svc-restore', (_e, args) => new Promise(resolve => {
  const names = (args && Array.isArray(args.names) ? args.names : []).filter(n => /^[A-Za-z0-9_.]+$/.test(n))
  if (!names.length) return resolve({ ok: false })
  const L = [
    "$want = @(" + names.map(n => "'" + n + "'").join(",") + ")",
    '$n = 0',
    'foreach ($s in $want) {',
    '  try { Set-Service -Name $s -StartupType Manual -EA Stop; $n++ } catch {}',
    '}',
    'Write-Output ("OKSVC:" + $n)'
  ].join('\r\n')
  runPs(L, 'gb_svcrestore.ps1', 60000, out => {
    const m = String(out).match(/OKSVC:(\d+)/)
    resolve(m ? { ok: true, restored: +m[1] } : { ok: false })
  })
}))
/* ══════════ ตรวจสุขภาพระบบหลังปรับ ══════════
   ค่าบางตัวทำให้โปรแกรมอื่นเปิดไม่ขึ้นแบบเงียบ ๆ  กว่าจะรู้ก็ไล่หาสาเหตุยาก
   ตรวจทันทีหลังปรับเสร็จว่าสิ่งที่โปรแกรมทั่วไปต้องใช้ยังอยู่ครบ */
ipcMain.handle('health-check', () => new Promise(resolve => {
  const L = [
    '$bad = @(); $warn = @()',
    '$need = @("RpcSs","DcomLaunch","AppInfo","CryptSvc","EventLog","Winmgmt","Dhcp","Dnscache","BFE","nsi")',
    'foreach ($n in $need) {',
    '  $s = Get-Service -Name $n -EA SilentlyContinue',
    '  if (-not $s) { continue }',
    '  if ($s.StartType -eq "Disabled") { $bad += ($n + ":disabled") ; continue }',
    '  if ($s.Status -ne "Running" -and $n -ne "AppInfo") { $warn += ($n + ":" + $s.Status) }',
    '}',
    '$mm = "HKLM:\\\\SOFTWARE\\\\Microsoft\\\\Windows NT\\\\CurrentVersion\\\\Multimedia\\\\SystemProfile"',
    '$sr = (Get-ItemProperty $mm -Name SystemResponsiveness -EA SilentlyContinue).SystemResponsiveness',
    'if ($sr -ne $null -and $sr -eq 0) { $bad += "SystemResponsiveness:0" }',
    '$ifeo = "HKLM:\\\\SOFTWARE\\\\Microsoft\\\\Windows NT\\\\CurrentVersion\\\\Image File Execution Options"',
    'foreach ($k in (Get-ChildItem $ifeo -EA SilentlyContinue)) {',
    '  $dbg = (Get-ItemProperty $k.PSPath -Name Debugger -EA SilentlyContinue).Debugger',
    '  if ($dbg) { $warn += ("IFEO-Debugger:" + $k.PSChildName) }',
    '}',
    '$pol = "HKLM:\\\\SOFTWARE\\\\Policies\\\\Microsoft\\\\Windows\\\\AppPrivacy"',
    '$bg = (Get-ItemProperty $pol -Name LetAppsRunInBackground -EA SilentlyContinue).LetAppsRunInBackground',
    'if ($bg -eq 2) { $warn += "BackgroundApps:blocked" }',
    '$r = @{ bad = $bad; warn = $warn }',
    'ConvertTo-Json -Compress $r',
  ].join('\r\n')
  runPs(L, 'gb_health.ps1', 60000, out => {
    try {
      const line = String(out).split(/\r?\n/).filter(x => x.trim().startsWith('{')).pop()
      const j = JSON.parse(line)
      const arr = v => Array.isArray(v) ? v : (v ? [v] : [])
      resolve({ ok: true, bad: arr(j.bad), warn: arr(j.warn) })
    } catch (e) { resolve({ ok: false }) }
  })
}))
// ── ตรวจสิทธิ์จริงตอนรัน ──
// ไม่เชื่อ manifest อย่างเดียว บางเครื่องเป็น admin แต่ยังถูก policy บล็อกการเขียน HKLM
ipcMain.handle('is-admin', () => new Promise(resolve => {
  const ps = [
    '$id = [Security.Principal.WindowsIdentity]::GetCurrent()',
    '$p = New-Object Security.Principal.WindowsPrincipal($id)',
    '$a = $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
    '$w = $false',
    'try {',
    '  $k = "HKLM:\\SOFTWARE\\GameBoostFPS"',
    '  if (-not (Test-Path $k)) { New-Item -Path $k -Force -EA Stop | Out-Null }',
    '  New-ItemProperty -Path $k -Name "_probe" -Value 1 -PropertyType DWord -Force -EA Stop | Out-Null',
    '  Remove-ItemProperty -Path $k -Name "_probe" -EA SilentlyContinue',
    '  $w = $true',
    '} catch {}',
    'Write-Output ("ADMIN:" + $a + ":" + $w)'
  ].join('\r\n')
  let f
  try {
    f = path.join(app.getPath('temp'), 'gb_admin.ps1')
    fs.writeFileSync(f, '\ufeff' + ps, 'utf8')
  } catch (e) { return resolve({ ok: false, admin: false, canWrite: false }) }
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f],
    { windowsHide: true, timeout: 25000 }, (err, stdout) => {
      try { fs.unlinkSync(f) } catch (e) {}
      const m = String(stdout || '').match(/ADMIN:(\w+):(\w+)/)
      resolve(m ? { ok: true, admin: m[1] === 'True', canWrite: m[2] === 'True' }
                : { ok: false, admin: false, canWrite: false })
    })
}))

// ── Timer Resolution 0.5ms — ต้องมี process ถือค่าไว้ ไม่งั้น Windows คืนค่าเดิมทันที ──
let timerProc = null
ipcMain.handle('timer-res', (_e, on) => new Promise(resolve => {
  const stop = () => { try { if (timerProc && !timerProc.killed) timerProc.kill() } catch (e) {} ; timerProc = null }
  if (!on) { stop(); return resolve({ ok: true, on: false }) }
  if (timerProc && !timerProc.killed) return resolve({ ok: true, on: true })

  const ps = [
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class TR {',
    '  [DllImport("ntdll.dll", SetLastError=true)]',
    '  public static extern int NtSetTimerResolution(uint Desired, bool Set, out uint Current);',
    '  [DllImport("ntdll.dll", SetLastError=true)]',
    '  public static extern int NtQueryTimerResolution(out uint Min, out uint Max, out uint Cur);',
    '}',
    '"@',
    '[uint32]$mn=0; [uint32]$mx=0; [uint32]$cur=0',
    '$null = [TR]::NtQueryTimerResolution([ref]$mn, [ref]$mx, [ref]$cur)',
    '[uint32]$outv = 0',
    '$r = [TR]::NtSetTimerResolution($mx, $true, [ref]$outv)',
    '$null = [TR]::NtQueryTimerResolution([ref]$mn, [ref]$mx, [ref]$cur)',
    'Write-Output ("TIMER:" + $r + ":" + ($cur/10000.0))',
    'while ($true) { Start-Sleep -Seconds 3600 }'
  ].join('\r\n')

  let script
  try {
    script = path.join(app.getPath('temp'), 'gb_timerres.ps1')
    fs.writeFileSync(script, '\ufeff' + ps, 'utf8')
  } catch (e) { return resolve({ ok: false, out: 'ERR: เขียนสคริปต์ไม่ได้' }) }

  try {
    const { spawn } = require('child_process')
    timerProc = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    let done = false
    timerProc.stdout.on('data', d => {
      const m = String(d).match(/TIMER:(-?\d+):([\d.]+)/)
      if (m && !done) { done = true; resolve({ ok: m[1] === '0', on: true, ms: +m[2] }) }
    })
    timerProc.on('exit', () => { timerProc = null; if (!done) { done = true; resolve({ ok: false, out: 'ERR: process จบก่อนเวลา' }) } })
    setTimeout(() => { if (!done) { done = true; resolve({ ok: true, on: true, ms: null }) } }, 6000)
  } catch (e) {
    resolve({ ok: false, out: 'ERR: ' + String(e.message || e).slice(0, 80) })
  }
}))
app.on('before-quit', () => { try { if (timerProc && !timerProc.killed) timerProc.kill() } catch (e) {} })

// ── วัด DPC / Interrupt latency ──
ipcMain.handle('dpc-check', () => new Promise(resolve => {
  const ps = [
    'try {',
    '  $s = Get-Counter -Counter "\\Processor(_Total)\\% DPC Time","\\Processor(_Total)\\% Interrupt Time" -SampleInterval 1 -MaxSamples 3 -EA Stop',
    '  $dpc = ($s.CounterSamples | Where-Object { $_.Path -like "*DPC*" } | Measure-Object CookedValue -Average).Average',
    '  $int = ($s.CounterSamples | Where-Object { $_.Path -like "*Interrupt*" } | Measure-Object CookedValue -Average).Average',
    '  Write-Output ("DPC:" + [math]::Round($dpc,3) + ":" + [math]::Round($int,3))',
    '} catch { Write-Output "DPCERR" }'
  ].join('\r\n')
  let script
  try {
    script = path.join(app.getPath('temp'), 'gb_dpc.ps1')
    fs.writeFileSync(script, '\ufeff' + ps, 'utf8')
  } catch (e) { return resolve({ ok: false }) }
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
    { windowsHide: true, timeout: 20000 }, (err, stdout) => {
      try { fs.unlinkSync(script) } catch (e) {}
      const m = String(stdout || '').match(/DPC:([\d.]+):([\d.]+)/)
      resolve(m ? { ok: true, dpc: +m[1], irq: +m[2] } : { ok: false })
    })
}))

// ── สร้าง power plan ของเราเอง (Bare Minimum) ──
// ใช้ duplicatescheme + เขียน registry ตรง ๆ  ไม่เรียก powercfg รายค่า จึงเร็ว
ipcMain.handle('build-trixie-plan', (_e, opts) => new Promise(resolve => {
  const laptop = !!(opts && opts.laptop)
  const PLAN = 'Bare Minimum'
  const PLANDESC = 'Bare Minimum - gaming power plan by chubby'
  const ROWS = '@(\'0012ee47-9041-4b5d-9b77-535fba8b1442\',\'0b2d69d7-a2a1-449c-9680-f91c70521c60\',0,0),@(\'0012ee47-9041-4b5d-9b77-535fba8b1442\',\'6738e2c4-e8a5-4a42-b16a-e040e769756e\',0,0),@(\'0012ee47-9041-4b5d-9b77-535fba8b1442\',\'80e3c60e-bb94-4ad8-bbe0-0d3195efc663\',0,0),@(\'0012ee47-9041-4b5d-9b77-535fba8b1442\',\'d3d55efd-c1ff-424e-9dc3-441be7833010\',0,0),@(\'0012ee47-9041-4b5d-9b77-535fba8b1442\',\'d639518a-e56d-4345-8af2-b9f32fb26109\',0,0),@(\'0012ee47-9041-4b5d-9b77-535fba8b1442\',\'dab60367-53fe-4fbc-825e-521d069d2456\',0,0),@(\'0012ee47-9041-4b5d-9b77-535fba8b1442\',\'dbc9e238-6de9-49e3-92cd-8c2b4946b472\',0,0),@(\'0012ee47-9041-4b5d-9b77-535fba8b1442\',\'fc7372b6-ab2d-43ee-8797-15e9841f2cca\',0,0),@(\'0012ee47-9041-4b5d-9b77-535fba8b1442\',\'fc95af4d-40e7-4b6d-835a-56d131dbc80e\',0,0),@(\'02f815b5-a5cf-4c84-bf20-649d1f75d3d8\',\'4c793e7d-a264-42e1-87d3-7a0d2f523ccd\',1,1),@(\'0d7dbae2-4294-402a-ba8e-26777e8488cd\',\'309dce9b-bef4-4119-9921-a851fb12f0f4\',1,1),@(\'19cbb8fa-5279-450e-9fac-8a3d5fedd0c1\',\'12bbebe6-58d6-4636-95bb-3217ef867c1a\',0,0),@(\'238c9fa8-0aad-41ed-83f4-97be242c8f20\',\'25dfa149-5dd1-4736-b5ab-e8a37b5b8187\',0,0),@(\'238c9fa8-0aad-41ed-83f4-97be242c8f20\',\'29f6c1db-86da-48c5-9fdb-f2b67b1f44da\',0,0),@(\'238c9fa8-0aad-41ed-83f4-97be242c8f20\',\'7bc4a2f9-d8fc-4469-b07b-33eb785aaca0\',0,0),@(\'238c9fa8-0aad-41ed-83f4-97be242c8f20\',\'94ac6d29-73ce-41a6-809f-6363ba21b47e\',0,0),@(\'238c9fa8-0aad-41ed-83f4-97be242c8f20\',\'abfc2519-3608-4c2a-94ea-171b0ed546ab\',0,0),@(\'238c9fa8-0aad-41ed-83f4-97be242c8f20\',\'bd3b718a-0680-4d9d-8ab2-e1d2b4ac806d\',0,0),@(\'238c9fa8-0aad-41ed-83f4-97be242c8f20\',\'d4c1d4c8-d5cc-43d3-b83e-fc51215cb04d\',0,0),@(\'2a737441-1930-4402-8d77-b2bebba308a3\',\'0853a681-27c8-4100-a2fd-82013e970683\',0,0),@(\'2a737441-1930-4402-8d77-b2bebba308a3\',\'48e6b7a6-50f5-4782-a5d4-53bb8f07e226\',0,0),@(\'2a737441-1930-4402-8d77-b2bebba308a3\',\'498c044a-201b-4631-a522-5c744ed4e678\',1,1),@(\'2a737441-1930-4402-8d77-b2bebba308a3\',\'d4e98f31-5ffe-4ce1-be31-1b38b384c009\',0,0),@(\'2e601130-5351-4d9d-8e04-252966bad054\',\'3166bc41-7e98-4e03-b34e-ec0f5f2b218e\',4294967295,4294967295),@(\'2e601130-5351-4d9d-8e04-252966bad054\',\'c36f0eb4-2988-4a70-8eee-0884fc2c2433\',0,0),@(\'2e601130-5351-4d9d-8e04-252966bad054\',\'d502f7ee-1dc7-4efd-a55d-f04b6f5c0545\',0,0),@(\'48672f38-7a9a-4bb2-8bf8-3d85be19de4e\',\'2bfc24f9-5ea2-4801-8213-3dbae01aa39d\',1,1),@(\'4f971e89-eebd-4455-a8de-9e59040e7347\',\'96996bc0-ad50-47ec-923b-6f41874dd9eb\',1,1),@(\'4f971e89-eebd-4455-a8de-9e59040e7347\',\'99ff10e7-23b1-4c07-a9d1-5c3206d741b4\',1,1),@(\'501a4d13-42af-4429-9fd1-a8218c268e20\',\'ee12f906-d277-404b-b6da-e5fa1a576df5\',0,0),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'06cadf0e-64ed-448a-8927-ce7bf90eb35d\',0,0),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'06cadf0e-64ed-448a-8927-ce7bf90eb35e\',0,0),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'0cc5b647-c1df-4637-891a-dec35c318583\',100,100),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'12a0ab44-fe28-4fa9-b3bd-4b64f44960a6\',0,0),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'12a0ab44-fe28-4fa9-b3bd-4b64f44960a7\',0,0),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'2ddd5a84-5a71-437e-912a-db0b8c788732\',7,7),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'3b04d4fd-1cc7-4f23-ab1c-d1337819c4bb\',0,0),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'40fbefc7-2e9d-4d25-a185-0cfd8574bac6\',0,0),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'45bcc044-d885-43e2-8605-ee0ec6e96b59\',100,100),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'465e1f50-b610-473a-ab58-00d1077dc418\',3,3),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'4b92d758-5a24-4851-a470-815d78aee119\',100,40),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'4d2b0152-7d5c-498b-88e2-34345392a2c5\',5000,15),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'5d76a2ca-e8c0-402f-a133-2158492d58ad\',0,0),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'619b7505-003b-4e82-b7a6-4dd29c300971\',100,100),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'7b224883-b3cc-4d79-819f-8374152cbe7c\',100,60),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'7f2f5cfa-f10c-4823-b5e1-e93ae85f46b5\',0,0),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'893dee8e-2bef-41e0-89c6-b55d0929964c\',100,100),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'893dee8e-2bef-41e0-89c6-b55d0929964d\',100,100),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'93b8b6dc-0698-4d1c-9ee4-0644e900c85d\',5,5),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'943c8cb6-6f93-4227-ad87-e9a3feec08d1\',85,85),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'94d3a615-a899-4ac5-ae2b-e4d8f634367f\',1,1),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'bc5038f7-23e0-4960-96da-33abaf5935ec\',100,100),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'c7be0679-2817-4d69-9d02-519a537ed0c6\',2,0),@(\'7516b95f-f776-4464-8c53-06167f40cc99\',\'17aaa29b-8b43-4b94-aafe-35f64daaf1ee\',885,885),@(\'7516b95f-f776-4464-8c53-06167f40cc99\',\'3c0bc021-c8a8-4e07-a973-6b14cbcb2b7e\',900,900),@(\'7516b95f-f776-4464-8c53-06167f40cc99\',\'684c3e69-a4f7-4014-8754-d45179a56167\',1,1),@(\'7516b95f-f776-4464-8c53-06167f40cc99\',\'aded5e82-b909-4619-9949-f5d71dac0bcb\',100,100),@(\'8619b916-e004-4dd8-9b66-dae86f806698\',\'468fe7e5-1158-46ec-88bc-5b96c9e44fd0\',0,0),@(\'8619b916-e004-4dd8-9b66-dae86f806698\',\'49cb11a5-56e2-4afb-9d38-3df47872e21b\',0,0),@(\'8619b916-e004-4dd8-9b66-dae86f806698\',\'60c07fe1-0556-45cf-9903-d56e32210242\',0,0),@(\'8619b916-e004-4dd8-9b66-dae86f806698\',\'82011705-fb95-4d46-8d35-4042b1d20def\',0,0),@(\'8619b916-e004-4dd8-9b66-dae86f806698\',\'9fe527be-1b70-48da-930d-7bcf17b44990\',0,0),@(\'8619b916-e004-4dd8-9b66-dae86f806698\',\'c763ee92-71e8-4127-84eb-f6ed043a3e3d\',0,0),@(\'9596fb26-9850-41fd-ac3e-f7c3c00afd4b\',\'10778347-1370-4ee0-8bbd-33bdacaade49\',1,1),@(\'9596fb26-9850-41fd-ac3e-f7c3c00afd4b\',\'34c7b99f-9a6d-4b3c-8dc7-b6693b78cef4\',0,0),@(\'de830923-a562-41af-a086-e3a2c6bad2da\',\'13d09884-f74e-474a-a852-b6bde8ad03a8\',100,100),@(\'de830923-a562-41af-a086-e3a2c6bad2da\',\'5c5bb349-ad29-4ee2-9d0b-2b25270f7a81\',0,0),@(\'e73a048d-bf27-4f12-9731-8b2076e8891f\',\'637ea02f-bbcb-4015-8e2c-a1c7b9c0b546\',0,0),@(\'e73a048d-bf27-4f12-9731-8b2076e8891f\',\'bcded951-187b-4d05-bccc-f7e51960c258\',0,0),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'36687f9e-e3a5-4dbf-b1dc-15eb381c6863\',0,0),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'36687f9e-e3a5-4dbf-b1dc-15eb381c6864\',0,0),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'0cc5b647-c1df-4637-891a-dec35c318584\',0,0),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'40fbefc7-2e9d-4d25-a185-0cfd8574bac7\',0,0),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'447235c7-6a8d-4cc0-8e24-9eaf70b96e2b\',0,0),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'465e1f50-b610-473a-ab58-00d1077dc419\',3,3),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'619b7505-003b-4e82-b7a6-4dd29c300972\',100,100),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'6c2993b0-8f48-481f-bcc6-00dd2742aa06\',0,0),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'71021b41-c749-4d21-be74-a00f335d582b\',0,0),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'7f2492b6-60b1-45e5-ae55-773f8cd5caec\',3,3),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'bae08b81-2d5e-4688-ad6a-13243356654b\',5,5),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'d8edeb9b-95cf-4f95-a73c-b061973693c8\',1,1),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'d8edeb9b-95cf-4f95-a73c-b061973693c9\',2,2),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'dfd10d17-d5eb-45dd-877a-9a34ddd15c82\',20,20),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'f735a673-2066-4f80-a0c5-ddee0cf1bf5d\',0,0),@(\'7516b95f-f776-4464-8c53-06167f40cc99\',\'8ec4b3a5-6868-48c2-be75-4f3044be88a7\',60,60),@(\'7516b95f-f776-4464-8c53-06167f40cc99\',\'f1fbfde2-a960-4165-9f88-50667911ce96\',50,50),@(\'8619b916-e004-4dd8-9b66-dae86f806698\',\'5adbbfbc-074e-4da1-ba38-db8b36b2c8f3\',240,240),@(\'de830923-a562-41af-a086-e3a2c6bad2da\',\'e69653ca-cf7f-4f05-aa73-cb833fa90ad4\',0,20),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'943c8cb6-6f93-4227-ad87-e9a3feec08d2\',50,50),@(\'54533251-82be-4824-96c1-47b60b740d00\',\'ee16691e-6ab3-4619-bb58-1a1d8a3f3a0b\',20,20),@(\'fea3413e-7e05-4911-9a71-700331f1c294\',\'0e796bdb-100d-47d6-a2d5-f7d2daa51f51\',0,1),@(\'f15576e8-98b7-4186-b944-eafa664402d9\',\'f15576e8-98b7-4186-b944-eafa664402d9\',0,2)'

  const L = []
  L.push('$ErrorActionPreference = "Continue"')
  L.push('$name = "' + PLAN + '"')
  L.push('$desc = "' + PLANDESC + '"')
  L.push('$rx = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"')
  L.push('$act = ""')
  L.push('if ((powercfg /getactivescheme | Out-String) -match $rx) { $act = $matches[0] }')
  L.push('foreach ($ln in (powercfg /L)) {')
  L.push('  if ($ln -like "*$name*" -and $ln -match $rx) {')
  L.push('    $old = $matches[0]')
  L.push('    if ($old -ne $act) { powercfg -delete $old 2>$null | Out-Null }')
  L.push('  }')
  L.push('}')
  L.push('Write-Output "STEP:CLEAN"')
  // เลือกต้นแบบจาก plan ที่มีอยู่จริง ห้าม hardcode GUID
  L.push('$all = @()')
  L.push('foreach ($ln in (powercfg /L)) {')
  L.push('  if ($ln -match $rx) {')
  L.push('    $gg = $matches[0]; $nm = ""')
  L.push('    if ($ln -match "\\((.*?)\\)") { $nm = $matches[1] }')
  L.push('    $all += [pscustomobject]@{ g = $gg; n = $nm }')
  L.push('  }')
  L.push('}')
  L.push('$base = ""')
  L.push('foreach ($pat in @("Ultimate","High perf","Balanced")) {')
  L.push('  if ($base -ne "") { break }')
  L.push('  foreach ($p in $all) { if ($p.n -like "*$pat*") { $base = $p.g; break } }')
  L.push('}')
  L.push('if ($base -eq "" -and $all.Count -gt 0) { $base = $all[0].g }')
  L.push('if ($base -eq "") { Write-Output "ERRPLAN:NOBASE"; exit 1 }')
  L.push('Write-Output "STEP:CREATE"')
  L.push('$out = (powercfg -duplicatescheme $base 2>&1 | Out-String)')
  L.push('if ($out -notmatch $rx) { Write-Output ("ERRPLAN:DUPFAIL " + ($out -replace "\\s+"," ")); exit 1 }')
  L.push('$g = $matches[0]')
  L.push('powercfg -changename $g "$name" "$desc" 2>$null | Out-Null')
  L.push('Write-Output "STEP:APPLY"')
  // เขียนลง registry ของ scheme โดยตรง — ไม่เปิด process ต่อค่า
  L.push('$rows = @(' + ROWS + ')')
  L.push('$root = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\User\\PowerSchemes\\" + $g')
  L.push('$ok = 0; $skip = 0')
  L.push('foreach ($r in $rows) {')
  L.push('  $kp = Join-Path (Join-Path $root $r[0]) $r[1]')
  L.push('  try {')
  L.push('    if (-not (Test-Path $kp)) { New-Item -Path $kp -Force -EA Stop | Out-Null }')
  L.push('    New-ItemProperty -Path $kp -Name "ACSettingIndex" -Value ([int]$r[2]) -PropertyType DWord -Force -EA Stop | Out-Null')
  L.push('    New-ItemProperty -Path $kp -Name "DCSettingIndex" -Value ([int]$r[3]) -PropertyType DWord -Force -EA Stop | Out-Null')
  L.push('    $ok++')
  L.push('  } catch { $skip++ }')
  L.push('}')
  // โน้ตบุ๊กคง sleep ไว้
  // core parking: ปิดเสมอ (CPMINCORES=100)
  // เคยลองข้ามบน X3D 2 CCD แล้วผู้ใช้วัดได้ว่าเฟรมตกหนัก จึงกลับมาตั้งทุกเครื่อง
  L.push('$kpc = Join-Path (Join-Path $root "54533251-82be-4824-96c1-47b60b740d00") "0cc5b647-c1df-4637-891a-dec35c318583"')
  L.push('try {')
  L.push('  if (-not (Test-Path $kpc)) { New-Item -Path $kpc -Force -EA Stop | Out-Null }')
  L.push('  New-ItemProperty -Path $kpc -Name "ACSettingIndex" -Value 100 -PropertyType DWord -Force -EA SilentlyContinue | Out-Null')
  L.push('  New-ItemProperty -Path $kpc -Name "DCSettingIndex" -Value 100 -PropertyType DWord -Force -EA SilentlyContinue | Out-Null')
  L.push('} catch {}')
  L.push('$isLap = $false')
  L.push('try { if (Get-CimInstance Win32_Battery -EA SilentlyContinue) { $isLap = $true } } catch {}')
  L.push('if (-not $isLap) {')
  L.push('  $sl = "238c9fa8-0aad-41ed-83f4-97be242c8f20"')
  L.push('  foreach ($sg in @("29f6c1db-86da-48c5-9fdb-f2b67b1f44da","94ac6d29-73ce-41a6-809f-6363ba21b47e")) {')
  L.push('    $kp2 = Join-Path (Join-Path $root $sl) $sg')
  L.push('    try {')
  L.push('      if (-not (Test-Path $kp2)) { New-Item -Path $kp2 -Force -EA Stop | Out-Null }')
  L.push('      New-ItemProperty -Path $kp2 -Name "ACSettingIndex" -Value 0 -PropertyType DWord -Force -EA SilentlyContinue | Out-Null')
  L.push('      New-ItemProperty -Path $kp2 -Name "DCSettingIndex" -Value 0 -PropertyType DWord -Force -EA SilentlyContinue | Out-Null')
  L.push('    } catch {}')
  L.push('  }')
  L.push('}')
  // setactive สองครั้งเพื่อให้ Windows อ่าน registry ที่เพิ่งเขียนใหม่
  L.push('powercfg -setactive $g 2>$null | Out-Null')
  L.push('Start-Sleep -Milliseconds 300')
  L.push('powercfg -setactive $g 2>$null | Out-Null')
  L.push('Write-Output ("OKPLAN:" + $g + ":" + $ok + ":" + $skip)')
  L.push('exit 0')

  const ps = L.join('\r\n').replace('@(\'54533251-82be-4824-96c1-47b60b740d00\',\'893dee8e-2bef-41e0-89c6-b55d0929964c\',5,5),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'bc5038f7-23e0-4960-96da-33abaf5935ec\',100,100),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'0cc5b647-c1df-4637-891a-dec35c318583\',100,100),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'5d76a2ca-e8c0-402f-a133-2158492d58ad\',0,0),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'3b04d4fd-1cc7-4f23-ab1c-d1337819c4bb\',0,0),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'94d3a615-a899-4ac5-ae2b-e4d8f634367f\',1,1),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'36687f9e-e3a5-4dbf-b1dc-15eb381c6863\',0,0),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'36687f9e-e3a5-4dbf-b1dc-15eb381c6864\',0,0),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'45bcc044-d885-43e2-8605-ee0ec6e96b59\',100,100),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'be337238-0d82-4146-a960-4f3749d470c7\',2,2),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'943c8cb6-6f93-4227-ad87-e9a3feec08d1\',99,99),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'619b7505-003b-4e82-b7a6-4dd29c300971\',100,100),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'06cadf0e-64ed-448a-8927-ce7bf90eb35d\',30,30),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'12a0ab44-fe28-4fa9-b3bd-4b64f44960a6\',10,10),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'465e1f50-b610-473a-ab58-00d1077dc418\',3,3),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'40fbefc7-2e9d-4d25-a185-0cfd8574bac6\',0,0),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'4b92d758-5a24-4851-a470-815d78aee119\',100,40),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'7b224883-b3cc-4d79-819f-8374152cbe7c\',100,60),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'4d2b0152-7d5c-498b-88e2-34345392a2c5\',5000,15),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'2ddd5a84-5a71-437e-912a-db0b8c788732\',7,7),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'dfd10d17-d5eb-45dd-877a-9a34ddd15c82\',20,20),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'c7be0679-2817-4d69-9d02-519a537ed0c6\',2,2),    @(\'54533251-82be-4824-96c1-47b60b740d00\',\'bae08b81-2d5e-4688-ad6a-13243356654b\',85,85),    @(\'501a4d13-42af-4429-9fd1-a8218c268e20\',\'ee12f906-d277-404b-b6da-e5fa1a576df5\',0,0),    @(\'2a737441-1930-4402-8d77-b2bebba308a3\',\'48e6b7a6-50f5-4782-a5d4-53bb8f07e226\',0,0),    @(\'2a737441-1930-4402-8d77-b2bebba308a3\',\'d4e98f31-5ffe-4ce1-be31-1b38b384c009\',0,0),    @(\'2a737441-1930-4402-8d77-b2bebba308a3\',\'0853a681-27c8-4100-a2fd-82013e970683\',0,0),    @(\'0012ee47-9041-4b5d-9b77-535fba8b1442\',\'6738e2c4-e8a5-4a42-b16a-e040e769756e\',0,0),    @(\'0012ee47-9041-4b5d-9b77-535fba8b1442\',\'0b2d69d7-a2a1-449c-9680-f91c70521c60\',0,0),    @(\'19cbb8fa-5279-450e-9fac-8a3d5fedd0c1\',\'12bbebe6-58d6-4636-95bb-3217ef867c1a\',0,0),    @(\'9596fb26-9850-41fd-ac3e-f7c3c00afd4b\',\'10778347-1370-4ee0-8bbd-33bdacaade49\',1,1),    @(\'9596fb26-9850-41fd-ac3e-f7c3c00afd4b\',\'34c7b99f-9a6d-4b3c-8dc7-b6693b78cef4\',0,0)', ROWS)

  let script
  try {
    script = path.join(app.getPath('temp'), 'gb_plan.ps1')
    fs.writeFileSync(script, '\ufeff' + ps, 'utf8')
  } catch (e) { return resolve({ ok: false, out: 'ERR: เขียนสคริปต์ไม่ได้' }) }

  const { spawn } = require('child_process')
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true })
  let buf = '', done = false
  const finish = (r) => { if (done) return; done = true; try { fs.unlinkSync(script) } catch (e) {} ; resolve(r) }
  child.stdout.on('data', d => {
    buf += String(d)
    const st = String(d).match(/STEP:(.*)/)
    if (st && mainWin && !mainWin.isDestroyed()) {
      try { mainWin.webContents.send('trixie-progress', st[1].trim()) } catch (e) {}
    }
  })
  child.stderr.on('data', d => { buf += String(d) })
  child.on('error', e => finish({ ok: false, out: 'ERR: ' + String(e.message || e).slice(0, 120) }))
  child.on('close', () => {
    const m = buf.match(/OKPLAN:([0-9a-fA-F-]{36}):(\d+):(\d+)/)
    if (m) return finish({ ok: true, guid: m[1], applied: +m[2], skipped: +m[3] })
    const e2 = buf.match(/ERRPLAN:(.*)/)
    const code = (e2 && e2[1].trim()) || ''
    const MSG = {
      NOBASE: 'ไม่พบ power plan ในเครื่องให้ใช้เป็นต้นแบบ',
      DUPFAIL: 'Windows ไม่ยอมสร้าง power plan ใหม่'
    }
    let msg = 'ไม่สำเร็จ'
    for (const k of Object.keys(MSG)) {
      if (code.startsWith(k)) { msg = MSG[k] + (code.length > k.length ? ' — ' + code.slice(k.length).trim() : ''); break }
    }
    if (msg === 'ไม่สำเร็จ' && code) msg = code
    // แนบ output ดิบไว้ท้ายสุดเพื่อให้ดีบักได้จริงเวลาผู้ใช้ส่ง log มา
    const tail = buf.replace(/\s+/g, ' ').trim().slice(-180)
    finish({ ok: false, out: 'ERR: ' + msg.slice(0, 120) + (tail ? ' | raw: ' + tail : '') })
  })
  setTimeout(() => { try { child.kill() } catch (e) {} ; finish({ ok: false, out: 'ERR: เกิน 60 วินาที — ยกเลิก' }) }, 60000)
}))

// ── เปิดหน้า Power Options ของ Windows (Control Panel เก่า — Settings ใหม่ไม่มี) ──
ipcMain.handle('open-powercfg', () => new Promise(resolve => {
  exec('control.exe powercfg.cpl', { shell: 'cmd.exe', windowsHide: true, timeout: 10000 },
    err => resolve({ ok: !err }))
}))

// ── Power Plan Explorer: รายชื่อ plan ทั้งหมด ──
ipcMain.handle('powerplan-list', () => new Promise(resolve => {
  exec('powercfg /L', { shell: 'cmd.exe', windowsHide: true, timeout: 15000 }, (err, stdout) => {
    if (err) return resolve([])
    const out = []
    for (const ln of String(stdout || '').split(/\r?\n/)) {
      const m = ln.match(/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\s*\((.*?)\)/)
      if (m) out.push({ guid: m[1], name: m[2].trim(), active: /\*\s*$/.test(ln.trim()) })
    }
    resolve(out)
  })
}))

// ── Power Plan Explorer: ดึงค่าทั้งหมดของ plan (รวมค่าที่ซ่อน) ──
ipcMain.handle('powerplan-dump', (_e, guid) => new Promise(resolve => {
  if (!guid || !/^[0-9a-fA-F-]{36}$/.test(guid)) return resolve({ ok: false, out: '' })
  exec(`powercfg /qh ${guid}`, { shell: 'cmd.exe', windowsHide: true, timeout: 30000, maxBuffer: 12 * 1024 * 1024 },
    (err, stdout) => resolve({ ok: !err, out: String(stdout || '') }))
}))

ipcMain.handle('startup-list', () => {
  const ps = `$out=@(); ` +
    `$keys=@(` +
    `@{P='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; S='HKCU'},` +
    `@{P='HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; S='HKLM'},` +
    `@{P='HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'; S='HKLM32'}` +
    `); ` +
    `foreach($k in $keys){ if(Test-Path $k.P){ $i=Get-ItemProperty $k.P; ` +
    `$i.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object { ` +
    `$out += [pscustomobject]@{name=$_.Name; cmd=[string]$_.Value; src=$k.S; on=$true} } } } ` +
    // รายการที่ถูกปิดไว้ (ย้ายไป Run-disabled ของแอปเรา)
    `foreach($k in @('HKCU:\\Software\\GameBoostFPS\\RunDisabled','HKLM:\\Software\\GameBoostFPS\\RunDisabled')){ ` +
    `if(Test-Path $k){ $i=Get-ItemProperty $k; $s=if($k -like 'HKCU*'){'HKCU'}else{'HKLM'}; ` +
    `$i.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object { ` +
    `$out += [pscustomobject]@{name=$_.Name; cmd=[string]$_.Value; src=$s; on=$false} } } } ` +
    `ConvertTo-Json -Compress @($out)`
  return psJson(ps, [])
})

// ── Startup Manager: ปิด/เปิดรายการ (ย้ายค่าไปเก็บ ไม่ลบทิ้ง) ──
ipcMain.handle('startup-toggle', (_e, item) => {
  if (!item || !item.name || !item.src) return Promise.resolve({ ok: false, out: 'bad args' })
  const hive = item.src === 'HKCU' ? 'HKCU:' : 'HKLM:'
  const runKey = item.src === 'HKLM32'
    ? 'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'
    : `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`
  const bakKey = `${item.src === 'HKCU' ? 'HKCU:' : 'HKLM:'}\\Software\\GameBoostFPS\\RunDisabled`
  const nm = String(item.name).replace(/'/g, "''")
  const from = item.on ? runKey : bakKey
  const to = item.on ? bakKey : runKey
  const ps = `$n='${nm}'; $f='${from}'; $t='${to}'; ` +
    `if(-not (Test-Path $f)){ 'ERR: ไม่พบ key ต้นทาง'; exit 1 }; ` +
    `$v=(Get-ItemProperty $f -Name $n -EA SilentlyContinue).$n; ` +
    `if($null -eq $v){ 'ERR: ไม่พบรายการ'; exit 1 }; ` +
    `New-Item -Path $t -Force | Out-Null; ` +
    `Set-ItemProperty -Path $t -Name $n -Value $v -EA Stop; ` +
    `Remove-ItemProperty -Path $f -Name $n -EA Stop; ` +
    `'OK'`
  return psJson(`try{ ${ps} | Out-Null; ConvertTo-Json -Compress @{ok=$true} }catch{ ConvertTo-Json -Compress @{ok=$false; out=$_.Exception.Message} }`, { ok: false })
})

ipcMain.handle('list-games', () => new Promise(resolve => {
  exec('tasklist /fo csv /nh', { windowsHide: true, timeout: 8000 }, (err, stdout) => {
    if (err) return resolve([])
    const out = (stdout || '').toLowerCase()
    const games = [
      ['FiveM', 'fivem.exe'], ['GTA V', 'gta5.exe'], ['CS2', 'cs2.exe'],
      ['Valorant', 'valorant-win64-shipping.exe'], ['Apex Legends', 'r5apex.exe'],
      ['PUBG', 'tslgame.exe'], ['Fortnite', 'fortniteclient-win64-shipping.exe'],
      ['Overwatch', 'overwatch.exe'], ['League of Legends', 'league of legends.exe'],
      ['Dota 2', 'dota2.exe'], ['Rainbow Six', 'rainbowsix.exe']
    ]
    resolve(games.filter(([n, ex]) => out.includes(ex)).map(([n]) => n))
  })
}))

// ── restore point ───────────────────────────────────────────────
ipcMain.handle('restore-point', (e, name) => new Promise(resolve => {
  const desc = (name || 'Bare Minimum').replace(/"/g, '')
  const ps = `Enable-ComputerRestore -Drive 'C:\\'; Checkpoint-Computer -Description '${desc}' -RestorePointType 'MODIFY_SETTINGS'`
  exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`,
    { windowsHide: true, timeout: 90000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, err: (stderr || '').trim() })
    })
}))

// ── mini overlay window (solid, always-on-top; safe) ────────────
function overlayContent () {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Tahoma,sans-serif;-webkit-user-select:none}
    body{background:#07060d;color:#f3f0ff;border:1px solid rgba(138,63,255,.5);box-shadow:inset 0 0 14px rgba(138,63,255,.25);border-radius:0;overflow:hidden;padding:10px 12px}
    .t{font-size:9px;letter-spacing:2px;color:#b48cff;text-transform:uppercase;margin-bottom:7px;display:flex;justify-content:space-between}
    .g{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px}
    .r{display:flex;justify-content:space-between;align-items:baseline;font-size:12px}
    .k{color:#aaa3c8}.v{font-family:Consolas,'Courier New',monospace;font-weight:700;font-size:14px;color:#ff6b82;text-shadow:0 0 8px rgba(255,42,77,.6)}
    .v.warn{color:#ffb020}.v.bad{color:#ff2a4d}
  </style></head><body>
    <div class="t"><span>GAMEBOOST · LIVE</span><span id="pingDot">●</span></div>
    <div class="g">
      <div class="r"><span class="k">PING</span><span class="v" id="o_ping">—</span></div>
      <div class="r"><span class="k">CPU</span><span class="v" id="o_cpu">—</span></div>
      <div class="r"><span class="k">RAM</span><span class="v" id="o_ram">—</span></div>
      <div class="r"><span class="k">C°</span><span class="v" id="o_ct">—</span></div>
      <div class="r"><span class="k">GPU°</span><span class="v" id="o_gt">—</span></div>
    </div>
    <script>
      window.upd = function(j){
        function set(id,val,unit,warnAt,badAt){
          var el=document.getElementById(id); if(!el)return;
          if(val==null){el.textContent='N/A';el.className='v';return;}
          el.textContent=val+(unit||''); el.className='v'+(val>=badAt?' bad':(val>=warnAt?' warn':''));
        }
        set('o_ping',j.ping,'ms',60,120);
        set('o_cpu',j.cpuLoad,'%',75,92);
        set('o_ram',j.ramPct,'%',80,93);
        set('o_ct',j.cpuTemp,'°',75,88);
        set('o_gt',j.gpuTemp,'°',78,87);
      }
    </script>
  </body></html>`
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
}

async function pushOverlay () {
  if (!overlayWin || overlayWin.isDestroyed()) return
  try {
    const [hw, p] = await Promise.all([getHwStats(), getPing('1.1.1.1')])
    const ramPct = (hw.ramUsed && hw.ramTot) ? Math.round(hw.ramUsed / hw.ramTot * 100) : null
    const data = { ping: p.ms, cpuLoad: hw.cpuLoad, ramPct, cpuTemp: hw.cpuTemp, gpuTemp: hw.gpuTemp }
    overlayWin.webContents.executeJavaScript('window.upd(' + JSON.stringify(data) + ')').catch(() => {})
  } catch (e) {}
}

ipcMain.handle('overlay-show', () => {
  if (overlayWin && !overlayWin.isDestroyed()) { overlayWin.focus(); return { ok: true } }
  overlayWin = new BrowserWindow({
    width: 232, height: 128, x: 24, y: 24,
    frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true,
    focusable: false, backgroundColor: '#07060d',
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  })
  overlayWin.setAlwaysOnTop(true, 'screen-saver')
  overlayWin.loadURL(overlayContent())
  overlayWin.on('closed', () => { overlayWin = null })
  pushOverlay()
  if (overlayTimer) clearInterval(overlayTimer)
  overlayTimer = setInterval(pushOverlay, 2000)
  return { ok: true }
})

ipcMain.handle('overlay-hide', () => {
  if (overlayTimer) { clearInterval(overlayTimer); overlayTimer = null }
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.close()
  overlayWin = null
  return { ok: true }
})

// ── Discord Rich Presence (optional; never crashes app) ─────────
let rpc = null, rpcReady = false
function setDiscordActivity (info) {
  if (!rpc || !rpcReady) return false
  try {
    rpc.setActivity({
      details: (info && info.details) || 'กำลังปรับแต่งคอม',
      state: (info && info.state) || 'Bare Minimum',
      largeImageKey: 'logo',
      largeImageText: 'Bare Minimum by chubby',
      startTimestamp: Date.now()
    })
    return true
  } catch (e) { return false }
}
;(function initDiscord () {
  try {
    const DiscordRPC = require('discord-rpc')
    const clientId = '1526202636863406080' // GameBoostFPS Discord App
    rpc = new DiscordRPC.Client({ transport: 'ipc' })
    rpc.on('ready', () => { rpcReady = true; setDiscordActivity(null) }) // ตั้งสถานะเริ่มต้นทันที
    rpc.login({ clientId }).catch(() => { rpc = null })
  } catch (e) { rpc = null }
})()
ipcMain.handle('discord-set', (e, info) => ({ ok: setDiscordActivity(info) }))

app.whenReady().then(() => {
  createSplash()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
