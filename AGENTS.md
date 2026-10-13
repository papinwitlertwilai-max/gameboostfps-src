# AGENTS.md — GameBoost FPS PRO (Ty.ppw)

Read this fully before touching any file. It contains constraints that are **not
inferable from the source code** — including bugs that were already found and
fixed the hard way. Re-introducing them wastes real hours.

---

## 0. Start here

| You are about to… | Read first |
|---|---|
| Diagnose a customer problem | **DIAGNOSE.md** (symptom → first file to open) |
| Add or change a tweak card | §2, §5, §6 — cards live in `src/cards.js` (§4.41) |
| Switch a card off for everyone after release | §4.37 (remote blocklist) |
| Touch Auto Tune | §4.9, §4.17, §4.40 |
| Touch the UI | §12 (Cyber HUD) — animation must pause when unfocused |
| Ship a build | §7 (validator must pass), §8 |

The validator (`node tools/validate.js`) encodes most of this file. When it
fails, the message names the rule; the rule's comment names the incident.

---

## 1. What this project is

An **Electron desktop app for Windows** that applies real system tweaks
(registry / PowerShell / netsh / sc / powercfg) to improve gaming performance —
higher FPS, lower input lag, lower ping. Targeted at FiveM, GTA V, CS2,
Valorant, Apex, PUBG.

It is **not** a game modifier. It never touches game memory, game files, or
anything anti-cheat would flag. It only changes Windows settings the user could
change by hand.

**UI language is Thai.** All user-facing strings (card names, descriptions,
toasts, tooltips) are Thai. Code, comments in this file, and identifiers are
English. Keep it that way.

---

## 2. Hard rules — do not violate

These are non-negotiable. If a change would break one of these, stop and ask the
human instead.

### 2.1 Never ship a registry key you cannot verify exists

This is the single most important rule. LLMs hallucinate Windows registry paths
constantly, and "tweak guide" websites are full of keys that do nothing because
the driver or OS overrides them.

Before adding any `reg add` command, you must be able to answer:
**"What is the evidence this key is read by Windows or the driver?"**

"A tweaking forum said so" is not evidence. If you cannot verify it, do not add
it. A card that looks impressive but does nothing is worse than no card — the
whole app's credibility rests on every command being real.

Already rejected for this reason (do not re-add):
- NVIDIA 3D settings via registry (Low Latency Mode, Threaded Optimization,
  Texture Filtering, Max Pre-Rendered Frames). These live in the driver's binary
  profile DB `%ProgramData%\NVIDIA Corporation\Drs\nvdrsdb0.bin` and are only
  writable through **NVAPI**. Registry writes are silently overridden.
  → This is why the **GPU Settings Guide page** exists instead (see §4.6).
- AMD Anti-Lag / Chill / Image Sharpening via registry — same problem, ADL only.

### 2.2 Never add CPU/GPU overclocking or undervolting

Voltage, multiplier, and BCLK control belong in BIOS or vendor tools (Ryzen
Master, Intel XTU). Safe values are per-silicon and cannot be generalized.
Getting it wrong causes permanent hardware damage that no `revert` can undo.

What the app does instead is legitimate: unlock the CPU to reach its
**factory-rated** boost clocks (Ultimate Performance plan, 100% min/max
processor state, core parking off, power throttling off).

### 2.3 Never add game macros or automation

No recoil control, auto-loot, auto-heal, aim assist, triggerbot, or any input
automation aimed at a game. This was requested once and refused; the refusal
stands. It is cheating and gets users banned.

### 2.4 Every state-changing tweak must have a working revert

If `apply` writes a value, `revert` must restore the default — not just delete
the key, unless deleting genuinely restores default behaviour. Users trust the
Restore page. See §5 for the one legitimate exception (action cards).

### 2.5 Never hardcode a network adapter name

`netsh interface ip set dns "Ethernet" ...` is **broken** and was already fixed
once. It fails on Wi-Fi, on renamed adapters, and on non-English Windows where
the adapter is named e.g. "อีเทอร์เน็ต".

Always resolve the adapter **by interface index** at runtime — see
`getAdapterIndex()` in `src/index.html`.

The legacy PowerShell scripts in the project history still contain this bug.
**Do not copy commands out of them verbatim.**

---

## 3. Repo layout

```
GameBoostFPS_PRO_Ty.ppw/
├── main.js              Electron main process — all IPC handlers, GPU detection,
│                        splash window, overlay window, Discord RPC
├── BUILD.bat            One-click build (auto-kills old build, npm install, electron-builder)
├── icon.ico             App icon, multi-resolution, pixel-rocket design
├── icon_256.png         Source PNG for the icon
├── README.txt           End-user readme (Thai)
├── AGENTS.md            This file
├── DIAGNOSE.md          Symptom → first file to open. Read before guessing.
├── tools/validate.js    Static + runtime validator — RUN AFTER EVERY EDIT (§7)
└── src/
    ├── cards.js         Shared card core: every tweak (T), CARD_SERVICES, CARD_REQ
    ├── index.html       The renderer: HTML + CSS + all logic (cards come from cards.js)
    ├── preload.js       contextBridge — exposes window.boost.*
    └── splash.html      Frameless transparent circular launcher (Riot-style)
```

`src/index.html` is ~208 KB and holds everything in one file: markup, a large
`<style>` block, and one large inline `<script>`. **This is known technical
debt.** Splitting it into modules is welcome, but only as a deliberate,
separately-validated refactor — not as a side effect of another change.

---

## 4. Architecture

### 4.1 Process split

- **main.js** — has Node access. Runs all shell commands. Owns all windows.
- **preload.js** — the only bridge. `contextIsolation: true`,
  `nodeIntegration: false`. Do not weaken these.
- **index.html** — renderer. No Node access. Talks to main only via
  `window.boost.*`.

### 4.2 IPC surface

| Handler | Purpose |
|---|---|
| `run-cmd` | Execute a shell command via cmd.exe, 20 s timeout |
| `sysinfo` | CPU name, GPU name, RAM GB — with dedicated-GPU scoring (§9.3) |
| `hwstats` | CPU load, RAM used/total, CPU temp (ACPI), GPU temp (nvidia-smi) |
| `quick-ping` | Single ping, returns ms |
| `list-games` | Scans `tasklist` for known game executables |
| `restore-point` | Creates a Windows System Restore point |
| `overlay-show` / `overlay-hide` | The always-on-top mini stats window |
| `discord-set` | Updates Discord Rich Presence |

Renderer-side API (`preload.js`):
`isDesktop`, `run`, `sysinfo`, `restorePoint`, `hwStats`, `quickPing`,
`listGames`, `overlayShow`, `overlayHide`, `discordSet`

`window.boost.isDesktop` is `false` when `index.html` is opened directly in a
browser. Preview mode must degrade gracefully — never crash, show a toast that
the feature needs the built .exe.

### 4.3 The tweak registry

All tweaks live in one array `T` in **`src/cards.js`** (the shared card core, §4.41). Currently **162 tweaks across 21 categories**.

| Category | Count | Notes |
|---|---|---|
| `network` | 15 | Nagle, TCP stack, NIC, BBR2, RSS, NetBIOS |
| `games` | 14 | per-title: priority + shader-cache clear |
| `cpu` | 12 | power plans, parking, Latency Tuning, CringeEXE |
| `x3d` | 3 | AMD 3D V-Cache parts only — CCD handling |
| `repair` | 11 | SFC/DISM/caches — excluded from bulk (slow) |
| `policy` | 10 | |
| `svcoff` | 10 | permanent disable, guarded |
| `boost` | 8 | includes I/O priority cards |
| `ram` | 8 | |
| `gpu` | 6 | vendor-neutral, includes MPO fix |
| `input` | 6 | |
| `service` | 6 | set to Manual, guarded |
| `fivem` | 6 | |
| `audio` | 5 | |
| `privacy` | 5 | |
| `nvidia` | 4 | vendor-specific, excluded from bulk |
| `storage` | 4 | |
| `amd` | 3 | vendor-specific, excluded from bulk |
| `intel` | 3 | Intel-CPU-specific, excluded from bulk |
| `apps` | 3 | excluded from bulk (needs apps closed) |
| `clean` | 2 | action cards |

### 4.4 Bulk operations

`BULK_EXCLUDE` holds categories that "Optimize all" must skip:
`clean, fivem, games, nvidia, amd, intel, service, svcoff, apps, repair`.

Vendor categories are excluded because applying NVIDIA tweaks on a Radeon
machine is noise. `pickAutoTweaks()` re-adds the correct vendor's cards after
detecting the GPU, so Auto Tune still covers them.

### 4.5 Game Mode

One-button toggle on the Dashboard. Applies
`GAME_MODE_TWEAKS = ['ram_standby','fm_priority','dnsflush','svc_sysmain','svc_wsearch','svc_spooler','cpu_powerthrottle']`
and reverts the state-type ones on exit.

### 4.6 GPU Settings Guide page (`gpuguide`)

Because driver 3D settings are unreachable from registry (§2.1), this page reads
the real GPU + RAM, classifies the card into `high` / `mid` / `low`, and renders
a **tailored table of settings the user applies manually** in NVIDIA App or AMD
Adrenalin, each with a reason.

