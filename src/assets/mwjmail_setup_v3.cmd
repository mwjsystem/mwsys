@echo off
rem MWSystem mail setup: writes mwjmail.ps1 to %LOCALAPPDATA%\mwjsys and registers the mwjmail: link (current user only)
setlocal
set "MWJDIR=%LOCALAPPDATA%\mwjsys"
if not exist "%MWJDIR%" mkdir "%MWJDIR%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$c = [IO.File]::ReadAllText('%~f0', [Text.Encoding]::UTF8); $i = $c.LastIndexOf('#__PS1__'); [IO.File]::WriteAllText('%MWJDIR%\mwjmail.ps1', $c.Substring($i), (New-Object Text.UTF8Encoding $true))"
if errorlevel 1 goto err
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%MWJDIR%\mwjmail.ps1" -Install
exit /b 0
:err
echo Setup failed.
pause
exit /b 1
#__PS1__
# =====================================================================
# MWSystem: 請求書メールの作成（Thunderbird の作成画面を開く）
#   ブラウザから mwjmail:open?zip=mwjmail_YYYYMMDDHHMMSS.zip で呼ばれる。
#   ダウンロードフォルダの ZIP（請求書 PDF と mwjmail.json）を「ドキュメント\MWSystem請求書」に展開し、
#   mwjmail.json の 1 件ごとに、宛先・差出人・件名・本文・添付を入れた Thunderbird の作成画面を開く。
#   展開したフォルダには請求書 PDF だけを控えとして残す（ZIP と mwjmail.json は削除する）。
#   送信は開いた画面で担当者が行う。
#   -Install で、mwjmail: のリンクをこのスクリプトに結び付ける（HKEY_CURRENT_USER。管理者権限は不要）。
# =====================================================================
param([string]$Url = '', [switch]$Install)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem
$ErrorActionPreference = 'Stop'
$Title = 'MWSystem メール作成'
# 版。変更したら assets/mwjmail_setup の版（ファイル名・navbar のリンク）もそろえる
$Version = '3'

