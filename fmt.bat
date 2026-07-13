@echo off
setlocal enabledelayedexpansion

:: Check pnpm
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] pnpm not found. Install it first: npm install -g pnpm
    exit /b 1
)

:: Check node_modules
if not exist "node_modules\" (
    echo [WARN] node_modules not found. Running pnpm install...
    call pnpm install
    if !errorlevel! neq 0 (
        echo [ERROR] pnpm install failed
        exit /b 1
    )
)

:: Run formatter
echo [INFO] Running prettier ...
call pnpm format
if %errorlevel% neq 0 (
    echo [ERROR] Formatting failed
    exit /b 1
)

echo [OK] Formatting complete
exit /b 0