`gpuProfile()` holds the tier logic. It was tested against 15 real model strings.
If you touch it, re-run those cases (§7.3) — the AMD 4-digit parsing and the
Intel Arc regex both had bugs that only showed up on specific models.

### 4.7 Live Monitor page (`monitor`)

Polls `hwstats` + `quick-ping` every 2.5 s while the page is open. Also hosts:
game auto-detection (8 s poll), scheduled cleaning, benchmark before/after, and
the overlay toggle.

**Benchmark measures system state, not in-game FPS** — RAM free, process count,
ping, CPU idle. It is honest about this in the UI. Do not relabel it as an FPS
benchmark. Measuring real FPS would require bundling PresentMon (§10).

---

## 4.8 Verify / Backup / State-sync (added after v5.0)

- Cards may carry an optional `verify:{cmd, expect}`. After a state card applies,
  `verifyTweak()` runs `cmd` (a `reg query`) and checks the output contains
  `expect`. If not, the card shows "⚠ ไม่สำเร็จ" instead of a fake ✓ — important
  on debloated Windows where commands fail silently. Only add `verify` where a
  `reg query` can actually read the value back.
- `backupRegistry()` runs before any bulk apply of ≥3 cards. It `reg export`s the
  five hives the app touches to `Desktop\GameBoostFPS_Backup\*.reg`. Never remove
  this before-bulk safety net.
- `syncStateFromRegistry()` runs at startup: for every applied card that has a
  `verify`, if the real registry value no longer matches, the card is removed
  from `applied`. This reconciles localStorage with reality after a reinstall or
  an external revert.

## 4.9 Risky cards and spec-aware Auto Tune (added after v5.1)

- A card may set `risky:true`. `inBulk` excludes those, so they never run from
  "Optimize all", a profile, or Auto Tune — the user must click them by hand on
  the category page. Currently: `sysclock`, `cpu_idledisable`, `largepages`.
  Anything that can overheat hardware, needs bcdedit, or grants privileges
  belongs here.
- `sysinfo` now also returns `cores`, `threads`, `laptop` (chassis type or a real
  battery), and `allGpu` (pipe-separated list). Do not drop these fields;
  Auto Tune depends on them.
- `cpuProfile()` mirrors `gpuProfile()`: vendor, tier (high/mid/low), generation,
  X3D flag. Verified against 10 real CPU strings in `tools/validate.js` §8.
  Ryzen 3/i3/Celeron = low, gen<=2 Ryzen and gen<=6 Intel get demoted, core
  count overrides the name.
- `gpuProfile()` demotes one tier for laptop parts (name contains Laptop/Max-Q/
  Mobile, or `sys.laptop`), because a mobile 4070 is not a desktop 4070.
- `pickAutoTweaks()` returns `{ids, cpu, gpu, ram, laptop, hybrid, notes}`. It
  drops heat-heavy tweaks on laptops, adds `gpupref` on hybrid-GPU machines, and
  gates `svchost_split` on RAM >= 16GB. `notes` is shown in the terminal dock so
  the user can see *why* each decision was made — keep that transparency.

## 4.10 RAM profiling (added after v5.2)

- `sysinfo` returns `ramSticks`, `ramSpeed` (running), `ramRated` (SPD/XMP max),
  `ramType` (SMBIOSMemoryType: 24=DDR3, 26=DDR4, 34/35=DDR5), `ramSizes`, `ramSlots`.
- `ramProfile()` turns that into type/tier/channel plus a list of `issues`. The
  two that matter most in practice are **single channel** (one stick costs
  10-30% FPS) and **XMP/EXPO not enabled** (running at JEDEC while the kit is
  rated higher). Both are shown on the Memory page and in the Auto Tune log.
- **RAM frequency cannot be changed from software.** DDR4/DDR5 speed is set by
  XMP/EXPO in BIOS. Never add a card claiming to change MHz, timings, or
  voltage — same reasoning as the overclocking ban in §2.2. Report and advise
  instead.
- The `pagefile` card computes its size from installed RAM at runtime in
  PowerShell rather than shipping a fixed number.

## 4.11 Intel hybrid CPU category (added after v5.3)

- New `intel` category, excluded from bulk like `nvidia`/`amd`. Three cards:
  `intel_pcore`, `intel_shortthread`, `intel_services`.
- `cpuProfile()` sets `hybrid:true` for Intel 12th gen and newer plus all Core
  Ultra parts. Auto Tune adds the two scheduling cards only when `hybrid` is
  true; pre-12th-gen Intel gets `intel_services` only; AMD gets none.
- The scheduling cards use powercfg heterogeneous settings under SUB_PROCESSOR
  (`7f2f5cfa-...` long threads, `93b8b6dc-...` short threads), set to value 2
  = "prefer performant processors". Value 1 would pin threads to P-cores
  exclusively and waste the E-cores, so do not change it to 1.
- Each card re-checks the CPU in PowerShell before doing anything and prints
  `[skip]` on non-hybrid machines, so the log tells the truth even if the card
  is clicked manually on the wrong hardware. `intel_pcore` also echoes the
  resulting powercfg query — keep that, it is the only verification available
  for a powercfg-based tweak.
- **No AMD-CPU-specific category exists on purpose.** X3D CCD parking and
  preferred-core behaviour are handled by AMD's own driver/BIOS, not by any
  registry key we could verify. Do not invent one.

## 4.12 Categories, Startup Manager, Watchdog (added after v5.4)

Four new tweak categories: `audio`, `storage`, `privacy`, `apps`. `apps` is in
`BULK_EXCLUDE` because `app_discord` rewrites Discord's settings.json and the
user must close Discord first — never run that unattended.

**Startup Manager** (`page-startup`) reads the three Run keys via the
`startup-list` IPC handler and toggles entries with `startup-toggle`. Disabling
**moves** the value to `HKCU|HKLM\Software\GameBoostFPS\RunDisabled` rather
than deleting it, so re-enabling restores the exact original command. HKLM
entries need admin; the handler returns `{ok:false}` and the UI says so instead
of failing silently.

**Game Watchdog** (Live Monitor) is the one runtime feature in the app: while
the app stays open, detecting a game raises it to High and drops Discord/Chrome/
Spotify/launchers to BelowNormal, optionally switching to Ultimate Performance;
leaving the game restores everything including the previous power plan. It only
changes live process priorities — it never writes IFEO — so closing the app
leaves no trace. Off by default (`gb_watchdog`).

**Conflict detection** warns when Process Lasso, ISLC, Razer Cortex, or similar
tools are running, since they fight the app's settings.

## 4.13 X3D CCD awareness and the `diag` flag

`cpuProfile()` returns `ccd` (1 or 2, inferred from core count) and `dualCcd`
(`x3d && ccd===2`). **9950X3D / 9900X3D / 7950X3D / 7900X3D have two CCDs and
only CCD0 carries the 3D V-Cache.** A game scheduled onto CCD1 loses measurable
FPS — the same class of problem as Intel's P/E cores.

`amd_x3d_ccd` is a **diagnostic** card: it inspects the machine and reports what
it finds and never claims to have changed CCD assignment. Do not turn it into a
card that writes anything — CCD scheduling belongs to AMD's driver and BIOS.

Card flag `diag:true`: `inBulk` excludes it alongside `risky`, so diagnostics
never run during "Optimize all". Auto Tune adds them explicitly when the
hardware matches. Currently `amd_x3d` and `amd_x3d_ccd`.

## 4.14 Power Plan Explorer

Read-only diagnostic page. `powerplan-list` parses `powercfg /L`;
`powerplan-dump` returns raw `powercfg /qh <guid>` output (note `/qh` — hidden
settings are usually where two plans actually differ). `ppParse()` turns that
into `{sub, name, alias, ac, dc}` rows and `ppCompare()` diffs two plans.

The parser matches `/Current AC[^:]*:\s*(0x[0-9a-f]+)/i` rather than the exact
English label, so it still works on localised Windows. **This page never writes
anything — keep it that way.**

## 4.15 Repair Tools, MPO, accessibility keys

`repair` category (11 action cards) is in `BULK_EXCLUDE`: `rep_sfc` and
`rep_dism` each take 10-30 minutes and must never fire from "Optimize all".

`disp_mpo` sets `HKLM\SOFTWARE\Microsoft\Windows\Dwm\OverlayTestMode = 5` —
Microsoft's own documented workaround for the DWM Multiplane Overlay
flicker/stutter bug.

`input_stickykeys` writes Accessibility `Flags` **as REG_SZ, not DWORD**
(StickyKeys 506, Keyboard Response 122, ToggleKeys 58). Reverts are 510/126/62.

`net_bbr` probes for congestion-provider support before touching anything and
prints `[skip]` on builds without BBR2 rather than reporting false success.

## 4.16 What real gaming power plans actually set

Seven third-party `.pow` files were parsed as registry hives (they are hives,
not text). The finding that matters:

**`UltimatePerformance.pow` contains only 2 values — the name and description.**
Windows' Ultimate Performance plan sets *nothing*; it inherits every default.
That is why hand-built plans outperform it. Atlas sets 75 values, Nezha 29,
Bitsum 10.

