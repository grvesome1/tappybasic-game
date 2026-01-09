@echo off
REM built by gruesøme
REM SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f2999e2373f
cd /d "%~dp0"
py run.py || python run.py || python3 run.py
pause
