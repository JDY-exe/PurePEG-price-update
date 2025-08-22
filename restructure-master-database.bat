@echo off
REM Run the update script from this folder (next to Excel)
set SCRIPT_DIR=%~dp0mono-item-catalog
set NODE_SCRIPT=%SCRIPT_DIR%\index.js

node "%NODE_SCRIPT%" "%CD%"
pause