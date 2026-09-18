# Creates the LocalPro OTP "Authentication" template via WhatsApp Cloud API.
# Run in PowerShell. Paste your token below, run, then CLEAR it again after.
#
#   $WABA_ID  = your WhatsApp Business Account ID
#   $TOKEN    = permanent access token with whatsapp_business_management
#
# Usage:  .\create-wa-template.ps1

$WABA_ID = "973871039073687"
$TOKEN   = "PASTE_YOUR_TOKEN_HERE"

$body = @{
  name       = "otp_verification"
  language   = "en_US"
  category   = "AUTHENTICATION"
  components = @(
    @{ type = "BODY";    add_security_recommendation = $true },
    @{ type = "FOOTER";  code_expiration_minutes = 5 },
    @{ type = "BUTTONS"; buttons = @( @{ type = "OTP"; otp_type = "COPY_CODE" } ) }
  )
} | ConvertTo-Json -Depth 8

Write-Host "Creating template on WABA $WABA_ID ..."
try {
  $resp = Invoke-RestMethod -Method Post `
    -Uri "https://graph.facebook.com/v21.0/$WABA_ID/message_templates" `
    -Headers @{ Authorization = "Bearer $TOKEN" } `
    -ContentType "application/json" `
    -Body $body
  Write-Host "SUCCESS:" ($resp | ConvertTo-Json -Depth 8)
  Write-Host "Template submitted. Check WhatsApp Manager -> status becomes APPROVED shortly."
} catch {
  Write-Host "=== FULL META ERROR (send this back) ==="
  $r = $_.Exception.Response
  if ($r -ne $null) {
    try {
      $sr = New-Object System.IO.StreamReader($r.GetResponseStream())
      $sr.BaseStream.Position = 0
      Write-Host $sr.ReadToEnd()
    } catch { Write-Host $_.Exception.Message }
  }
  if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message }
  Write-Host "=== END ERROR ==="
}
