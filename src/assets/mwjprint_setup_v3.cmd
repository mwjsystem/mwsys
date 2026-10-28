@echo off
rem MWSystem shipping print setup: writes mwjprint.ps1 to %LOCALAPPDATA%\mwjsys and registers the mwjprint: link (current user only)
setlocal
set "MWJDIR=%LOCALAPPDATA%\mwjsys"
if not exist "%MWJDIR%" mkdir "%MWJDIR%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$c = [IO.File]::ReadAllText('%~f0', [Text.Encoding]::UTF8); $i = $c.LastIndexOf('#__PS1__'); [IO.File]::WriteAllText('%MWJDIR%\mwjprint.ps1', $c.Substring($i), (New-Object Text.UTF8Encoding $true))"
if errorlevel 1 goto err
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%MWJDIR%\mwjprint.ps1" -Install
exit /b 0
:err
echo Setup failed.
pause
exit /b 1
#__PS1__
# =====================================================================
# MWSystem: 出荷指示の印刷（朝来倉庫。現行の「【朝来倉庫使用】一括印刷.xlsm」の置き換え）
#   ブラウザの「出荷指示 印刷」画面から mwjprint:print?job=... で呼ばれる。
#   job は {"root": 保存先のフォルダ名, "print": [フォルダ, ...], "old": [フォルダ, ...]}（UTF-8 の JSON を base64url にしたもの。
#   フォルダは NAS の保存先からの相対パス。root が設定の保存先のフォルダ名と違うときは印刷しない）。print のフォルダごとに
#     ・PDF を Acrobat で印刷（ファイル名の拡張子が .Pdf のものはカラー、それ以外はモノクロのプリンタ）
#     ・*pccs.csv を佐川の取り込みフォルダ、*is2.csv を福通の取り込みフォルダへコピー
#     ・Manu.txt（マニュアル名,部数）のマニュアルを両面で印刷
#     ・*.lhd（Amazon のラベル）をラベルのフォルダへコピーして開く
#     ・Excel のファイルを印刷
#     ・Windows の印刷の待ち行列を見て、印刷がエラーなく複合機へ送られたことを確かめる
#     ・確かめられたら、処理ログに記録し、フォルダ名に「【済」を付ける（同名があれば「時分秒_差替【済」）
#       （画面は「【済」の付いたフォルダを見て、受注ステータスを出荷指示出力済にする。
#         エラー・時間切れのときは「【済」を付けず、最後にまとめて知らせる）
#   old のフォルダ（同じ伝票の古いフォルダ）には「【自動済」を付ける。
#   設定（NAS の場所・プリンタ・各フォルダ）は %LOCALAPPDATA%\mwjsys\mwjprint.json。-Install で無ければ作る。
#   -Install で、mwjprint: のリンクをこのスクリプトに結び付ける（HKEY_CURRENT_USER。管理者権限は不要）。
# =====================================================================
param([string]$Url = '', [switch]$Install)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$Title = 'MWSystem 出荷指示の印刷'
# 版。変更したら assets/mwjprint_setup の版（ファイル名・navbar のリンク）もそろえる
$Version = '3'
$ConfigPath = Join-Path $env:LOCALAPPDATA 'mwjsys\mwjprint.json'