Values Atlas sets that Ultimate does not, all under SUB_PROCESSOR
`54533251-82be-4824-96c1-47b60b740d00`:

| GUID | Alias | Atlas |
|---|---|---|
| `36687f9e-e3a5-4dbf-b1dc-15eb381c6863` | PERFEPP | 0 |
| `06cadf0e-64ed-448a-8927-ce7bf90eb35d` | PERFINCTHRESHOLD | 30 |
| `12a0ab44-fe28-4fa9-b3bd-4b64f44960a6` | PERFDECTHRESHOLD | 10 |
| `943c8cb6-6f93-4227-ad87-e9a3feec08d1` | LATENCYHINTPERF | 5 |
| `619b7505-003b-4e82-b7a6-4dd29c300971` | LATENCYHINTUNPARK | 100 |
| `45bcc044-d885-43e2-8605-ee0ec6e96b59` | PERFBOOSTPOL | 100 |
| `0cc5b647-c1df-4637-891a-dec35c318583` | CPMINCORES | 100 |
| `2ddd5a84-5a71-437e-912a-db0b8c788732` | CPINCREASETIME | 7 |

These became `cpu_latency_tune`, which Auto Tune applies to every machine.

**Atlas, Bitsum and Nezha all set `PROCTHROTTLEMIN = 100`** — the exact value
that caused §9.8. It works for many people but not on X3D or laptops, so it
lives in `cpu_atlas_extreme` (`risky:true`), which self-skips on X3D and on
anything with a battery. All of them set `IDLEDISABLE = 0`, i.e. they do **not**
disable CPU idle — matching our decision to keep `cpu_idledisable` risky and off
by default.

## 4.17 The learning brain

`gb_brain` in localStorage records, **per machine**, how each tweak has actually
behaved: `{applied, reverted, failed, ok, last}` plus the last 20 bulk runs with
a before/after system measurement.

Two rules feed back into `pickAutoTweaks()`:
- reverted >= 2 times -> stop offering it ("you reverted this twice")
- failed >= 2 times with zero successes -> stop offering it ("doesn't work here")

Skipped ids are reported in `notes`, so the user can see *why* Auto Tune left
something out. The Live Monitor panel lists them with a "ลืมซะ" button that
resets the counters, plus a full reset.

`brainCheckMachine()` compares a CPU|GPU|RAM signature and wipes everything if
the hardware changed — learned data from a different machine is worse than none.

`brainMeasure()` samples free RAM, process count and ping before and after every
bulk apply; `brainVerdict()` scores the delta and logs a warning when a batch
made the numbers worse. **It never auto-reverts** — it reports and lets the user
decide. Do not make it revert automatically; a metric dipping is not proof a
tweak is bad.

Everything stays local. Nothing is uploaded.

## 4.18 Shipping a real .pow file

`assets/KernelOS_V6_1.pow` is a genuine exported plan (72 values) that ships with
the app. `BUILD.bat` copies the whole `assets/` folder.

`import-powerplan` takes a **filename only**, strips everything except
`[A-Za-z0-9._-]`, and resolves it inside `assets/` — never accept a path from the
renderer. It snapshots `powercfg /L` before and after the import to find the new
GUID (the import prints one, but parsing `/L` is more reliable), activates it,
and returns `{ok, guid}`. `open-powercfg` launches `control.exe powercfg.cpl` —
the modern Settings app has no power-plan UI at all.

The card uses the sentinel command `__IMPORT_KERNELOS__`, which `applyTweak()`
intercepts before it reaches the shell. Only open Power Options **after** a
successful import, so a failure does not pop a window that implies it worked.

`cpu_unhide_power` runs `powercfg -attributes <sub> <setting> -ATTRIB_HIDE` over
the settings worth editing. It **changes no values** — it only makes them appear
under "Change advanced power settings".

**Bug found in testing:** `BUILD.bat` copied `assets/` into the build folder, but
the generated `package.json` had `"files": ["main.js", "src/**/*", "icon.ico"]`
— electron-builder therefore dropped the folder from the package and the card
reported "ไม่พบไฟล์". **Any new folder that must ship has to be added to that
`files` array as well as copied by BUILD.bat.** The handler now searches four
locations (`__dirname`, `resourcesPath`, inside `app.asar`, next to the .exe)
and extracts to temp when the file lives inside the asar, since `powercfg` cannot
read a path inside an archive.

**Second bug in the same feature:** the handler originally built one long
PowerShell command and passed it through `exec()` with `shell: 'cmd.exe'`. cmd
mangles `"`, `|`, `{}` and `$_`, so the command failed with
`Command failed: powershell -NoProfile ... "$src='C:\Users\...`. It now writes
the script to `%TEMP%\gb_importplan.ps1` and runs
`execFile('powershell.exe', ['-File', script, src])` — the path arrives as
`$args[0]`, nothing is interpolated into a quoted string, and cmd is not in the
chain at all. Results come back via `OKGUID:` / `ERRIMPORT:` markers.

**Rule:** any PowerShell longer than a couple of statements goes in a temp `.ps1`
run with `-File`, never inline through cmd.

**Third fix, same feature.** `__dirname` inside a packaged build points *into*
`app.asar`. `fs.readFileSync` can read from there, but **`powercfg` cannot** — it
is an external process and the archive is not a real directory, so it returned
"The file could not be found." The handler now copies the asset to
`%TEMP%\gb_<name>.pow` **unconditionally** (not only when the path contains
`app.asar`), verifies the copy exists and is non-trivial in size, and passes only
that temp path to PowerShell. `BUILD.bat` additionally sets `asarUnpack` and
`extraResources` for `assets/**/*` so the file also exists on disk outside the
archive.

**Rule:** never hand an external process a path that may live inside the asar.
Copy to temp first, then verify the copy.

Extracted values (KernelOS vs Atlas) are in §4.16. Worth repeating: **KernelOS
sets `PROCTHROTTLEMIN = 5`, not 100** — the plan the user reports as fastest does
*not* pin the CPU, which independently confirms the §9.8 fix.

## 4.19 Building our own plan — and a correction

A user-supplied `PowerPlan_Compare.txt` (produced by the Explorer, §4.14) carried
Windows' **own friendly names**, which proved several GUID labels in §4.16 were
guesses and wrong:

| GUID | was labelled | actually is |
|---|---|---|
| `06cadf0e-…` | PERFINCTIME | **PERFINCTHRESHOLD** (a percentage) |
| `12a0ab44-…` | PERFDECTIME | **PERFDECTHRESHOLD** (a percentage) |
| `2ddd5a84-…` | CPDISTRIBUTION | **CPINCREASETIME** |
| `4b92d758-…` | PERFINCTHRESHOLD | **IDLEDEMOTE** |
| `7f2f5cfa-…` | hetero *thread scheduling* policy | **HETEROPOLICY** ("policy in effect") |

The last one matters: `intel_pcore` writes `7f2f5cfa-…`. Its description should
not promise "sends threads to P-cores" — the setting selects a numbered
heterogeneous policy. Reword rather than delete; the value is still a legitimate
tuning knob, we simply cannot claim exactly what policy 2 does.

**Also note the diff was partly contaminated by our own app:** `PROCTHROTTLEMIN`
did not appear as different because `cpu_fixstuck` had already set it to 5 on
*every* plan on that machine. Always cross-check a live diff against the original
`.pow`.

**`build-trixie-plan`** creates "CringeEXE" at runtime with
powercfg rather than shipping another `.pow`, so it works on any Windows edition
and language. It deletes its own previous copies (never the active one),
duplicates Ultimate -> High performance -> Balanced as fallbacks, renames with
`powercfg -changename`, then walks a 32-row table calling `powercfg /q` first and
skipping any setting this build does not expose. It returns
`OKPLAN:<guid>:<applied>:<skipped>` so the UI can report both numbers honestly.
Sleep-disabling rows are skipped when a battery is present.

## 4.20 Frametime stability

FPS counters hide stutter. These features target *consistency*, and the UI says
so — the app still cannot measure real in-game FPS or 1% lows (§10).

**`timer-res`** requests the finest timer Windows offers via
`NtSetTimerResolution` and **keeps a PowerShell process alive** holding it. This
is required: the moment the requesting process exits, Windows restores the old
resolution. The process is killed on toggle-off and on `before-quit`, so nothing
is left behind — unlike tools that leave the system timer altered after closing.
Declare the variables `[uint32]`, not `[uint]`; the latter is not a PowerShell
type accelerator and the script fails silently.

**`dpc-check`** samples `% DPC Time` and `% Interrupt Time`. Above ~2% means a
driver is stalling the system and the user will feel stutter regardless of FPS —
the UI points at LatencyMon rather than pretending the app can identify the
driver.

**`gpu_hags_off`** is deliberately the opposite of `hwsched`. HAGS helps some
machines and causes stutter on others, and there is no way to predict which, so
both exist and the card says to test. It is `diag:true` so Auto Tune never picks
a side.

**`cpu_ccd_lock`** sets `ProcessorAffinity` on a running game to the first half
of the cores (CCD0, the one with 3D V-Cache) on dual-CCD X3D parts only. Runtime
only — it self-skips when the CPU is not X3D, when there is a single CCD, or when
no game is running.

