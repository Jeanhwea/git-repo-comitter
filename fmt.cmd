:; set -eu #
:; cd "$(dirname "$0")" #
:; exec pnpm run fmt -- "$@" #@//echo/ off
@echo off
cd /d "%~dp0"
pnpm run fmt %*
exit /b %ERRORLEVEL%
