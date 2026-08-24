@echo off
rem Backup diário da base de dados (mantém 14 dias).
rem Agenda no Task Scheduler: diário às 06:00, programa = este .bat
setlocal
cd /d "%~dp0.."
if not exist "deploy\backups" mkdir "deploy\backups"

rem data AAAA-MM-DD independente do formato regional
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set TODAY=%%i

copy /y "data\stats.db" "deploy\backups\stats-%TODAY%.db" >nul
if errorlevel 1 (
  echo [backup] FALHOU — o site esta a correr? O ficheiro data\stats.db existe?
  exit /b 1
)
echo [backup] OK: deploy\backups\stats-%TODAY%.db

rem apagar backups com mais de 14 dias
forfiles /p "deploy\backups" /m stats-*.db /d -14 /c "cmd /c del @path" 2>nul
endlocal