**`fm_pool`** edits `citizenfx.ini` and **backs it up to `.gbbak` first**. Any
card that rewrites a user config file must keep a backup.

## 4.21 Two bugs in `build-trixie-plan`

**The value table was never passed in.** The handler referenced a `rows`
variable that was never declared, so the generated PowerShell contained
`$rows = @(    )` — an empty array. The plan was created and renamed correctly,
which is why it *looked* like it worked, but zero settings were applied. Always
verify a generated script by extracting and printing it, not by reading the
JavaScript that builds it.

**It called `powercfg /q` once per row.** 32 queries, each spawning a process and
dumping a whole subgroup, is why it appeared to hang. It now runs `powercfg /q $g`
**once**, keeps the text, and does an in-memory `IndexOf` per row. Roughly
20-40s instead of 60-150s.

The handler uses `spawn` rather than `execFile` so `STEP:` lines stream back to
the renderer over the `trixie-progress` channel — a long operation must show
progress, otherwise the user cannot tell it apart from a hang.

## 4.22 `powercfg -import` fails on some debloated Windows

On an Atlas OS machine, `powercfg -import "C:\Trixielynn.pow"` returned
**"The file could not be found"** while `dir C:\*.pow` showed the file present
with the correct name and size. The message is misleading: it is not about the
`.pow` file. Confirmed by testing on the same machine:

| command | result |
|---|---|
| `powercfg -import <file>` | fails, "file could not be found" |
| `powercfg -duplicatescheme <guid>` | **works** |
| `powercfg -setacvalueindex ...` | **works**, verified by `/q` |

So plan *creation* and value *setting* are fine; only `-import` is broken.
**Prefer `-duplicatescheme` over shipping and importing a `.pow`.**

**The real bug in our own code:** the script hardcoded
`e9a42b02-d5df-448d-aa00-03f14749eb61` as the Ultimate Performance base. That
GUID is the *template* Microsoft ships; a machine where Ultimate has already
been created has a **different** GUID (here `2b7fb8c7-…`), so the lookup failed
and every fallback branch failed with it.

It now parses `powercfg /L`, reads the friendly name in parentheses, and picks
the first plan matching Ultimate -> High perf -> Balanced, falling back to
whatever exists. **Never hardcode a power scheme GUID for anything except the
built-in template you are duplicating from.**

## 4.23 Dropping the .pow route

Since `-import` is unreliable (§4.22) the app **no longer ships a .pow file at
all**. `assets/`, the `import-powerplan` handler, `importPowerPlan` in preload,
and the `assets` lines in BUILD.bat were all removed — dead code that only
existed for a path that does not work everywhere.

The single remaining card is `cpu_trixie`, which builds the plan with
`duplicatescheme` + `changename` + 32 `setacvalueindex` calls. Plan name and
description live in `PLAN` / `PLANDESC` at the top of the handler; change them
there, not in the script strings.

Icons: card `icon` is injected raw into a template literal (`${t.icon}`), so an
inline `<svg>` works. Use **single quotes** for SVG attributes — double quotes
break the surrounding template — and `stroke="currentColor"` so the icon follows
the active theme. The X3D cards use a CPU-die glyph rather than an emoji.

## 4.24 Process spawns are the bottleneck

Auto Tune was taking ~30-50s. The cause was not any single command — it was
**178 process spawns**: 155 tweak commands, 11 verifies, 5 registry exports,
6 measurement calls. On Windows each `cmd.exe` costs 80-150ms and each
`powershell.exe` 400-800ms.

Two fixes:

**`run-batch`** writes all of a tweak's commands to one temp `.bat` with
`echo ###GB:<i>:%ERRORLEVEL%###` between them, runs it once, and splits stdout
on the markers to recover per-command results. Per-command error detection is
preserved. Auto Tune drops from 155 spawns to 77 (-50%). `backupRegistry` uses
it too, turning 5 exports into 1 spawn.

**The plan builder writes the registry directly.** Power scheme values live at
`HKLM\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes\<scheme>\<subgroup>\<setting>`
as `ACSettingIndex` / `DCSettingIndex` DWORDs — the same layout a `.pow` hive
contains. Setting all 32 rows via `New-ItemProperty` costs **zero** extra
processes, versus 64 `powercfg` calls before. Total powercfg calls: 67 -> 8.
`powercfg -setactive` is issued twice at the end so Windows re-reads what was
written.

**Rule:** when something feels slow, count the process spawns before optimising
anything else.

## 4.25 Never put non-ASCII inside a generated PowerShell script

The plan builder kept failing with `ERR: ?1,?,??1^?,z?,s power plan ...` — that
is `ERRPLAN:ไม่พบ power plan ใดในเครื่อง` after the Thai was mangled.

**PowerShell 5.1 reads a `-File` script as the system ANSI codepage unless the
file has a UTF-8 BOM.** Our scripts were written with `fs.writeFileSync(f, ps,
'utf8')` — no BOM — so every Thai character became garbage bytes. Beyond the
unreadable message, a mangled byte can land as a quote or brace and break the
script outright, which is why earlier failures looked random and why each
"fix" appeared to change nothing.

Two rules now:
1. **Generated `.ps1` files are written as `'\ufeff' + script`.**
2. **Scripts contain ASCII only.** Status and error text are short codes
   (`STEP:CLEAN`, `ERRPLAN:NOBASE`) translated to Thai in JavaScript, where
   encoding is never in question.

The failure path also appends the last 180 chars of raw output as
`| raw: ...`, so a screenshot of the log is enough to diagnose next time.

**This was the root cause behind roughly six rounds of failed fixes.** Symptoms
kept moving because the real defect was in the transport, not the logic.

## 4.26 Licensing (offline HWID key)

`LICENSE_API` at the top of main.js must be set to the deployed Cloudflare
Worker URL before shipping; the handler refuses with `NOSERVER` while it still
contains the placeholder.

Flow: `get-hwid` hashes ProcessorId + BaseBoard serial + disk serial + system
UUID into 32 hex chars. `license-call` posts `{key, hwid}` to `/activate` or
`/check`. A success is cached to `userData/lic.dat` (base64 JSON) with a
timestamp; `REVOKED` / `EXPIRED` / `NOTFOUND` delete the cache immediately.
Network failure falls back to the cache for `offlineDays` (7), after which the
gate blocks — so a user is never locked out by a temporary outage, but a revoked
key cannot be kept alive by staying offline.

The gate is `#licGate`, shown by `licInit()` at startup and hidden only on a
verified pass. **Preview mode (`!DESKTOP`) skips the gate** so the HTML stays
openable during development.

**Be honest in any discussion of this:** a client-side check can be patched out
by anyone who can edit the bundle. This exists to control distribution, bind a
key to one machine and allow remote revocation — not to prevent cracking. Do not
describe it as copy protection.

## 4.27 Offline key scheme (current)

The Cloudflare Worker route was abandoned: its dashboard editor kept failing to
deploy (`FileSystemError: no file system handle registered`), and a server is one
more thing that can take every user offline at once.

The key is now **derived** rather than looked up:
`sha256(LIC_SALT + hwid)` -> 16 chars from a confusable-free alphabet ->
`GBFPS-XXXX-XXXX-XXXX-XXXX`. `license-call` recomputes it and compares. A key
therefore only validates on the machine it was made for, with no network at all.

`LIC_SALT` in main.js **must match the constant in keygen.html**. Changing either
invalidates every key already issued.

Trade-offs, to state plainly if asked: keys cannot be revoked, active users
cannot be counted, and a machine change needs a new key. Anyone able to edit the
bundle can still bypass the check — this controls distribution, not copying.

## 4.28 The gate must exist before the script runs

The license gate rendered nothing on a real build even though every function was
present. Cause: `#licGate` had been appended just before `</body>`, but the app's
`<script>` block sits far earlier in the file and calls `licInit()` inline. At
that moment `document.querySelector('#licGate')` returned `null`, every `licSay`
/ `licShow` silently no-oped, and the app opened normally.

The markup now sits **immediately before `<script>`**.

**This slipped through because the test stub returned an element for every id.**
Tests for DOM-dependent code must build the available-id set from the HTML
*preceding* the script tag and return `null` for anything else — otherwise they
prove only that the functions run, not that they can find what they need.

## 4.29 `rep_steamfix` and the standalone Steam Doctor

After §9.11 broke a user's Steam, two things were added.

`rep_steamfix` (repair category, so never in bulk) reverses everything the app
could have done that stops Steam launching: IFEO entries for steam and every
launcher, `AppInfo` / `CryptSvc` / `BITS` / `msiserver` / `PcaSvc` / `EventLog`
re-enabled if disabled, `HwSchMode` back to 2, `OverlayTestMode` removed, and
Steam's own caches cleared.

**Every command in it restores or deletes — none configures.** Keep it that way;
a repair tool that can itself change settings is a repair tool that can make
things worse.

A standalone `GameBoost_SteamDoctor.zip` does the same work plus diagnostics
(service states, Debugger entries, `bootstrap_log.txt` tail) for users whose app
will not open or who no longer trust it. Written with a UTF-8 BOM per §4.25.

