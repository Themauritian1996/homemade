@echo off
REM Double-clic : lance l'app Homemade pour la tester sur ton telephone avec Expo Go.
title Homemade - serveur de developpement
cd /d "%~dp0"
echo.
echo  === Homemade ===
echo  1. Telephone et PC sur le MEME Wi-Fi.
echo  2. Ouvre l'app Expo Go sur ton telephone et scanne le QR code ci-dessous.
echo  3. Si Windows demande l'acces reseau pour Node.js : clique "Autoriser".
echo  Pour arreter : ferme cette fenetre.
echo.
if not exist node_modules (
  echo Installation des dependances (premiere fois seulement, quelques minutes)...
  call npm install
)
call npx expo start
pause
