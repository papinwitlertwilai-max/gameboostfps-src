@echo off
setlocal
title Bare Minimum - Build on YOUR machine, send the result
cd /d "%~dp0"
echo.
echo  ============================================
echo   Bare Minimum : BUILD
echo   Run this on YOUR PC, not the customer's.
echo   Electron 31.0.0
echo  ============================================
echo.

node -v >nul 2>&1
if errorlevel 1 goto nonode
for /f "tokens=*" %%v in ('node -v') do echo  [OK] Node.js %%v

call npm -v >nul 2>&1
if errorlevel 1 goto nonpm
for /f "tokens=*" %%v in ('call npm -v') do echo  [OK] npm %%v
echo.

set "APPDIR=%~dp0BareMinimum_Build"
set "SEND=%~dp0BareMinimum_SEND"
if exist "%APPDIR%" rmdir /s /q "%APPDIR%"
mkdir "%APPDIR%"
mkdir "%APPDIR%\src"

copy /y "%~dp0main.js" "%APPDIR%\" >nul
if errorlevel 1 goto copyfail
copy /y "%~dp0icon.ico" "%APPDIR%\" >nul
if errorlevel 1 goto copyfail
copy /y "%~dp0src\preload.js" "%APPDIR%\src\" >nul
if errorlevel 1 goto copyfail
copy /y "%~dp0src\index.html" "%APPDIR%\src\" >nul
if errorlevel 1 goto copyfail
copy /y "%~dp0src\cards.js" "%APPDIR%\src\" >nul
if errorlevel 1 goto copyfail
copy /y "%~dp0src\splash.html" "%APPDIR%\src\" >nul
if errorlevel 1 goto copyfail
echo  [OK] files copied
echo.

if exist "%APPDIR%\package.json" del "%APPDIR%\package.json"
echo { >> "%APPDIR%\package.json"
echo   "name": "gameboostfps", >> "%APPDIR%\package.json"
echo   "version": "1.0.0", >> "%APPDIR%\package.json"
echo   "description": "Bare Minimum - gaming tuner by chubby", >> "%APPDIR%\package.json"
echo   "main": "main.js", >> "%APPDIR%\package.json"
echo   "author": "Ty.ppw", >> "%APPDIR%\package.json"
echo   "license": "UNLICENSED", >> "%APPDIR%\package.json"
echo   "scripts": { "dist": "electron-builder --win portable" }, >> "%APPDIR%\package.json"
echo   "devDependencies": { "electron": "^44.4.3", "electron-builder": "^26.15.3" }, >> "%APPDIR%\package.json"
echo   "build": { >> "%APPDIR%\package.json"
echo     "appId": "com.typpw.gameboostfps", >> "%APPDIR%\package.json"
echo     "productName": "Bare Minimum", >> "%APPDIR%\package.json"
echo     "files": ["main.js", "src/**/*", "icon.ico"], >> "%APPDIR%\package.json"
echo     "win": { "target": "portable", "icon": "icon.ico", "requestedExecutionLevel": "requireAdministrator" }, >> "%APPDIR%\package.json"
echo     "portable": { "artifactName": "BareMinimum.exe" }, >> "%APPDIR%\package.json"
echo     "directories": { "output": "dist" } >> "%APPDIR%\package.json"
echo   } >> "%APPDIR%\package.json"
echo } >> "%APPDIR%\package.json"
echo  [OK] package.json
echo.

cd /d "%APPDIR%"
echo  [..] npm install - first time downloads Electron, a few minutes
call npm install --no-audit --no-fund
if errorlevel 1 goto npmfail

echo.
rem ---- code signing: drop cert.pfx next to BUILD.bat and set the password below ----
set "CERT=%~dp0cert.pfx"
set "CERT_PASS="
if exist "%CERT%" set "CSC_LINK=%CERT%"
if exist "%CERT%" set "CSC_KEY_PASSWORD=%CERT_PASS%"
if exist "%CERT%" echo  [OK] cert.pfx found - exe will be signed
if not exist "%CERT%" echo  [i] no cert.pfx - exe will be unsigned, SmartScreen will warn
echo.
echo  [..] building .exe
call npm run dist
if errorlevel 1 goto buildfail

if not exist "%APPDIR%\dist\BareMinimum.exe" goto noexe

