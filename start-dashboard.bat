@echo off
cd /d "%~dp0"
echo Bank Command Center: http://localhost:5187
start "" http://localhost:5187
python serve.py
