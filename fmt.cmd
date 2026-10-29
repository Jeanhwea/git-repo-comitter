:; set -eu #
:; cd "$(dirname "$0")" #
:; exec node "$(dirname "$0")/scripts/fmt.mjs" -- "$@" #@//echo/ off
rem Format launcher -- one file for Windows, macOS and Linux.
rem
rem Thin wrapper: runs scripts/fmt.mjs, which holds the real cross-platform
rem logic. This file exists so there is something to double-click on Windows
rem and one entry point to name; the implementation lives in the .mjs.
rem
rem How the same file works on Unix: CMD treats every line starting with `:`
rem as a label and skips it, while sh reads `:;` as "no-op; " and runs the rest,
rem so the first lines are Unix-only, and `exec` ends the script before the
rem Windows part is ever reached.
rem
rem NOTE: ASCII-only. CMD decodes this with the console OEM codepage. Store CRLF.
cd /d "%~dp0"
node "scripts\fmt.mjs"
exit /b %ERRORLEVEL%
