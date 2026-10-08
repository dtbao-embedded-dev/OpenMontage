@echo off
rem Open a new PowerShell window in this repo, activate the Python venv, then start Claude Code.
setlocal
set "ROOT=%~dp0"

if not exist "%ROOT%.venv\Scripts\Activate.ps1" (
    echo [error] Python venv not found: %ROOT%.venv
    pause
    exit /b 1
)

rem Prefer PowerShell 7, fall back to Windows PowerShell 5.1.
set "PS=pwsh"
where pwsh >nul 2>&1 || set "PS=powershell"

start "OpenMontage - Claude" %PS% -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%ROOT%'; . .\.venv\Scripts\Activate.ps1; python --version; claude --dangerously-skip-permissions"
endlocal