**Diagnostic lesson from this incident:** the Event Viewer query showed *no*
Steam crash at all — which ruled out steamwebhelper crashing and pointed at
launch being blocked instead. Ask for `bootstrap_log.txt` early; Steam records
exactly where it stalls, and it would have been faster than six rounds of
guesswork.

## 4.30 Separate `x3d` category

`amd_x3d`, `amd_x3d_ccd` and `cpu_ccd_lock` moved out of `cpu` into their own
`x3d` category. They apply only to parts with 3D V-Cache, so mixing them into the
general CPU page made that page misleading on every other machine.

All three are `diag:true`, so the move does not change what Auto Tune applies —
it adds them by id (`amd_x3d` when `x3d`, `amd_x3d_ccd` when `dualCcd`), and
category membership is irrelevant to that path. Verified across 9950X3D /
9800X3D / 7950X / i9-14900K after the move.

When adding a category, five places need updating together: the cards' `cat`,
`CATS`, the nav button, the `<section id="page-...">`, and the render arrays that
list category ids. The validator catches a missing `CATS` entry but not a missing
nav button or page.

## 4.31 Showing the user what Windows actually said

A user asked how they could tell the app had really run its commands, having seen
a plain PowerShell window print `The operation completed successfully.` The app
was hiding that output — only `OK:` / `[skip]` / `ERR:` lines ever surfaced — so
there was no way to check its work.

Two additions:

**Verbose toggle** (`gb_verbose`, the "ผลลัพธ์เต็ม" control on the Activity page)
echoes up to three lines of raw stdout/stderr per command. Commands that print
nothing on success — `powercfg`, most `netsh` — say so explicitly rather than
appearing to have done nothing. It had to be added to **both** apply paths;
see §9.18 for the last time only one was updated.

**Runtime admin check** (`is-admin`) does not trust the manifest. It reads the
token *and* writes a probe value to `HKLM\SOFTWARE\GameBoostFPS` and deletes it,
because a machine can be elevated yet still blocked by policy or security
software. Three states are reported at startup: fine, elevated-but-blocked, not
elevated.

**Read-back beats a success message.** `reg add` reports success while a policy
overwrites the value a moment later, or while writing into WOW64 redirection.
The `verify` field already existed for this; it matters more than the command's
own exit code.

## 4.32 Ported from the CringeEXE build

`net_udp_uro` disables UDP Receive Offload. **FiveM carries player state over
UDP**, so this is closer to the game's actual traffic than any of the TCP cards,
which the game never uses. `nonsackrttresiliency` is disabled alongside it.

`net_fastopen` and `net_qos_nla` fill gaps the audit found. `sys_hpet_off` deletes
`useplatformclock` if present — a value many users set believing it helps, which
forces HPET and makes latency worse on current hardware. There is no card that
sets it; the card only removes it.

## 4.33 `excl` — cards that fight over one registry value

A registry value holds one value. Two cards writing different values to the same
one cancel each other, but both stayed marked applied, so the tuned percentage
and the Restore page both lied about the machine's state.

Cards that write the same value with opposing intent declare a shared group:

```js
{ id:'hwsched',      cat:'gpu', excl:'hags', ... }   // HwSchMode = 2
{ id:'gpu_hags_off', cat:'gpu', excl:'hags', ... }   // HwSchMode = 1
```

`OPPOSITES` is derived from `excl` at load time, so adding a new opposing pair
needs no change to the apply logic. Applying one clears the other from `applied`
and tells the user which value actually survived.

**Validator section 20 parses every `reg add` in every card**, groups them by
`key\value`, and fails when two cards write *different* values without a shared
`excl`. Scanning 150 cards found six values written twice with the *same* value
(redundant but harmless, reported as info) and one real conflict — the pair
above. Hardcoding that one pair would have left any future collision silent.

## 4.34 Running safely on Windows the developer has never seen

Three handlers exist so the app adapts to the machine instead of assuming.

**`os-profile`** reads build, edition, DisplayVersion, activation state, and
whether components are missing (`hasDefender`, `hasMF`, `hasWU`, `hasXbox`,
`svcCount`). A machine with fewer than 150 services is treated as debloated.
`hasUdpGlobal` probes whether `netsh int udp` exists at all.

**`CARD_REQ` + `cardBlocked`** gate cards on that profile. `net_udp_uro` needs
Windows 11; `hwsched` needs build 19041; `defender_excl` needs Defender present.
A blocked card logs *why* it was skipped rather than running and failing with a
message the user cannot interpret.

**`svc-disable`** replaced every direct `sc config X start=disabled`. It refuses
anything in `SVC_PROTECTED` (RpcSs, DcomLaunch, AppInfo, CryptSvc, PlugPlay,
audio, and the rest a desktop cannot run without), and **skips any service with a
running dependent**, reporting `X<-Y` so the user sees what saved them. Disabling
a service other things depend on is the single easiest way to make an unrelated
program stop launching with no error anywhere.

**`health-check`** runs after every bulk operation. It fails loudly on
`SystemResponsiveness = 0` (§9.19), any disabled load-bearing service, an IFEO
`Debugger` entry, and `LetAppsRunInBackground = 2`. Catching this at the end of
the run is worth far more than catching it days later.

**Activation is reported but never gates anything.** An unactivated Windows
applies these settings normally; saying otherwise would be wrong.

Validator section 21 asserts all of the above, including that no bulk path
finishes without a health check.

## 4.35 Windows Update undoes tweaks; the app now notices

"ยิ่งอัพเดทยิ่งแย่" — every cumulative update quietly restores a handful of
values to default, and the dashboard kept showing ✓ for cards whose settings
were gone. The user experienced this as the app getting worse over time.

`syncStateFromRegistry` already re-verified applied cards at startup. It now
also **explains** the drift: `os-profile` reads the newest hotfix (`Get-HotFix`)
and its install date; if that is on or after `gb_last_tune`, the message names
the KB. A bar at the top offers to re-apply everything that drifted through
`applyMany`, so the fix is one click rather than a hunt.

`os-profile` also reports **VBS / HVCI** (`Win32_DeviceGuard`) and **Smart App
Control** (`CI\Policy\VerifiedAndReputablePolicyState`). Both ship on by
default on 24H2+ clean installs. VBS makes some kernel-adjacent tweaks
ineffective; SAC can block generated `.ps1` / `.bat` silently. The app warns
about both at startup rather than letting the user discover it as "tweak did
nothing".

Three cards cover 24H2 bloat and update hygiene, gated on build number:
`w11_copilot` (22631+), `w11_recall` (26100+), `w11_wusettings` (excludes
driver updates from WU — those are usually older than the vendor's — and
prevents auto-reboot while logged in).

**Validator section 25 now generates every PowerShell script the app would
write and inspects the output** for non-ASCII bytes, missing BOM, unbalanced
brackets and leftover placeholders. §4.25 has been violated three times by Thai
comments inside script strings; reading the JS never caught it, running the
generator does.

## 4.36 The developer works through Parsec

Tweaks are applied to customer machines over Parsec. Some cards drop that
session mid-run: anything that bounces the NIC, restarts the audio service,
or flips a display-driver value the encoder depends on. When the session drops
halfway through a bulk operation, the remaining cards never run and nobody
knows how far it got.

**`os-profile`** now reads `GetSystemMetrics(SM_REMOTESESSION)` and looks for
`parsecd` / AnyDesk / TeamViewer / `mstsc` processes. **`remote:true`** marks
the cards that can drop the session (`nic_offload`, `nic_power`, `aud_restart`,
`hwsched`, `disp_mpo`, `rep_iconcache`). **`orderForRemote`** moves them to the
end of any bulk list so the safe cards land first; the log says which were
deferred and why.

**`nic_offload` no longer calls `Disable-NetAdapterRsc`**, which always resets
the adapter. It sets the same properties through
`Set-NetAdapterAdvancedProperty -NoRestart`; the change takes effect at the next
reboot or cable reconnect, which is the right trade for not losing the session.

The reboot bar's confirm text says the session will drop and to reconnect after
a minute or two. Nothing in the app depends on the session surviving a reboot.

Validator section 27 fails if a bulk card bounces the NIC or if the remote
flagging disappears.

## 4.37 Remote blocklist (signed)

A card that turns out to harm machines (BBR2 on 24H2+, §9.12) can be switched
off for every customer **without a rebuild**. `main.js` fetches
`BLOCKLIST_URL` (raw GitHub file the owner controls) at startup, 6 s timeout,
and caches it to `userData/blocklist.json`.

- File: `{"payload":"<json text>","sig":"<base64>"}`. The payload is
  `{"seq":N,"issued":"YYYY-MM-DD","rules":{"<card id>":{…,"why":"…"}}}`.
- Rules use the **same schema as `CARD_REQ`** (`build`, `maxBuild`, `need`,
  `gpu`, `needDlss`, `needFG`, `dlssMin`) plus `all:true`. `cardBlocked()`
  checks the remote rule first, then the built-in one, through one evaluator
  (`reqWhy`).
- **Ed25519 signature.** Only the public key ships (`BLOCKLIST_PUBKEY`). The
  private key and `sign.js` live in the separate *BlocklistSigner* folder on the
  owner's machine — never in the app, never on GitHub. Validator 35 fails if a
  `PRIVATE KEY` appears anywhere in the app.
