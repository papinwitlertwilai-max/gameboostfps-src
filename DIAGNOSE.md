# DIAGNOSE.md — symptom first, guess never

Read this before suggesting any fix for a customer machine. Every row comes from
a real case where guessing cost hours. **Step 0 is always the same: ask the
customer to press "ส่งข้อมูลให้แอดมิน" and send the zip.** It contains every file
named below.

| Symptom (what the customer says) | Look at first | What it tells you | Known cause → fix |
|---|---|---|---|
| Steam runs in Task Manager, no window | `steam/console_log.txt` | Stops after `Console Log Start` = steam.exe hung (network/client). Reaches `System startup time` = UI-side problem. | BBR2 on 24H2+ → CTCP (§9.12). Run `rep_steamfix`. |
| Steam no window, console_log looks healthy | `steam/webhelper.txt`, `steam/cef_log.txt` | Only `SP Shared JS Context` = UI never asked for a window | htmlcache, GPU process (`--use-gl=disabled` in log), HAGS changed but the machine was not rebooted (reboot bar) |
| Steam won't start after reinstall | `ifeo.txt` | IFEO entries survive uninstall (matched by file name) | §9.11 — delete the entry, `rep_steamfix` does it |
| Program exits instantly, exit `0xC06D007E` / `0xC0000135` | `runtimes.txt` | Missing VC++ DLL (debloated OS) | Reinstall VC++ 2015-2022 x64 + x86. **Not** valid evidence when launching steamwebhelper by hand (§9.12) |
| Some keys don't register while gaming | card list in `app_state.json` | Input queue below 100 | raise both queues back to 100 (validator 31) |
| Win+Shift+S / Store apps broken | `app_state.json` → applied | `pol_bgapps` (Force Deny) | §9.7, revert + sign out |
| CPU stuck at 100%, frames worse | `system.txt` → Power line; powercfg | `PROCTHROTTLEMIN 100` on an old duplicated plan | `cpu_fixstuck` (§9.8, §9.9) |
| "Tweak did nothing" | `system.txt` → VBS/HVCI, SAC | VBS swallows kernel tweaks; Smart App Control blocks scripts | Tell the customer; never claim success |
| Everything reverted itself after a few days | `events.txt`, `app_state.json` → last tune | A cumulative update restored defaults | Drift bar re-applies (§4.35) |
| FPS low but tweaks all applied | `system.txt` → RAM lines, `processes.txt` | RAM at JEDEC (XMP off), single channel, emulator/wallpaper running | Pre-game check on the dashboard says exactly which |
| App window never appears | — | Splash/reveal chain | Keep all four reveal layers (§9.1) |
| Auto Tune button stuck "กำลังจูน" | app log | Exception after apply | Fixed in v3 (§9.13); post-apply steps live in `finally` |
| A card harms many customers at once | — | — | Blocklist it remotely (§4.37) — no rebuild needed |

## Rules that came out of these cases

1. **Logs before theories.** Ask for the file that records where the thing
   stopped. Steam writes it, Windows writes it, the app writes it.
2. **Compare against a healthy run.** The same log from a working start shows
   the line where the broken one diverges.
3. **One change per test.** The Steam case was solved by a script that tried
   one fix at a time and stopped at the first that worked.
4. **A test you ran by hand is not evidence until you know what a healthy
   machine returns for the same test.** (`0xC06D007E` from a manual
   steamwebhelper launch looked like proof and was not.)
5. **When it is fixed, add a validator rule and a row here.**
