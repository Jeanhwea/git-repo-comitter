:; set -eu #
:; cd "$(dirname "$0")" #
:; exec pnpm run ins -- "$@" #@//echo/ off
@echo off
cd /d "%~dp0"
pnpm run ins %*
exit /b %ERRORLEVEL%
