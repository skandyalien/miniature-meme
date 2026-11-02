@echo off
cd /d "%~dp0"
py -m pip install -r requirements.txt
if errorlevel 1 goto :fail
py -m uvicorn server:app --host 127.0.0.1 --port 8000
if errorlevel 1 goto :fail
goto :end
:fail
echo Setup or launch failed. Check Python and your network connection.
pause
:end
