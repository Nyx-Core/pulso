@echo off
rem PULSO — Inicialização do pacote portátil (Windows).
rem Uso:  iniciar\iniciar-windows.bat [argumentos do PULSO]
rem O script sobe para a raiz do pacote e executa Windows\PULSO.exe.

cd /d "%~dp0.."

if exist "Windows\PULSO.exe" (
  "Windows\PULSO.exe" %*
) else (
  echo PULSO: o executável Windows\PULSO.exe não foi encontrado no pacote. >&2
  exit /b 1
)