rem ---- package for sending: exe + how-to, nothing else ----
if exist "%SEND%" rmdir /s /q "%SEND%"
mkdir "%SEND%"
copy /y "%APPDIR%\dist\BareMinimum.exe" "%SEND%\" >nul
if exist "%SEND%\HOW_TO_RUN.txt" del "%SEND%\HOW_TO_RUN.txt"
echo Bare Minimum >> "%SEND%\HOW_TO_RUN.txt"
echo ======================================== >> "%SEND%\HOW_TO_RUN.txt"
echo . >> "%SEND%\HOW_TO_RUN.txt"
echo 1. Right-click BareMinimum.exe  ->  Run as administrator >> "%SEND%\HOW_TO_RUN.txt"
echo 2. Enter the license key you received >> "%SEND%\HOW_TO_RUN.txt"
echo 3. Press 1-Click or Auto Tune >> "%SEND%\HOW_TO_RUN.txt"
echo 4. Restart the PC when the app asks >> "%SEND%\HOW_TO_RUN.txt"
echo . >> "%SEND%\HOW_TO_RUN.txt"
echo No installation. No Node.js. Just run the exe. >> "%SEND%\HOW_TO_RUN.txt"
echo . >> "%SEND%\HOW_TO_RUN.txt"
echo --- If Windows shows "Windows protected your PC" --- >> "%SEND%\HOW_TO_RUN.txt"
echo . >> "%SEND%\HOW_TO_RUN.txt"
echo   This appears for every program without a paid signing certificate. >> "%SEND%\HOW_TO_RUN.txt"
echo   Click  More info  then  Run anyway >> "%SEND%\HOW_TO_RUN.txt"
echo . >> "%SEND%\HOW_TO_RUN.txt"
echo --- If it is BLOCKED with no Run anyway button --- >> "%SEND%\HOW_TO_RUN.txt"
echo . >> "%SEND%\HOW_TO_RUN.txt"
echo   Smart App Control is on (Windows 11 24H2+ default). >> "%SEND%\HOW_TO_RUN.txt"
echo   Settings -> Privacy and security -> Windows Security >> "%SEND%\HOW_TO_RUN.txt"
echo           -> App and browser control -> Smart App Control -> Off >> "%SEND%\HOW_TO_RUN.txt"
echo   Note: once turned off it cannot be turned on again >> "%SEND%\HOW_TO_RUN.txt"
echo         without reinstalling Windows. >> "%SEND%\HOW_TO_RUN.txt"
echo . >> "%SEND%\HOW_TO_RUN.txt"
echo . >> "%SEND%\HOW_TO_RUN.txt"

for %%A in ("%SEND%\BareMinimum.exe") do set "SZ=%%~zA"
set /a SZMB=%SZ% / 1048576

echo.
echo  ============================================
echo   DONE  -  send this folder to the customer:
echo   %SEND%
echo.
echo   BareMinimum.exe  (%SZMB% MB)
echo   HOW_TO_RUN.txt
echo.
if exist "%CERT%" echo   Signed with cert.pfx - SmartScreen should not warn.
if not exist "%CERT%" echo   UNSIGNED - customer will see a SmartScreen warning.
if not exist "%CERT%" echo   See HOW_TO_RUN.txt, or add cert.pfx to sign.
echo   The customer needs nothing installed.
echo  ============================================
echo.
explorer "%SEND%"
pause
exit /b 0

:nonode
echo  [X] Node.js not found  (command: node)
echo.
echo      This script runs on YOUR machine, which needs Node.js LTS:
echo      https://nodejs.org
echo      After installing, CLOSE this window and run BUILD.bat again.
echo.
pause
exit /b 1

:nonpm
echo  [X] npm not found  (command: npm)
echo      Node.js exists but npm is missing - reinstall Node.js LTS
echo.
pause
exit /b 1

:copyfail
echo.
echo  [X] copy failed - a source file is missing
echo      Extract the WHOLE zip. Do not move BUILD.bat alone.
echo.
pause
exit /b 1

:npmfail
echo.
echo  [X] npm install failed
echo.
echo      npm could not download Electron (31.0.0).
echo      Check on THIS machine:
echo        - internet reaches github.com and registry.npmjs.org
echo        - antivirus did not quarantine node_modules
echo        - npm config get proxy   should print: null
echo.
echo      Try:  npm cache clean --force   then run BUILD.bat again
echo.
pause
exit /b 1

:buildfail
echo.
echo  [X] build failed - read the lines above for the reason
echo.
pause
exit /b 1

:noexe
echo.
echo  [X] build reported success but BareMinimum.exe was not produced
echo      Look in %APPDIR%\dist
echo.
pause
exit /b 1
