╔══════════════════════════════════════════════════════════════╗
║       Game Boost FPS PRO  BY Ty.ppw   —   v6.0                ║
╚══════════════════════════════════════════════════════════════╝

  แอพปรับแต่ง Windows ให้เล่นเกมลื่นขึ้น — FPS สูง, ping ต่ำ,
  input lag น้อย   (เป็นการปรับ Windows ของตัวเอง ไม่ใช่โปรแกรมโกง)

  142 tweaks · 20 หมวด · ทุกคำสั่งตรวจสอบแล้วว่าทำงานจริง


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 เริ่มใช้งาน
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. เปิดแอพ (จะขอสิทธิ์ Administrator — จำเป็น เพราะต้องแก้
     registry และ service ของระบบ)
  2. หน้า Dashboard กด "Auto Tune" — แอพจะอ่านสเปคเครื่องแล้ว
     เลือก tweak ที่เหมาะกับ CPU/GPU/RAM ของคุณโดยเฉพาะ
  3. Restart เครื่องเมื่อปรับเสร็จ
  4. ถ้าอะไรผิดปกติ → หน้า Restore → ย้อนค่าได้ทุกอย่าง


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 จุดเด่นที่แอพอื่นไม่มี
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🤖 Auto Tune ตามสเปคจริง
     อ่าน CPU (Intel i3-i9 / Core Ultra / Ryzen ทุกซีรีส์ / X3D),
     GPU (NVIDIA / AMD / Intel Arc), RAM (DDR3-5) แล้วเลือก
     tweak ให้ตรงเครื่อง — ไม่ยัดทุกอย่างให้ทุกคนเหมือนกัน

  🎯 Latency Tuning (v6.0 ใหม่)
     Ultimate Performance ของ Windows แทบไม่ได้ตั้งค่าอะไรเลย
     (ตรวจสอบจากไฟล์ .pow จริง — มีแค่ 2 ค่าในไฟล์)
     การ์ดนี้เติมค่าที่ขาด: PERFEPP, PERFINCTIME, LATENCYHINT,
     core parking — โดยไม่ดัน CPU ขั้นต่ำ 100% จึงไม่ทำให้ร้อน

  🔬 Power Plan Explorer (v6.0 ใหม่)
     อ่านค่าทุกตัวของ power plan ในเครื่อง (รวมค่าที่ซ่อนอยู่)
     แล้วเทียบสอง plan ให้เห็นว่าต่างกันตรงไหน

  🧊 รู้จัก AMD X3D และ Intel P/E core
     - X3D 2 CCD (9950X3D/7950X3D): เตือนว่า CCD1 ไม่มี V-Cache
     - Intel 12th gen+: ตั้ง scheduling ให้เน้น P-core

  🧠 วิเคราะห์ RAM
     เตือนถ้าเสียบแถวเดียว (เสีย FPS 10-30%) หรือยังไม่เปิด
     XMP/EXPO — สองเรื่องที่คนส่วนใหญ่ไม่รู้ว่าตัวเองโดนอยู่

  ✓ ตรวจสอบว่าทำงานจริง
     หลัง apply จะอ่านค่ากลับมาเทียบ ถ้าไม่สำเร็จขึ้น "⚠ ไม่สำเร็จ"
     แทนที่จะแสดงเครื่องหมายถูกหลอก ๆ

  💾 สำรองก่อนแก้
     export .reg เก็บไว้ก่อน Optimize เป็นชุด (เก็บ 5 ชุดล่าสุด
     ใน AppData) — ดับเบิลคลิกคืนค่าได้แม้แอพพัง


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 หมวดทั้งหมด (20)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ⚡ Boost         ปรับรวม + ยกเว้นโฟลเดอร์เกมจาก Defender
  🎮 FiveM         priority, NUI/CEF cache, server cache, logs
  🕹️ Games         14 เกมยอดนิยม — priority + shader cache
  🧠 CPU           power plan, core parking, Latency Tuning, X3D
  🖥️ GPU           MSI mode, TDR delay, ปิด MPO, GPU preference
  🟢 NVIDIA        4 การ์ดเฉพาะการ์ดจอ NVIDIA
  🔴 AMD Radeon    3 การ์ดเฉพาะการ์ดจอ AMD
  🔵 Intel CPU     P-core scheduling (12th gen ขึ้นไป)
  🖱️ Input Lag     mouse/keyboard, ปิด Sticky Keys, input queue
  🧩 Memory        pagefile ตามขนาด RAM จริง, NTFS, standby
  🌐 Network       15 การ์ด — Nagle, TCP, NIC, BBR2, RSS
  📡 Auto Ping     วัด ping จริงแล้วเลือก DNS เร็วสุดให้
  🛡️ Policy        telemetry, Game DVR, scheduled tasks
  ⚙️ Services      ตั้งเป็น Manual (ย้อนได้ง่าย)
  🚫 Services Off  ปิดถาวร (Xbox, Bluetooth, Phone Link)
  🎧 Audio         ปิด enhancements, Communications Ducking
  💾 Storage       ปิด hibernate, TRIM, ล้าง WinSxS
  🔒 Privacy       Advertising ID, Activity History
  📺 App Tuning    Discord, Chrome, OBS
  🔧 Repair Tools  SFC, DISM, icon/font cache, Print Spooler


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 หน้าเครื่องมือ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📊 Live Monitor    ping/CPU/RAM/อุณหภูมิ, overlay, ตรวจเกม
                     อัตโนมัติ, Game Watchdog, benchmark
  🚀 Startup         จัดการโปรแกรมที่เปิดตอนบูต (ปิดแล้วกดคืนได้)
  🔬 Power Plan      เทียบค่า power plan สองอันแบบละเอียด
  🎨 GPU Guide       คู่มือตั้งค่าใน NVIDIA App / AMD Adrenalin
                     ตามสเปคการ์ดจอของคุณ
  ♻️ Restore         จุดกู้คืน, รีเซ็ต power plan, เปิดโฟลเดอร์ backup
  🎨 Appearance      18 ธีม + 6 ไอคอน


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 การ์ดที่ต้องกดเอง (ไม่รวมใน Optimize All)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  การ์ดเหล่านี้มีผลข้างเคียงที่ต้องรู้ก่อนกด จึงไม่ถูกรันอัตโนมัติ

  • Atlas-style Extreme  → ดัน CPU 100% ตลอด (ห้ามใช้กับ X3D/โน้ตบุ๊ก)
  • CPU Idle Disable     → ร้อนและกินไฟมาก
  • System Timer         → บางเครื่องดีขึ้น บางเครื่องแย่ลง
  • Large Memory Pages   → ถ้า RAM น้อยอาจหน่วง
  • ปิด Background Apps  → Snipping Tool / Win+Shift+S ใช้ไม่ได้
  • ปิด Clipboard History→ Win+V ใช้ไม่ได้
  • ปิด Bluetooth        → อุปกรณ์ BT ใช้ไม่ได้ทั้งหมด
  • ปิด Phone Link/Sync  → Mail / Calendar ไม่ซิงก์


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 สิ่งที่แอพนี้ไม่ทำ (และเหตุผล)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✗ Overclock / undervolt
    ค่าที่ปลอดภัยต่างกันทุกชิ้น ตั้งผิดพังถาวร — ใช้ BIOS หรือ
    Ryzen Master / Intel XTU แทน  (ไม่มี OC ไหน "ปลอดภัย 100%")

  ✗ Macro / no-recoil / automation ในเกม
    เป็นการโกง และทำให้บัญชีโดนแบน

  ✗ DLL injection (DLSS Enabler / OptiScaler)
    anti-cheat มองว่าเป็นการโกงได้ — เสี่ยงโดนแบน

  ✗ ตั้งค่า 3D ของไดรเวอร์ผ่าน registry
    ค่าพวกนี้อยู่ในไฟล์ไบนารีของไดรเวอร์ เขียน registry ไม่มีผลจริง
    → ทำเป็นหน้า GPU Guide ให้ตั้งเองแทน

  ✗ เปลี่ยนความเร็ว RAM
    MHz ของ DDR4/DDR5 คุมด้วย XMP/EXPO ใน BIOS เท่านั้น
    → แอพตรวจให้แล้วบอกว่าควรไปเปิดตรงไหน

  ✗ Registry cleaner
    ไม่มีหลักฐานว่าช่วย FPS มีแต่ความเสี่ยง


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ข้อจำกัดที่ควรรู้
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  • Benchmark วัดสถานะระบบ (RAM ว่าง, process, ping, CPU idle)
    ไม่ได้วัด FPS จริงในเกม — ถ้าอยากรู้ FPS ให้ใช้ MSI Afterburner
  • อุณหภูมิ GPU อ่านได้เฉพาะการ์ด NVIDIA
  • อุณหภูมิ CPU บางเมนบอร์ดไม่รายงาน (ขึ้น N/A = ปกติ)
  • Overlay ไม่ขึ้นเหนือเกมโหมด exclusive fullscreen
    (borderless / windowed ใช้ได้)
  • Game Watchdog ทำงานเฉพาะตอนเปิดแอพค้างไว้


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ถ้ามีปัญหา
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CPU ค้าง 100% + เฟรมตก
    → หน้า CPU → การ์ด "แก้อาการ CPU ค้าง 100%"
    → หรือ CMD (Admin): powercfg -restoredefaultschemes

  Snipping Tool / Win+Shift+S ใช้ไม่ได้
    → หน้า Policy → "ปิด Background Apps" → กด Revert
    → แล้ว sign out / sign in

  ปรับแล้วขึ้น "⚠ ไม่สำเร็จ"
    → เปิดแอพแบบ Run as administrator

  อยากย้อนทุกอย่าง
    → หน้า Restore → หรือเปิดโฟลเดอร์ backup แล้วดับเบิลคลิก .reg


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Set Computer Ty.ppw  ·  Power By Chubby.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─── ใหม่ในรุ่นนี้ (2026-09) ───

  อ่านความสามารถการ์ดจอจากไฟล์จริง ไม่เดารุ่น
    handler gpu-caps อ่านเวอร์ชันจาก nvngx_dlss.dll ในเครื่อง
    รองรับ DLSS รุ่นไหนก็ได้ที่ติดตั้งอยู่ (4, 5, หรือใหม่กว่า)
    ตรวจ Frame Generation (nvngx_dlssg.dll) และ Ray Reconstruction (nvngx_dlssd.dll)
    ตรวจ AMD FSR และ Intel XeSS ด้วย

  การ์ดใหม่ 7 ใบ
    nv_dlss_override    ปลดล็อก DLSS preset รุ่นล่าสุดที่เครื่องมี
    nv_reflex           NVIDIA Reflex ลด input lag
    gpu_shadercache_max Shader Cache ไม่จำกัด ลด stutter UE5/DX12
    amd_antilag         AMD Anti-Lag
    win_autohdr         Auto HDR (Win11)
    win_gamemode        Game Mode
    sys_directstorage   DirectStorage (ตรวจ NVMe ให้ก่อน)

  Auto Tune ฉลาดขึ้น
    เลือกการ์ด GPU ตามของที่มีจริงในเครื่อง
    กรองการ์ดที่เครื่องไม่รองรับออกตั้งแต่ตอนเลือก พร้อมบอกเหตุผล

  BUILD.bat ใช้ Electron ^44.4.3 + electron-builder ^26.15.3
    (ดึงเลขจริงจาก npm registry วันที่ 2026-09-18)
    ^ = รับ patch ย่อยอัตโนมัติ
    เช็ครุ่นใหม่: npm view electron version

  BUILD_LEGACY.bat ใช้ Electron 22.3.27 ห้ามเปลี่ยน
    รุ่นสุดท้ายที่รองรับ Windows 7/8
    ข้อควรรู้: 22.x หมดอายุ support แล้ว Chromium ในนั้นมีช่องโหว่ที่ไม่ได้แพตช์
    ถ้าลูกค้าใช้ Win10/11 หมด ควรใช้ BUILD.bat แทน

