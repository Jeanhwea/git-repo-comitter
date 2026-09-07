@echo off
setlocal enabledelayedexpansion

REM Build
echo [INFO] Building...
call pnpm build
if %errorlevel% neq 0 exit /b %errorlevel%

REM Pack
echo [INFO] Packing...
for /f "tokens=*" %%i in ('npm pack 2^>nul ^| findstr /v "npm"') do set TGZ=%%i

REM Install globally from the tarball (instead of symlink via npm i -g .)
echo [INFO] Installing !TGZ! globally...
call npm i -g "./!TGZ!"
if %errorlevel% neq 0 exit /b %errorlevel%

REM Cleanup tarball
if exist "!TGZ!" del /f "!TGZ!"

echo [OK] grc installed. Run: grc --help

endlocal