# 処理中の表示（最前面の小さな画面）
$script:progress = $null
$script:progressLabel = $null
$script:cancel = $false
function Show-Progress([string]$text) {
  if (-not $script:progress) {
    $f = New-Object System.Windows.Forms.Form
    $f.Text = $Title
    $f.TopMost = $true
    $f.StartPosition = 'CenterScreen'
    $f.FormBorderStyle = 'FixedDialog'
    $f.ControlBox = $false
    $f.ShowInTaskbar = $true
    $f.ClientSize = New-Object System.Drawing.Size(480, 140)
    $l = New-Object System.Windows.Forms.Label
    $l.Location = New-Object System.Drawing.Point(10, 10)
    $l.Size = New-Object System.Drawing.Size(460, 80)
    $l.TextAlign = 'MiddleCenter'
    $l.Font = New-Object System.Drawing.Font('Meiryo UI', 11)
    $f.Controls.Add($l)
    $b = New-Object System.Windows.Forms.Button
    $b.Text = '中断'
    $b.Location = New-Object System.Drawing.Point(190, 98)
    $b.Size = New-Object System.Drawing.Size(100, 30)
    $b.Add_Click({ $script:cancel = $true })
    $f.Controls.Add($b)
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
function Wait-Ms([int]$ms) {
  $end = (Get-Date).AddMilliseconds($ms)
  while ((Get-Date) -lt $end -and -not $script:cancel) {
    [System.Windows.Forms.Application]::DoEvents()
    Poll-Queue
    Start-Sleep -Milliseconds 100
  }
}
function Show-Msg([string]$text, [string]$icon = 'Information') {
  Close-Progress
  [System.Windows.Forms.MessageBox]::Show($text, $Title, 'OK', $icon) | Out-Null
}

# 設定（無ければ現行マクロ mst シートの値で作る）
function Get-Config {
  if (-not (Test-Path -LiteralPath $ConfigPath)) {
    $default = [ordered]@{
      root               = '\\192.168.30.133\share\asago出荷'
      printerMono        = 'RICOH IM C6010 JPN RPCS'
      printerColor       = '[カラー]RICOH IM C6010 JPN RPCS'
      printerDuplex      = '[モノ]RICOH IM C6010 JPN RPCS'
      printerDuplexColor = '[カラー両]RICOH IM C6010 JPN RPCS'
      manualDir          = 'C:\mwj\MWJAPAN\mwjapan - share\asago\Manual'
      logDir             = 'C:\mwj\MWJAPAN\mwjapan - share\asago\Log'
      sagawaDir          = 'Q:\'
      fukutsuDir         = 'C:\Program Files (x86)\is-2\Syukka\In'
      amazonDir          = 'C:\Temp\amazon'
      waitSec            = 15
    }
    New-Item -ItemType Directory -Force (Split-Path $ConfigPath) | Out-Null
    [IO.File]::WriteAllText($ConfigPath, ($default | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
  }
  return Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Find-Acrobat {
  $cands = @()
  foreach ($exe in @('AcroRd32.exe', 'Acrobat.exe')) {
    foreach ($hive in @('HKLM:', 'HKCU:')) {
      try {
        $p = (Get-ItemProperty "$hive\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$exe" -ErrorAction Stop).'(default)'
        if ($p) { $cands += $p.Trim('"') }
      } catch {}
    }
  }
  $cands += "${env:ProgramFiles(x86)}\Adobe\Acrobat Reader DC\Reader\AcroRd32.exe"
  $cands += "$env:ProgramFiles\Adobe\Acrobat DC\Acrobat\Acrobat.exe"
  $cands += "${env:ProgramFiles(x86)}\Adobe\Acrobat DC\Acrobat\Acrobat.exe"
  foreach ($c in $cands) {
    if ($c -and (Test-Path -LiteralPath $c)) { return $c }
  }
  return $null
}

# フォルダごとに、送った印刷の数と使ったプリンタを数える（待ち行列の確認に使う）
$script:sent = 0
$script:printers = @{}
function Print-Pdf([string]$acro, [string]$file, [string]$printer) {
  Start-Process -FilePath $acro -ArgumentList @('/t', ('"' + $file + '"'), ('"' + $printer + '"'))
  $script:sent++
  $script:printers[$printer] = $true
  Wait-Ms 1500
}

# 印刷の待ち行列の見張り。フォルダの印刷を始めるときに Start-Watch し、Wait-Ms の間も 0.3 秒ごとに見る
# （複合機へすぐ送られて、待ち行列にいる時間が短い印刷も見逃さないため）
$script:watch = $false
$script:since = Get-Date
$script:seen = @{}
$script:qerr = ''
$script:jobs = @()
$script:lastPoll = Get-Date
function Start-Watch {
  $script:sent = 0
  $script:printers = @{}
  $script:seen = @{}
  $script:qerr = ''
  $script:jobs = @()
  $script:since = (Get-Date).AddSeconds(-2)
  $script:watch = $true
}
function Poll-Queue {
  if (-not $script:watch -or $script:printers.Count -eq 0) { return }
  if (((Get-Date) - $script:lastPoll).TotalMilliseconds -lt 300) { return }
  $script:lastPoll = Get-Date
  $jobs = @()
  foreach ($p in @($script:printers.Keys)) {
    try {
      $jobs += @(Get-PrintJob -PrinterName $p -ErrorAction Stop | Where-Object { $_.SubmittedTime -ge $script:since })
    } catch {
      if (-not $script:qerr) { $script:qerr = 'プリンタ「' + $p + '」が見つかりません（設定ファイルのプリンタ名を確認してください）' }
    }
  }
  foreach ($j in $jobs) {
    $script:seen[[string]$j.Id + '@' + $j.PrinterName] = $true
    if (-not $script:qerr -and [string]$j.JobStatus -match 'Error|Offline|PaperOut|Blocked|UserIntervention|Deleted') {
      $script:qerr = 'プリンタ「' + $j.PrinterName + '」でエラー（' + $j.JobStatus + '）: ' + $j.DocumentName
    }
  }
  $script:jobs = $jobs
}

# 送った印刷がエラーなくすべて複合機へ送られたら空文字、エラー・時間切れのときは理由を返す
function Wait-Queue([string]$head, [int]$timeoutSec = 180) {
  if ($script:sent -eq 0) { $script:watch = $false; return '' }
  $start = Get-Date
  try {
    while (-not $script:cancel) {
      $script:lastPoll = (Get-Date).AddSeconds(-1)
      Poll-Queue
      if ($script:qerr) { return $script:qerr }
      $elapsed = ((Get-Date) - $start).TotalSeconds
      if ($script:jobs.Count -eq 0) {
        # 待ち行列が空: 送った数の印刷が入って出ていけば完了。一度も見えないまま 30 秒たったら、印刷されていない
        if ($script:seen.Count -ge $script:sent) { return '' }
        if ($elapsed -ge 30) {
          if ($script:seen.Count -gt 0) { return '' }
          return '印刷が待ち行列に入りませんでした（Acrobat で印刷できなかった可能性があります）'
        }
      } elseif ($elapsed -ge $timeoutSec) {
        return ('印刷が終わりません（' + $script:jobs.Count + ' 件が待ち行列に残っています）')
      }
      Show-Progress ($head + "`n" + '複合機へ送っています… 残り ' + $script:jobs.Count + ' 件')
      Wait-Ms 500
    }
    return '中断しました'
  } finally {
    $script:watch = $false
  }
}

function Write-Log([object]$cfg, [string]$logName, [string]$msg) {
  try {
    if ($cfg.logDir -and (Test-Path -LiteralPath $cfg.logDir)) {
      Add-Content -LiteralPath (Join-Path $cfg.logDir ($logName + '.txt')) -Value ($msg + ',' + (Get-Date).ToString('yyyy/MM/dd HH:mm:ss')) -Encoding Default
    }
  } catch {}
}

# フォルダ名を変える（同じ名前があれば suffix2 を使う）
function Rename-Done([string]$path, [string]$suffix, [string]$suffix2) {
  $name = Split-Path $path -Leaf
  $parent = Split-Path $path -Parent
  $new = $name + $suffix
  if (Test-Path -LiteralPath (Join-Path $parent $new)) { $new = $name + (Get-Date).ToString('HHmmss') + $suffix2 }
  Rename-Item -LiteralPath $path -NewName $new
}

try {
  if ($Install) {
    $key = 'HKCU:\Software\Classes\mwjprint'
    New-Item -Path $key -Force | Out-Null
    New-Item -Path "$key\shell" -Force | Out-Null
    New-Item -Path "$key\shell\open" -Force | Out-Null
    New-Item -Path "$key\shell\open\command" -Force | Out-Null
    Set-ItemProperty -Path $key -Name '(default)' -Value 'URL:MWSystem print Protocol'
    Set-ItemProperty -Path $key -Name 'URL Protocol' -Value ''
    $cmd = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $PSCommandPath + '" "%1"'
    Set-ItemProperty -Path "$key\shell\open\command" -Name '(default)' -Value $cmd
    $cfg = Get-Config
    $acro = Find-Acrobat
    $msg = "出荷指示の印刷の設定が完了しました（版 " + $Version + "）。`n`n設定ファイル: " + $ConfigPath + "`nNAS: " + $cfg.root +
      "`nモノクロ: " + $cfg.printerMono + "`nカラー: " + $cfg.printerColor + "`n`nNAS の場所・プリンタ名が違うときは、設定ファイルをメモ帳で直してください。"
    if (-not (Test-Path -LiteralPath $cfg.root)) { $msg += "`n`n※ NAS の場所が見つかりません: " + $cfg.root }
    if ($acro) {
      Show-Msg ($msg + "`n`nAcrobat: " + $acro)
    } else {
      Show-Msg ($msg + "`n`n※ Acrobat（Adobe Acrobat Reader）が見つかりません。インストールしてから使ってください。") 'Warning'
    }
    exit 0
  }

  # mwjprint:print?job=... を読む
  $params = @{}
  $qs = ($Url -replace '^mwjprint:/*', '').Split('?', 2)
  if ($qs.Count -gt 1) {
    foreach ($kv in $qs[1].Split('&')) {
      $p = $kv.Split('=', 2)
      if ($p.Count -eq 2) { $params[[uri]::UnescapeDataString($p[0])] = [uri]::UnescapeDataString($p[1]) }
    }
  }
  $b64 = [string]$params['job']
  if (-not $b64 -or $b64 -notmatch '^[A-Za-z0-9_-]+$') {
    Show-Msg ("呼び出しの内容が正しくありません。`n" + $Url) 'Error'
    exit 1
  }
  $b64 = $b64.Replace('-', '+').Replace('_', '/')
  while ($b64.Length % 4) { $b64 += '=' }
  $job = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json

  $cfg = Get-Config
  # 画面（ブラウザ）で選んでいる保存先と、この設定の保存先が同じフォルダか（フォルダ名で確かめる）
  $leaf = Split-Path ([string]$cfg.root).TrimEnd('\') -Leaf
  if ($job.root -and $leaf -ne [string]$job.root) {
    Close-Progress
    $ans = [System.Windows.Forms.MessageBox]::Show(
      ("画面で選んでいる保存先「" + $job.root + "」と、印刷用スクリプトの設定の保存先「" + $cfg.root + "」が違います。`n`n" +
       "設定ファイルをメモ帳で開きますか？`n「root」を画面と同じフォルダ（例: \\\\192.168.30.133\\share\\" + $job.root + "）に直して保存し、もう一度印刷してください。`n" +
       "（設定ファイルでは \ を 2 つ重ねて書きます）"),
      $Title, 'YesNo', 'Warning')
    if ($ans -eq 'Yes') { Start-Process notepad.exe -ArgumentList ('"' + $ConfigPath + '"') }
    exit 1
  }
  if (-not (Test-Path -LiteralPath $cfg.root)) {
    Show-Msg ("NAS の場所が見つかりません: " + $cfg.root + "`n`n設定ファイル: " + $ConfigPath) 'Error'
    exit 1
  }
  $acro = Find-Acrobat
  if (-not $acro) {
    Show-Msg 'Acrobat（Adobe Acrobat Reader）が見つかりません。' 'Error'
    exit 1
  }

  # 相対パス（'/' 区切り。.. は使えない）を NAS のフォルダにする
  function To-Path([string]$rel) {
    if ($rel -match '\.\.' -or $rel -match '^[\\/]') { throw ('フォルダの指定が正しくありません: ' + $rel) }
    return Join-Path $cfg.root ($rel -replace '/', '\')
  }

  foreach ($rel in @($job.old)) {
    if (-not $rel) { continue }
    $path = To-Path $rel
    if (Test-Path -LiteralPath $path) { Rename-Done $path '【自動済' '_【自動済' }
  }

  $ng = @()
  $done = 0
  $failed = 0
  $all = @($job.print).Count
  foreach ($rel in @($job.print)) {
    if ($script:cancel) { break }
    $path = To-Path $rel
    $name = Split-Path $path -Leaf
    $head = '印刷しています（' + ($done + $failed + 1) + ' / ' + $all + '）' + "`n" + $name
    Show-Progress $head
    if (-not (Test-Path -LiteralPath $path)) {
      $ng += ($rel + '（フォルダが見つかりません）')
      $failed++
      continue
    }
    $logName = ($rel -split '/')[0]
    Write-Log $cfg $logName $name
    $ngBefore = $ng.Count
    Start-Watch
    foreach ($f in Get-ChildItem -LiteralPath $path -File) {
      Write-Log $cfg $logName (' ' + $f.Name)
      $lower = $f.Name.ToLower()
      try {
        if ($lower.EndsWith('.pdf')) {
          $printer = if ($f.Name.EndsWith('.Pdf')) { $cfg.printerColor } else { $cfg.printerMono }
          Print-Pdf $acro $f.FullName $printer
        } elseif ($lower.EndsWith('pccs.csv')) {
          Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $cfg.sagawaDir $f.Name) -Force
        } elseif ($lower.EndsWith('is2.csv')) {
          Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $cfg.fukutsuDir $f.Name) -Force
        } elseif ($lower.EndsWith('.xls') -or $lower.EndsWith('.xlsx')) {
          Start-Process -FilePath $f.FullName -Verb Print
          Wait-Ms 3000
        } elseif ($f.Name -eq 'Manu.txt') {
          foreach ($line in Get-Content -LiteralPath $f.FullName -Encoding Default) {
            $a = $line.Split(',')
            if ($a.Count -lt 2 -or -not $a[0]) { continue }
            $printer = if ($a[0].EndsWith('.Pdf')) { $cfg.printerDuplexColor } else { $cfg.printerDuplex }
            for ($k = 0; $k -lt [int]$a[1]; $k++) { Print-Pdf $acro (Join-Path $cfg.manualDir $a[0]) $printer }
          }
        } elseif ($lower.EndsWith('.lhd')) {
          $to = Join-Path $cfg.amazonDir $name
          New-Item -ItemType Directory -Force $to | Out-Null
          Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $to $f.Name) -Force
          $po = Join-Path $path 'PO.png'
          if (Test-Path -LiteralPath $po) { Copy-Item -LiteralPath $po -Destination (Join-Path $to 'PO.png') -Force }
          Start-Process -FilePath (Join-Path $to $f.Name)
        }
      } catch {
        $ng += ($name + ' ' + $f.Name + '（' + $_.Exception.Message + '）')
      }
    }
    # 印刷がエラーなく複合機へ送られたことを確かめてから「【済」を付ける。
    # 確かめられないとき・コピー等に失敗したときは「【済」を付けない（画面でも出荷指示出力済にならない）
    $qerr = Wait-Queue $head
    if ($qerr) {
      $ng += ($name + '（' + $qerr + '）')
      Write-Log $cfg $logName (' 印刷を確認できませんでした: ' + $qerr)
    }
    if ($qerr -or $ng.Count -gt $ngBefore) {
      $failed++
    } else {
      try {
        Rename-Done $path '【済' '_差替【済'
        $done++
      } catch {
        $ng += ($name + '（フォルダ名を変えられません: ' + $_.Exception.Message + '）')
        $failed++
      }
    }
    # 次のフォルダまで待つ（プリンタの順番が入れ替わらないように）
    if ($done + $failed -lt $all) { Wait-Ms ([int]$cfg.waitSec * 1000) }
  }
  Close-Progress
  if ($script:cancel) {
    Show-Msg ('中断しました（' + $done + ' / ' + $all + ' フォルダを印刷済にしました）。') 'Warning'
  } elseif ($ng.Count -gt 0) {
    Show-Msg ("$all フォルダのうち $done フォルダを印刷済（【済）にしました。`n次のフォルダは【済にしていません（受注ステータスも変わりません）。確認して印刷し直してください。`n`n" + ($ng -join "`n")) 'Warning'
  }
} catch {
  Show-Msg ("出荷指示の印刷でエラーが発生しました。`n`n" + $_.Exception.Message) 'Error'
  exit 1
}