- **No rollback:** a fetched file with a lower `seq` than the cached one is
  ignored. Unsigned / wrongly signed / malformed files are ignored.
- Placeholder URL (`OWNER/REPO`) = feature off; the app behaves exactly as
  before. Offline = cached rules.
- Losing the private key means a new keypair and a rebuild. Tell the owner to
  back it up.

## 4.38 Support bundle ("ส่งข้อมูลให้แอดมิน")

One button (sidebar footer) builds `Desktop\GameBoost_Support_<time>.zip`:
`system.txt` (OS/CPU/GPU/RAM incl. rated vs running speed, refresh rate, power
plan, HAGS, VBS, SAC, UAC), `network.txt` (congestion provider, TCP globals,
adapters), `ifeo.txt`, `services_disabled.txt`, `runtimes.txt` (VC++ DLLs),
`processes.txt`, `boot.txt`, `events.txt` (3 days of app errors), `steam/`
(tails of console/bootstrap/webhelper/cef/connection logs), and from the
renderer `app_state.json` (OS profile, GPU caps, applied ids, brain, blocklist
seq) + `app_log.txt`.

It exists because the BBR2 case took four rounds of hand-written scripts over
Parsec. Everything that was asked for in those rounds is in the zip.

**Privacy line:** no browser profiles, documents, downloads or passwords; logs
are tail-limited. Validator 37 enforces both. The script is generated as ASCII
with a BOM (§4.25) and parsed by validator 40.

## 4.39 Pre-game check (dashboard)

The things that move FPS more than any registry value, shown before play:
- **XMP/EXPO** — `ramProfile().maybeJedec`: a *desktop* whose RAM runs at the
  JEDEC default (DDR4 ≤ 2666, DDR5 ≤ 4800). Windows often reports the kit's
  rated speed at JEDEC too, so the older rated-vs-running rule missed most real
  cases. Laptops are never nagged (soldered RAM). Advice only — §4.10.
- **Background hogs** — `HOGS` list: Android emulators (LDPlayer
  `Ld9BoxHeadless`, MEmu, BlueStacks, Nox), live wallpapers, Medal, OBS, RGB
  suites. Emulators/wallpapers/Medal get a "close" button (confirm first); OBS
  and RGB suites are warned about only — OBS may be streaming. Buttons use
  `data-hogkill`, not `data-kill` (that belongs to Top Processes).
- **Memory Integrity** — reported with the trade-off; never switched off.
- **Frame cap** — `capFor(hz) = hz - 3` (60 Hz stays 60) from the real refresh
  rate (`sysinfo.hz`). Also feeds the GPU Guide rows.
Validator 38.

## 4.40 Auto Tune v3 — plan, explain, confirm

`autoTune()` = `bootReady()` (waits for OS profile, GPU caps, blocklist and
specs, max 15 s) → `buildTunePlan()` → `showPlan()` (modal with counts per
category, outside-the-app advice, and every reason) → `applyMany` → in
`finally`: reboot flag, health check, pre-game check, button reset.

`buildTunePlan()` adds to `pickAutoTweaks()`:
- skips cards already applied (no rewrite),
- resolves `excl` groups — one card per group, first in `T` wins. Before this
  Auto Tune applied **both** `hwsched` and `gpu_hags_off`, leaving HAGS off —
  which Frame Generation needs on,
- on battery (`sysinfo.onBattery`) holds back power cards and says so,
- carries XMP / Memory Integrity / frame-cap advice into the plan.
Validator 39 checks all of it plus "no variable borrowed from another function".

## 4.41 Shared card core (`src/cards.js`)

Cards, `CARD_SERVICES` and `CARD_REQ` moved out of `index.html` into
`src/cards.js`, loaded by `<script src="cards.js">` before the app script.
It must stay **pure data** (validator 34): no DOM, no bridge calls.
`BUILD.bat` and `BUILD_LEGACY.bat` copy it explicitly — they copy files one by
one, and a missing copy means an .exe with zero cards (validator 34).

Phase 2 (not done yet): CringeEXE and Cringe BoostFPS load this same file
instead of their own copies, so one fix lands in all three apps. Their card
schemas differ slightly (double-quoted JSON-ish strings, a `verify` object on
more cards); write an adapter, do not hand-merge.

## 5. Tweak card schema

```js
{
  id:   'unique_snake_case',      // must be unique across the whole array
  cat:  'network',                // must exist as a key in CATS
  icon: '🔌',
  name: 'Short title',            // Thai
  desc: 'What it does and why',   // Thai — be specific, users read this
  tags: [['ลด latency','lat'], ['FPS','fps']],   // tag style: lat | fps | warn
  apply:  ['cmd 1', 'cmd 2'],     // array of shell command strings
  revert: ['cmd 1'] | null,
  verify: {cmd, expect},          // optional — reg query check after apply
  risky:  true,                   // optional — has a side effect worth warning about
  diag:   true                    // optional — reports rather than changes
}
```

`risky` and `diag` both keep a card out of `inBulk`, so neither runs during
"Optimize all" or Auto Tune unless Auto Tune adds it explicitly by id.

### State cards vs action cards

- `revert: [...]` → **state card**. Locks to "✓ Applied", tracked in Restore,
  counted in the tuned percentage.
- `revert: null` → **action card**. Repeatable, shows "▶ Run" / "↻ Run again",
  **not** tracked in Restore and not counted as applied.

Cache clears, DNS flush, and RAM purge are action cards — running them twice is
normal and there is nothing to undo. Getting this wrong causes the "card locked
after one click" bug that was already fixed once.

### Guarding destructive commands

Service tweaks must not fail loudly on machines where the service does not
exist. Follow the existing guard pattern in the `service` / `svcoff` cards
rather than inventing a new one.

---

## 6. Adding a new tweak — checklist

1. Verify the command actually works and the key is real (§2.1).
2. Pick a unique `id` and an existing `cat`.
3. Write a real `revert`, or set `revert: null` if it is genuinely an action.
4. If the category is new: add it to `CATS`, add a nav button, add a
   `<section class="page" id="page-<cat>">` with `<div class="grid"
   id="grid-<cat>">`, and add the cat to the three `isCat` / render / count
   arrays. Missing any one of these produces an empty page with no error.
5. Decide whether it belongs in `BULK_EXCLUDE`.
6. Run `node tools/validate.js` (§7). It must pass clean.
7. Only then build.

---

## 7. Validation — run after every edit

```
node tools/validate.js
```

This is not optional and it is fast. It catches, in order:

1. `node --check` on `main.js` and `preload.js`
2. Every `<script>` block in `index.html` and `splash.html` parses
3. The tweak array evaluates in a DOM-stubbed sandbox
4. Zero malformed cards (missing id/cat/name/apply, bad revert type)
5. Zero duplicate ids
6. Every `cat` used has a `CATS` label
7. CSS brace balance in every `<style>` block
8. `gpuProfile()` tier detection against 15 known GPU model strings

### 7.1 Why a sandbox rather than a browser

There is no browser in CI. The validator stubs `document`, `localStorage`,
`window.boost`, and the timer functions, then evaluates the inline script with
`new Function()`. If you add code that touches a DOM API the stub does not
implement, extend the stub in `tools/validate.js` — **do not** weaken the check
or skip it.

### 7.2 Functional testing async code

`window.boost` is mocked in the validator, so `refreshMon()`, `detectGames()`,
`benchSnap()`, and `renderGuide()` can be called directly and their output
asserted. Several real bugs were caught this way before ever building.

### 7.3 GPU tier cases that must keep passing

| GPU string | vendor | tier |
|---|---|---|
| `NVIDIA GeForce RTX 4090` | nvidia | high |
| `NVIDIA GeForce RTX 4070` | nvidia | high |
| `NVIDIA GeForce RTX 3060` | nvidia | mid |
| `NVIDIA GeForce RTX 2060` | nvidia | mid |
| `NVIDIA GeForce GTX 1650` | nvidia | low |
| `AMD Radeon RX 9070 XT` | amd | high |
| `AMD Radeon RX 7900 XTX` | amd | high |
| `AMD Radeon RX 7800 XT` | amd | high |
| `AMD Radeon RX 7600` | amd | mid |
| `AMD Radeon RX 6600` | amd | mid |
| `AMD Radeon RX 6500 XT` | amd | low |
| `AMD Radeon RX 580` | amd | low |
| `AMD Radeon(TM) Graphics` | amd | low |
| `Intel(R) Arc(TM) A770 Graphics` | intel | mid |
| `Intel(R) UHD Graphics 770` | intel | low |

---

### 7.4 Newer rules (index)

| § | Guards |
|---|---|
| 28 | gauge markup (number and % on one line) |
| 29 | reboot flag clears after a real reboot |
| 30 | Cyber HUD: default variant, offline fonts, animation pauses when unfocused, no Electron-22-incompatible CSS |
| 31 | input queues never below 100 |
| 32 | BBR2 never applied on 24H2+; Steam repair undoes it |
| 33 | every sidebar page has a `CATS` title |
| 34 | `cards.js` loaded first, copied by both BUILD scripts, pure data |
| 35 | blocklist is Ed25519-verified, rollback-proof, no private key in the app |
| 36 | every `loadX()` loader is actually called |
| 37 | support bundle includes Steam/BBR/IFEO state and no private user data |
| 38 | frame cap math, hog detection, XMP hint (desktop only) |
| 39 | Auto Tune: plan + confirm, excl resolved, battery aware, `finally` |
| 40 | every PowerShell command and generated script passes PowerShell's real parser (skipped with a notice if no PowerShell is installed) |

