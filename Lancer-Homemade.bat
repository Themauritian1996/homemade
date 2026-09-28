@echo off
REM Double-clic : lance l'app Homemade pour la tester sur ton telephone Android avec Expo Go.
title Homemade - serveur de developpement
cd /d "%~dp0"
echo.
echo  ===============================================
echo   HOMEMADE - test sur telephone
echo  ===============================================
echo.

REM 1. IA locale : demarre Ollama s'il ne tourne pas deja.
tasklist /FI "IMAGENAME eq ollama.exe" | find /I "ollama.exe" >nul
if errorlevel 1 (
  echo  [1/3] Demarrage de l'IA locale ^(Ollama^)...
  if exist "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe" (
    start "" "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe"
  ) else (
    start "" "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve
  )
  timeout /t 6 /nobreak >nul
) else (
  echo  [1/3] IA locale ^(Ollama^) deja lancee.
)

REM 2. Precharge le modele d'analyse de photos sur la carte graphique (RTX) pour 1 heure.
echo  [2/3] Chargement du modele d'IA sur la carte graphique...
set "MODEL=qwen3-vl:2b-instruct"
for /f "tokens=1,* delims==" %%a in ('findstr /B "EXPO_PUBLIC_LOCAL_AI_MODEL=" .env 2^>nul') do set "MODEL=%%b"
powershell -NoProfile -Command "try { Invoke-RestMethod -Method Post -Uri http://127.0.0.1:11434/api/generate -Body (@{model=$env:MODEL; keep_alive='60m'} | ConvertTo-Json) -TimeoutSec 180 | Out-Null; Write-Host '        OK :' $env:MODEL } catch { Write-Host '        Attention : IA locale indisponible. L''app proposera la saisie manuelle.' }"

REM 3. Dependances (premiere fois seulement) puis serveur Expo.
if not exist node_modules (
  echo  [3/3] Installation des dependances ^(premiere fois seulement, quelques minutes^)...
  call npm install
) else (
  echo  [3/3] Demarrage du serveur de l'app...
)
echo.
echo   - Telephone et PC sur le MEME Wi-Fi.
echo   - Ouvre Expo Go sur ton telephone et scanne le QR code ci-dessous.
echo   - Si Windows demande l'acces reseau pour Node.js : clique "Autoriser".
echo   - Pour arreter : ferme cette fenetre.
echo.
call npx expo start
pause