# 処理中の表示（最前面の小さな画面）。処理が終わるまで出しておく
$script:progress = $null
$script:progressLabel = $null
function Show-Progress([string]$text) {
  if (-not $script:progress) {
    $f = New-Object System.Windows.Forms.Form
    $f.Text = $Title
    $f.TopMost = $true
    $f.StartPosition = 'CenterScreen'
    $f.FormBorderStyle = 'FixedDialog'
    $f.ControlBox = $false
    $f.ShowInTaskbar = $true
    $f.ClientSize = New-Object System.Drawing.Size(460, 100)
    $l = New-Object System.Windows.Forms.Label
    $l.Dock = 'Fill'
    $l.TextAlign = 'MiddleCenter'
    $l.Font = New-Object System.Drawing.Font('Meiryo UI', 11)
    $f.Controls.Add($l)
    $f.Show()
    $f.Activate()
    $script:progress = $f
    $script:progressLabel = $l
  }
  $script:progressLabel.Text = $text
  [System.Windows.Forms.Application]::DoEvents()
}
function Close-Progress {
  if ($script:progress) {
    $script:progress.Close()
    $script:progress.Dispose()
    $script:progress = $null
  }
}
# 待つ間も処理中の画面が「応答なし」にならないようにする
function Wait-Ms([int]$ms) {
  $end = (Get-Date).AddMilliseconds($ms)
  while ((Get-Date) -lt $end) {
    [System.Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 100
  }
}

function Show-Msg([string]$text, [string]$icon = 'Information') {
  Close-Progress  # メッセージが処理中の画面の裏に隠れないように先に閉じる
  [System.Windows.Forms.MessageBox]::Show($text, $Title, 'OK', $icon) | Out-Null
}

function Find-Thunderbird {
  $cands = @()
  try {
    $p = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\thunderbird.exe' -ErrorAction Stop).'(default)'
    if ($p) { $cands += $p.Trim('"') }
  } catch {}
  $cands += "$env:ProgramFiles\Mozilla Thunderbird\thunderbird.exe"
  $cands += "${env:ProgramFiles(x86)}\Mozilla Thunderbird\thunderbird.exe"
  $cands += "$env:LOCALAPPDATA\Mozilla Thunderbird\thunderbird.exe"
  foreach ($c in $cands) {
    if ($c -and (Test-Path -LiteralPath $c)) { return $c }
  }
  return $null
}

# Thunderbird の -compose の値に使えない文字を置き換える
function Clean([string]$s) {
  if ($null -eq $s) { return '' }
  # 半角の ' と " を全角（U+2019 / U+201D）にする。PowerShell は全角の引用符も文字列の区切りとみなすので文字コードで書く
  return $s.Replace([string][char]0x27, [string][char]0x2019).Replace([string][char]0x22, [string][char]0x201D)
}

try {
  if ($Install) {
    $key = 'HKCU:\Software\Classes\mwjmail'
    New-Item -Path $key -Force | Out-Null
    New-Item -Path "$key\shell" -Force | Out-Null
    New-Item -Path "$key\shell\open" -Force | Out-Null
    New-Item -Path "$key\shell\open\command" -Force | Out-Null
    Set-ItemProperty -Path $key -Name '(default)' -Value 'URL:MWSystem mail Protocol'
    Set-ItemProperty -Path $key -Name 'URL Protocol' -Value ''
    $cmd = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $PSCommandPath + '" "%1"'
    Set-ItemProperty -Path "$key\shell\open\command" -Name '(default)' -Value $cmd
    $tb = Find-Thunderbird
    if ($tb) {
      Show-Msg ("メール作成の設定が完了しました（版 " + $Version + "）。`n`nThunderbird: " + $tb)
    } else {
      Show-Msg ("メール作成の設定は完了しました（版 " + $Version + "）が、Thunderbird が見つかりませんでした。`nThunderbird をインストールしてから使ってください。") 'Warning'
    }
    exit 0
  }

  # mwjmail:open?zip=... を読む
  $params = @{}
  $qs = ($Url -replace '^mwjmail:/*', '').Split('?', 2)
  if ($qs.Count -gt 1) {
    foreach ($kv in $qs[1].Split('&')) {
      $p = $kv.Split('=', 2)
      if ($p.Count -eq 2) { $params[[uri]::UnescapeDataString($p[0])] = [uri]::UnescapeDataString($p[1]) }
    }
  }
  $zipName = $params['zip']
  if (-not $zipName -or $zipName -notmatch '^mwjmail_[0-9]{14}\.zip$') {
    Show-Msg ("呼び出しの内容が正しくありません。`n" + $Url) 'Error'
    exit 1
  }

  # ダウンロードの完了を待つ（最大 60 秒）
  Show-Progress '請求書のダウンロードを待っています…'
  $dl = (New-Object -ComObject Shell.Application).Namespace('shell:Downloads').Self.Path
  $zip = Join-Path $dl $zipName
  $deadline = (Get-Date).AddSeconds(60)
  while (-not (Test-Path -LiteralPath $zip) -and (Get-Date) -lt $deadline) { Wait-Ms 500 }
  if (-not (Test-Path -LiteralPath $zip)) {
    Show-Msg ("ダウンロードフォルダに " + $zipName + " が見つかりません。`n`nダウンロードフォルダ: " + $dl + "`n`nブラウザの設定で、ダウンロードの保存先を毎回確認する設定になっていないか確認してください。") 'Error'
    exit 1
  }
  Wait-Ms 800
  Show-Progress '請求書を展開しています…'

  # ドキュメント\MWSystem請求書\mwjmail_YYYYMMDDHHMMSS に展開する（PDF は控えとして残る）
  $out = Join-Path ([Environment]::GetFolderPath('MyDocuments')) ('MWSystem請求書\' + [IO.Path]::GetFileNameWithoutExtension($zipName))
  if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Recurse -Force }
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $out)
  Remove-Item -LiteralPath $zip

  # 送信内容（mwjmail.json）は読み込んだら削除する（控えのフォルダには請求書 PDF だけを残す）
  $json = Join-Path $out 'mwjmail.json'
  $manifest = Get-Content -LiteralPath $json -Raw -Encoding UTF8 | ConvertFrom-Json
  Remove-Item -LiteralPath $json
  $tb = Find-Thunderbird
  if (-not $tb) {
    Show-Msg ("Thunderbird が見つかりません。`n請求書は次のフォルダに保存しました。`n" + $out) 'Error'
    exit 1
  }

  $ng = @()
  $cnt = 0
  $total = @($manifest.mails).Count
  foreach ($m in $manifest.mails) {
    Show-Progress ('Thunderbird でメールを作成しています（' + ($cnt + $ng.Count + 1) + ' / ' + $total + ' 件）…' + "`n" + 'この画面が閉じるまでお待ちください')
    $file = Join-Path $out $m.file
    # 添付の取り違え防止: ファイルが存在し、ファイル名が請求伝票番号で始まること
    if (-not (Test-Path -LiteralPath $file) -or -not ([string]$m.file).StartsWith([string]$m.denno)) {
      $ng += [string]$m.file
      continue
    }
    $parts = @("to='" + (Clean $m.to) + "'")
    if ($m.from) { $parts += "from='" + (Clean $m.from) + "'" }
    $parts += "subject='" + (Clean $m.subject) + "'"
    $parts += "body='" + (Clean $m.body) + "'"
    $parts += "attachment='" + $file + "'"
    Start-Process -FilePath $tb -ArgumentList ('-compose "' + ($parts -join ',') + '"')
    $cnt++
    Wait-Ms 1500
  }
  # 最後の作成画面が開くまで少し待ってから、処理中の表示を閉じる
  Wait-Ms 2000
  Close-Progress
  if ($ng.Count -gt 0) {
    Show-Msg ("次の請求書は添付ファイルを確認できなかったため、メールを作成しませんでした。`n`n" + ($ng -join "`n") + "`n`n保存先: " + $out) 'Warning'
  }
} catch {
  Show-Msg ("メールの作成でエラーが発生しました。`n`n" + $_.Exception.Message) 'Error'
  exit 1
}