## 8. Build and release

### Developer build

Double-click `BUILD.bat`. It:
1. Kills any running `GameBoostFPS.exe` / `electron.exe` and deletes the old
   `GameBoostFPS_Build` folder — **this auto-cleanup must stay**, the user hit
   locked-file errors without it
2. Copies `main.js`, `icon.ico`, `src/preload.js`, `src/index.html`,
   `src/splash.html`
3. Writes `package.json` (portable target, asar on, `requireAdministrator`)
4. `npm install` + `electron-builder --win`

Output: `GameBoostFPS_Build\dist\GameBoostFPS_Ty.ppw.exe`

Admin elevation is required because the tweaks write to HKLM and control
services.

### Two distributions

- **DEV zip** — readable source, for development.
- **SHARE zip** — `main.js`, `preload.js`, and the inline scripts of
  `index.html` and `splash.html` are obfuscated with
  `javascript-obfuscator@4.1.1`.

Obfuscator options in use: `compact`, `controlFlowFlattening 0.7`,
`deadCodeInjection`, hexadecimal identifiers, `numbersToExpressions`,
`stringArray` with base64 at threshold 0.75, `splitStrings` chunk 8,
`transformObjectKeys`, `selfDefending`.

Always `node --check` the obfuscated output and re-parse every `<script>` block
before zipping. Obfuscation has silently broken builds before.

The Discord client ID gets base64-encoded by the string array in SHARE builds —
`grep` will not find it, but it decodes correctly at runtime. That is expected.

---

## 9. Bug history — do not re-introduce

### 9.1 The app-won't-open hang

A transparent, always-on-top splash window failed to render on some debloated
Windows installs. The main window was `show: false` waiting on `ready-to-show`,
which never fired — the app hung with a spinner cursor and no window.

The current design keeps the Riot-style splash but makes reveal unconditional:

- splash creation is wrapped in `try/catch`
- a fixed `setTimeout(reveal, 6000)` shows the main window regardless of events
- a second failsafe at 13000 ms force-closes the splash and shows the window
- `did-fail-load` also triggers reveal

**Never make the main window's visibility depend solely on an Electron event.**
If you touch the splash, keep all four layers.

### 9.2 `prefers-reduced-motion` killed every animation

`index.html` contains:

```css
@media(prefers-reduced-motion:reduce){
  *:not(#bootScreen):not(#bootScreen *){animation:none!important; transition:none!important}
}
```

The original rule used a bare `*`, which disabled **all** animation app-wide
whenever Windows had animation effects turned off — which is the default on
Atlas OS / Revi OS, *and* is exactly what the app's own "Visual Effects off"
tweak causes. The app was disabling its own loading spinner.

Splash animations additionally carry inline `!important`, because an inline
`!important` declaration outranks an author-stylesheet `!important` one.

Do not "clean up" either the `:not()` selector or those `!important` flags.

### 9.3 iGPU reported instead of the real GPU

`sysinfo` originally took the first `Win32_VideoController` or sorted by
`AdapterRAM`. Both are wrong: `AdapterRAM` is unreliable (it is a 32-bit field,
so cards above 4 GB report garbage, while iGPUs report shared system RAM).

On a Ryzen 9 9800X3D the app showed `AMD Radeon(TM) Graphics` (the iGPU) instead
of the discrete card.

Current approach is **name-based scoring**:
- score 3 — `NVIDIA|GeForce|RTX|GTX|Quadro|Radeon RX|Radeon Pro|Arc A[0-9]|Arc B[0-9]`
- score 0 — `Radeon.*Graphics|Vega|Intel.*Graphics|UHD|Iris|HD Graphics`
- score 1 — anything else

Filters out `PNPDeviceID -like 'ROOT\*'` and Microsoft/Basic/Virtual/Parsec/
Citrix/VNC/DisplayLink adapters, sorts by score then RAM, takes the top.

Note the escaping: in the JS source the pattern is written `'ROOT\\*'` so that
PowerShell receives a single backslash. This was wrong once and silently
disabled the filter.

### 9.4 Cache-clear cards locked after one click

Fixed by introducing the action-card concept (§5).

### 9.5 Ultimate Performance plan created but not activated

`powercfg -duplicatescheme` prints a new GUID; it must be captured and passed to
`powercfg -setactive`. Simply duplicating the scheme does nothing. The current
command parses the GUID with `for /f "tokens=4"`.

### 9.6 `autotuninglevel=experimental`

The legacy EXTREME PowerShell script used it. It can make throughput *worse* on
some networks. The app deliberately uses `normal`. Do not change this back.

---

### 9.7 `pol_bgapps` silently broke Snipping Tool

`LetAppsRunInBackground = 2` (Force Deny) blocks every UWP/Store app from
running in the background. That includes **Snipping Tool**, so `Win+Shift+S`
stopped working — and nothing in the app told the user it had caused it. The
card's description only mentioned missing notifications.

The card is now `risky:true` (out of bulk and Auto Tune), the name carries the
warning, and the description says exactly what breaks and how to undo it
(revert, then sign out and back in).

