# Connecte la CLI Supabase avec un jeton d'accès personnel, sans l'afficher ni l'enregistrer dans le projet.
# Jeton : https://supabase.com/dashboard/account/tokens
$Host.UI.RawUI.WindowTitle = 'Connexion Supabase - Homemade'
Set-Location (Split-Path $PSScriptRoot -Parent)
Write-Host ''
Write-Host '=== Connexion Supabase pour Homemade ===' -ForegroundColor Green
Write-Host 'Colle ton jeton (clic droit dans cette fenetre), puis appuie sur Entree.'
Write-Host '(Rien ne s affiche pendant que tu colles : c est normal.)'
$secure = Read-Host 'Jeton' -AsSecureString
$token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
npx supabase login --token $token --name homemade-cli
$token = $null
if ($LASTEXITCODE -eq 0) {
  Write-Host ''
  Write-Host 'Connecte ! Tu peux fermer cette fenetre et revenir dans Claude.' -ForegroundColor Green
} else {
  Write-Host ''
  Write-Host 'La connexion a echoue : verifie le jeton et relance.' -ForegroundColor Red
}
Read-Host 'Appuie sur Entree pour fermer'