**The lesson generalises:** a tweak that quietly breaks an everyday Windows
feature is worse than one that does nothing, because the user will not connect
the breakage to this app. Before adding anything that touches `Policies\`,
disables a service, or sets a Force-Deny policy, ask what ordinary feature stops
working — and if the answer is "something people use weekly", mark it `risky`
and spell the consequence out in the card itself.

### 9.8 `PROCTHROTTLEMIN 100` pinned the CPU at 100% and cost frames

The Ultimate Performance card set both the minimum and maximum processor state
to 100. The maximum is correct — it allows full boost. **The minimum was wrong.**
Forcing the floor to 100% makes the CPU run at full clock permanently, so it
heats up with no idle time to recover, hits its thermal limit, and then throttles
*below* what it would have reached on its own. Task Manager sits at 100% and
frametimes get worse.

This hurts modern chips generally and **Ryzen X3D parts most of all**: the
stacked 3D V-Cache makes them harder to cool and AMD caps them around 89°C, so
they need thermal headroom to boost when a game actually asks for it.

`PROCTHROTTLEMIN` is now `5` everywhere. `PROCTHROTTLEMAX` stays `100`.
Two cards were added: `cpu_fixstuck` (repairs a machine already stuck at 100%,
repeatable) and `amd_x3d` (X3D-aware profile, self-checks for "X3D" in the CPU
name). `cpuProfile().x3d` drives an Auto Tune note pointing at the repair card.

**Rule going forward:** never set a power-plan *minimum* to 100. Raising ceilings
is safe; raising floors removes the headroom the hardware needs to boost.

 — do not attempt

- **NVIDIA / AMD driver 3D settings from registry** — see §2.1. The Guide page
  is the accepted solution.
- **Real in-game FPS measurement** — needs PresentMon bundled. Rejected: it
  bloats the download, trips antivirus, and makes the build fragile. The
  benchmark measures system state instead and says so.
- **GPU temperature on AMD cards** — `nvidia-smi` covers NVIDIA only. AMD would
  need LibreHardwareMonitor bundled; same objections. The UI shows `N/A` and
  explains why.
- **CPU temperature on some boards** — `MSAcpi_ThermalZoneTemperature` is not
  implemented by every vendor. `N/A` is correct behaviour, not a bug.
- **Overlay above exclusive-fullscreen games** — an Electron limitation.
  Borderless and windowed work. Documented in the UI.

---

### 9.9 Stale duplicated power plans kept the old value alive

Fixing `PROCTHROTTLEMIN` in the card source was not enough. The Ultimate
Performance card creates a **new plan** with `powercfg -duplicatescheme`, and
that plan stores its own copy of every processor setting. A machine that ran the
old version still had a duplicated plan carrying `PROCTHROTTLEMIN 100`, active
across reboots. `cpu_fixstuck` only touched `SCHEME_CURRENT`, so it appeared to
do nothing.

`ultimate` now deletes previously duplicated "Ultimate Performance" plans (never
the built-in GUID `e9a42b02-...`) before creating a fresh one, and its revert
deletes what it created. `cpu_fixstuck` enumerates every GUID from `powercfg /L`
and repairs all of them.

**Rule:** any card that creates a power plan must be able to find and remove its
own leftovers. Writing to `SCHEME_CURRENT` alone is not a reliable repair.

### 9.10 Standby purge silently failed, and the app claimed success

`ram_standby` called `NtSetSystemInformation` without first enabling
**SeProfileSingleProcessPrivilege**. Administrators hold that privilege but it is
*disabled* in the token by default, so the call returned
`STATUS_PRIVILEGE_NOT_HELD` and PowerShell emitted CLIXML on stderr — while the
card still logged a green check.

The encoded script now enables the privilege via `AdjustTokenPrivileges`,
flushes the modified list (3) before purging standby (4), checks the NTSTATUS,
measures free RAM before and after, and exits non-zero on failure.
`applyTweak()` treats a non-zero exit **or** output matching `ERR:` as failure
for every card.

**Rule:** a card that cannot be verified with `reg query` must report its own
success or failure in its output (`OK:` / `ERR:`) and set an exit code. Never
let a card print a green check just because the process launched.

### 9.11 `prio_updater_low` stopped Steam from launching

`steamservice.exe` was in the "updater" list and got `IoPriority = 0` (very low).
It is **not** an updater — it is the Steam Client Service that Steam needs in
order to start, so Steam hung and the boot entry stalled.

Worse, **reinstalling Steam did not help**: IFEO keys are matched on *file name*,
not on an install path, so the entry survived uninstall and applied to the fresh
copy.

Removed from the lists: `steamservice.exe`, `EABackgroundService.exe`,
`Agent.exe` (Battle.net Update Agent), and `Steam.exe` from `launcher_prio`.
Remaining `IoPriority` values were changed from `0` to `1`.

**Rules:**
- **An IFEO entry outlives the program.** Anything written there must be
  removable by the app itself, and users need a repair path that does not depend
  on the app still being installed.
- **Never touch a `*service*.exe` by name.** If a process is required for the
  app to start, deprioritising it is indistinguishable from breaking it.
- Only genuine background updaters belong in that list.

### 9.12 BBR2 hung Steam on Windows 11 24H2+ (Oct 2026)

Machine: Win11 IoT LTSC 25H2 build 26200, RTX 3060 Ti, reached through Parsec.
Auto Tune applied `net_bbr` (`congestionprovider=bbr2` on the `internet`
template). After the reboot Steam ran in Task Manager with **no window**.

What the evidence looked like, so the next case is recognised fast:
- `logs\console_log.txt` stops right after `Console Log Start` /
  `Failed to init SteamVR`. A healthy start continues with
  `roaming config loaded` and `System startup time`. **steam.exe itself hangs,
  the webhelper is only waiting.**
- `webhelper.txt` only ever reaches `SetName: SP Shared JS Context`.
- Turning the Steam UI GPU off, renaming `htmlcache`, closing Medal and starting
  FontCache all changed nothing — they are UI-side, the hang is not.
- `netsh int tcp set supplemental template=internet congestionprovider=ctcp`
  fixed it instantly, no reboot.

Cause: on 24H2+ BBR2 stalls same-host TCP (connect succeeds, no data flows).

Dead ends worth not repeating:
- Launching `steamwebhelper.exe` by hand returns `0xC06D007E` even on a healthy
  install (it needs the arguments and DLL search path steam.exe gives it). It is
  **not** evidence of missing VC++ files on its own.
- On the new client the Steam window belongs to `steamwebhelper.exe`, not
  `steam.exe`; `MainWindowHandle` of steam.exe is always 0.
- `SysWOW64\vcruntime140_1.dll` missing is normal — that DLL is x64-only.

Fix:
- `CARD_REQ.net_bbr = {maxBuild: 26100}` and `cardBlocked` honours `maxBuild`.
- The `net_bbr` script checks `CurrentBuild` itself (works even if the OS
  profile failed to load) and switches an existing BBR back to CTCP on 24H2+.
- `rep_steamfix` switches any template using BBR back to CTCP.
- Validator section 32.

**Rule:** when Steam runs with no window, read `console_log.txt` first and
compare where it stops against a healthy start. That one file separates
"client hung" from "UI failed to draw" and saves a day of guessing.

### 9.13 Auto Tune threw after every run

`autoTune()` called `needRestart(todo && …)`, but `todo` was a local of
`applyMany`. Every Auto Tune applied its cards and then threw
`ReferenceError: todo is not defined`: no reboot flag, no health check, and the
button stayed disabled on "อ่านสเปค + จูน…" until the app was restarted.
Found by running Auto Tune in a real browser, not by reading the code.

**Rule:** steps that must happen after a long operation go in `finally`.
Validator 39.

### 9.14 GPU detection was never run

`loadGpuCaps()` was defined, logged nicely, and **never called**. DLSS / Frame
Generation detection, the NVIDIA/AMD GPU cards in Auto Tune and the GPU rules in
`CARD_REQ` all silently did nothing. Validator 36 now fails for any
`async function loadX()` that is defined but never called.

 — do not attempt

- **NVIDIA / AMD driver 3D settings from registry** — see §2.1. Those values live
  in the driver's binary profile DB and are only writable through NVAPI/ADL. The
  GPU Guide page is the accepted solution.
- **Real in-game FPS measurement** — needs PresentMon bundled. Rejected: bloats
  the download, trips antivirus. The benchmark measures system state and says so.
- **GPU temperature on AMD cards** — `nvidia-smi` is NVIDIA-only.
- **CPU temperature on some boards** — `MSAcpi_ThermalZoneTemperature` is not
  implemented by every vendor. `N/A` is correct behaviour, not a bug.
- **Overlay above exclusive-fullscreen games** — an Electron limitation.
- **RAM frequency** — DDR4/DDR5 speed is set by XMP/EXPO in BIOS. Report and
  advise; never claim to change MHz, timings or voltage.
- **Pinning a game to a specific CCD** — handled by AMD's driver/BIOS, no
  verifiable registry key exists. `amd_x3d_ccd` reports only.
- **DLL injection (DLSS Enabler / OptiScaler)** — anti-cheat systems can treat it
  as cheating. Competing apps ship this; we do not.
- **Resizable BAR / DirectStorage / NVMe HMB toggles** — BIOS, per-game API and
  SSD firmware respectively. No registry key we can verify.

## 11. Test environments

| Machine | Notes |
|---|---|
| Ryzen 7 2700X + GTX 1650, 16 GB | No iGPU — single-GPU path |
| Ryzen 9 9800X3D + iGPU + discrete, 31 GB | Dual-GPU path, exposed §9.3 |
| Atlas OS (Win10) | Primary dev box. Debloated. |
| Revi OS (Win11) | Debloated. Exposed §9.2. Node.js MSI fails with error 2503 here — use portable Node or `winget`. |

Assume the user's Windows is **debloated**: services may be missing, animations
off, Microsoft Store absent, Windows Installer unreliable. Every command must
fail gracefully on a stripped install.

---

## 12. UI conventions — Cyber HUD 3D (Oct 2026)

The owner asked for something futuristic with real depth ("ให้สมชื่อ").
Previous looks (18 themes, then an instrument panel) are gone; do not bring
them back piecemeal.

**Look**
- Deep-space black (`--void #07060d`), glass plates (dark gradient + 1px
  `--line-2` border). **Laser red** (`--laser`) = live or actionable (primary
  button, tuned ring, active nav). **Electric purple** (`--volt`) = structure
  (borders, labels, grid). **Green** (`--surge`) only ever means applied.
  Amber = warning.
- Depth lives in three places only: the **perspective grid floor**
  (`.hud-floor`), the **reactor** (tilted rings + conic progress driven by
  `--tuned`), and **extruded numerals** (stacked `text-shadow` using
  `--ex1..--ex4`). Do not add a fourth.
- Buttons are angled plates (`clip-path`, `--cut`). Tweaks are rows with a
  diamond LED; a hovered row lifts in 3D.
- No emoji in navigation, headings or buttons.

**Motion budget — non-negotiable.** This is an FPS app. `html.idle` (window not
focused or hidden) pauses **every** animation; parallax only runs on the
dashboard and only while focused. `prefers-reduced-motion` stops the grid and
rings. Validator 30 fails if this goes away.

**Electron 22 compatibility** (BUILD_LEGACY, Win7/8): no `color-mix()`, no
`:has()` for layout, no container queries. Validator 30 checks `color-mix`.

**Type** — embedded base64, no network: Oxanium (headings, numbers), Rajdhani
(labels, buttons), IBM Plex Sans Thai (body, all Thai), IBM Plex Mono
(terminal).

**Variants** — `laser` (default), `ice`, `toxic`, stored in `gb_theme3`. A
variant may only change the accent family (`--laser*`, `--volt*`, `--ex*`,
`--glow`, `--vglow`, `--grid`, `--line*`). New CSS must use variables.

**Do not break**
- Validator 28: `.gauge-num` markup and `gaugeNote` after the TUNED label.
- `#gaugeFill` is a straight path of length 257.6 (= `CIRC`) — the energy bar.
- `updateGauge()` sets `--tuned`; the reactor ring reads it.
- Every id and class the JS reads.

**Words**
- Thai for everything user-facing. Descriptions explain *why*.
- Tag types: `fps` (green), `lat` (purple), `warn` (amber).
- The terminal dock logs every command. Keep it truthful.

### 12.1 Bugs found during the redesign
- `startup` and `powerplan` were in the sidebar but missing from `CATS`, so
  `nav()` threw on `CATS[page].t` and both pages opened blank. Validator 33.
- `sleep()` was called by the preview-mode stubs but never defined.

---

## 13. Working agreement

- Change one thing at a time, validate, then move on.
- Prefer refusing a feature over shipping one that appears to work but does not.
- When unsure whether a system command is real, say so plainly and ask —
  the human would rather answer a question than ship a placebo.
