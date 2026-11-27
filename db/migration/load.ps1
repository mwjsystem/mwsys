<#
=====================================================================
データ移行: 現行システムの CSV を新システムに投入する（psql.xlsm の \copy の代わり）

実行例（Windows PowerShell。psql にパスが通っていること）:
  $env:PGHOST = '<host>'; $env:PGUSER = '<user>'; $env:PGDATABASE = '<db>'
  （パスワードは %APPDATA%\postgresql\pgpass.conf か、実行時の入力で。スクリプトには書かない）
  .\load.ps1 -CsvDir C:\temp\20261127 -Schema test -Comp 1
  .\load.ps1 -CsvDir C:\temp\20261127 -Schema test -Comp 1 -Only trjyuden,trjyumei1   # 一部だけやり直す

前提: 00_clear.sql と 01_before_load.sql を同じ -Schema / -Comp で実行済み

・CSV はヘッダ付き。文字コードは自動判定（UTF-8 として読めなければ SJIS）。-Encoding で指定もできる
・入れる列:
    header  … ヘッダの列名で当てる（商品・単価・構成品。04_goods.sql がこの列だけを差分更新する）
    fixed   … 決まった列（mig_msmember。oracle/member_1.sql と同じ並び）
    ordinal … 表の先頭の列から CSV の列数分（新システムで後から足した列は Exclude で除く）
・1 ファイルずつ 1 トランザクション（USER トリガーを止めて \copy、終わったら戻す。失敗したら戻る）
・最後に、入れた表の会社 ID ごとの件数を表示する（Comp 以外の ID が入っていたら警告）
=====================================================================
#>
param(
  [Parameter(Mandatory = $true)][string]$CsvDir,
  [ValidateSet('public', 'test')][string]$Schema = 'test',
  [Parameter(Mandatory = $true)][int]$Comp,
  [string[]]$Only = @(),
  [ValidateSet('auto', 'UTF8', 'SJIS')][string]$Encoding = 'auto',
  [string]$Psql = 'psql'
)
$ErrorActionPreference = 'Stop'

# ファイル → 表。Comp ごとに使うファイルが違うものは Comps で絞る
$jobs = @(
  @{ File = 'msgoods';   Table = 'mig_msgoods';   Mode = 'header' }
  @{ File = 'msgtanka';  Table = 'mig_msgtanka';  Mode = 'header' }
  @{ File = 'msgzai';    Table = 'mig_msgzai';    Mode = 'header' }
  @{ File = 'msmember';  Table = 'mig_msmember';  Mode = 'fixed'; Cols = 'id,mcode,sei,kana,tankakbn,mtax,pcode,daibunrui,chubunrui,tcode1,del,dmemo,memo,torikbn,sime,site,inday,scde,sscode,mail,mail2,mail3,mail4,seikyuu' }
  @{ File = 'msmadr';    Table = 'mig_msmadr';    Mode = 'ordinal'; Like = 'msmadr' }
  @{ File = 'msvendor';  Table = 'msvendor';      Mode = 'ordinal' }
  @{ File = 'trchoden';  Table = 'trchoden';      Mode = 'ordinal' }
  @{ File = 'trgtana1';  Table = 'trgtana';       Mode = 'ordinal'; Comps = @(1) }
  @{ File = 'trgtana2';  Table = 'trgtana';       Mode = 'ordinal'; Comps = @(2) }
  @{ File = 'trhatden';  Table = 'trhatden';      Mode = 'ordinal' }
  @{ File = 'trhatmei';  Table = 'trhatmei';      Mode = 'ordinal' }
  @{ File = 'trhgnden';  Table = 'trhgnden';      Mode = 'ordinal' }
  @{ File = 'trjyuden';  Table = 'trjyuden';      Mode = 'ordinal'; Comps = @(1); Exclude = @('denku', 'shipdir', 'ship_at', 'ship_by', 'print_at', 'print_by', 'pick_at', 'pick_by', 'keep_at', 'keep_by', 'kpchk_at', 'kpchk_by') }
  @{ File = 'trjyuden2'; Table = 'trjyuden';      Mode = 'ordinal'; Comps = @(2); Exclude = @('denku', 'shipdir', 'ship_at', 'ship_by', 'print_at', 'print_by', 'pick_at', 'pick_by', 'keep_at', 'keep_by', 'kpchk_at', 'kpchk_by') }
  @{ File = 'trjyumei1'; Table = 'trjyumei';      Mode = 'ordinal' }
  @{ File = 'trjyumei2'; Table = 'trjyumei';      Mode = 'ordinal' }
  @{ File = 'trjyumei3'; Table = 'trjyumei';      Mode = 'ordinal' }
  @{ File = 'trsiiden';  Table = 'trsiiden';      Mode = 'ordinal' }
  @{ File = 'trsiimei';  Table = 'trsiimei';      Mode = 'ordinal' }
  @{ File = 'trmovsub';  Table = 'trmovsub';      Mode = 'ordinal' }
  @{ File = 'trmovden';  Table = 'trmovden';      Mode = 'ordinal' }
  @{ File = 'trtenden';  Table = 'trtenden';      Mode = 'ordinal' }
  @{ File = 'trzaiko1';  Table = 'trzaiko';       Mode = 'ordinal'; Comps = @(1) }
  @{ File = 'trzaiko2';  Table = 'trzaiko';       Mode = 'ordinal'; Comps = @(2) }
  @{ File = 'trseikyu';  Table = 'trseikyu_load'; Mode = 'ordinal' }
  @{ File = 'trnyuden';  Table = 'trnyuden';      Mode = 'ordinal' }
  @{ File = 'trnyusub';  Table = 'trnyusub';      Mode = 'ordinal'; Exclude = @('kdenno') }
)

function Invoke-Psql([string[]]$Commands, [switch]$Single) {
  $a = @('-X', '-v', 'ON_ERROR_STOP=1', '-At')
  if ($Single) { $a += '-1' }
  foreach ($c in $Commands) { $a += @('-c', $c) }
  $out = & $Psql @a
  if ($LASTEXITCODE -ne 0) { throw "psql が失敗しました（終了コード $LASTEXITCODE）" }
  return $out
}

function Get-CsvEncoding([string]$Path) {
  if ($Encoding -ne 'auto') { return $Encoding }
  # 先頭 4MB だけ読む（受注明細などは大きいので全部は読まない）
  $fs = [IO.File]::OpenRead($Path)
  try {
    $bytes = New-Object byte[] ([Math]::Min($fs.Length, 4MB))
    $len = $fs.Read($bytes, 0, $bytes.Length)
  } finally { $fs.Close() }
  try {
    # flush = false: 4MB の境目で文字が切れていても誤判定しない
    (New-Object Text.UTF8Encoding($false, $true)).GetDecoder().GetCharCount($bytes, 0, $len, $false) | Out-Null
    return 'UTF8'
  } catch {
    return 'SJIS'
  }
}

function Get-CsvHeader([string]$Path, [string]$Enc) {
  $e = if ($Enc -eq 'UTF8') { New-Object Text.UTF8Encoding($false) } else { [Text.Encoding]::GetEncoding(932) }
  $p = New-Object Microsoft.VisualBasic.FileIO.TextFieldParser($Path, $e)
  try {
    $p.SetDelimiters(','); $p.HasFieldsEnclosedInQuotes = $true
    return , $p.ReadFields()
  } finally { $p.Close() }
}
Add-Type -AssemblyName Microsoft.VisualBasic

$loaded = New-Object System.Collections.Generic.List[string]
foreach ($j in $jobs) {
  if ($Only.Count -gt 0 -and $Only -notcontains $j.File) { continue }
  if ($j.Comps -and $j.Comps -notcontains $Comp) { continue }
  $path = Join-Path $CsvDir ($j.File + '.csv')
  if (-not (Test-Path $path)) { Write-Host ("  -  {0,-10} ファイルなし（とばす）" -f $j.File) -ForegroundColor DarkGray; continue }

  $enc = Get-CsvEncoding $path
  $header = Get-CsvHeader $path $enc
  $n = $header.Count

  switch ($j.Mode) {
    'header' {
      $cols = $header | ForEach-Object { $_.Trim().Trim('"').ToLower() }
    }
    'fixed' {
      $cols = $j.Cols -split ','
      if ($cols.Count -ne $n) { throw "$($j.File).csv の列数 $n が $($j.Table) の $($cols.Count) 列と違います（oracle/member_1.sql で出し直してください）" }
    }
    'ordinal' {
      $like = if ($j.Like) { $j.Like } else { $j.Table }
      $all = Invoke-Psql @("SELECT column_name FROM information_schema.columns WHERE table_schema = '$Schema' AND table_name = '$like' ORDER BY ordinal_position")
      $all = @($all | Where-Object { $j.Exclude -notcontains $_ })
      if ($all.Count -lt $n) { throw "$($j.File).csv の列数 $n が $Schema.$like の列数 $($all.Count) より多い" }
      $cols = $all[0..($n - 1)]
      if ($all.Count -gt $n) { Write-Host ("     {0}: CSV に無い列（既定値）: {1}" -f $j.File, ($all[$n..($all.Count - 1)] -join ', ')) -ForegroundColor DarkGray }
    }
  }

  # 列名は二重引用符で囲まない（Windows PowerShell 5.1 は psql への引数の " を正しく渡せない）
  $bad = @($cols | Where-Object { $_ -notmatch '^[a-z_][a-z0-9_]*$' })
  if ($bad.Count -gt 0) { throw "$($j.File).csv: 列名として使えないヘッダ: $($bad -join ', ')（抽出 SQL の別名を新システムの列名にしてください）" }
  $colList = $cols -join ', '
  $target = "$Schema.$($j.Table)"
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $cmds = @()
  if ($j.Table -notlike 'mig_*' -and $j.Table -ne 'trseikyu_load') { $cmds += "ALTER TABLE $target DISABLE TRIGGER USER" }
  $cmds += "\copy $target ($colList) FROM '$path' WITH (FORMAT csv, HEADER true, ENCODING '$enc')"
  if ($j.Table -notlike 'mig_*' -and $j.Table -ne 'trseikyu_load') { $cmds += "ALTER TABLE $target ENABLE TRIGGER USER" }
  if ($j.Mode -eq 'header') {
    $vals = for ($i = 0; $i -lt $cols.Count; $i++) { "('$($j.Table -replace '^mig_', '')', '$($cols[$i])', $i)" }
    $cmds += "DELETE FROM $Schema.mig_cols WHERE tbl = '$($j.Table -replace '^mig_', '')'"
    $cmds += "INSERT INTO $Schema.mig_cols (tbl, col, ord) VALUES " + ($vals -join ', ')
  }
  $out = Invoke-Psql $cmds -Single
  Write-Host ("  OK {0,-10} → {1,-16} {2} 列 {3} {4,6:N1} 秒  {5}" -f $j.File, $j.Table, $n, $enc, $sw.Elapsed.TotalSeconds, (($out | Where-Object { $_ -like 'COPY*' }) -join ' ')) -ForegroundColor Green
  if (-not $loaded.Contains($j.Table)) { $loaded.Add($j.Table) }
}

Write-Host ''
Write-Host '会社 ID ごとの件数（投入した表）'
foreach ($t in $loaded) {
  $rows = Invoke-Psql @("SELECT id || ':' || count(*) FROM $Schema.$t GROUP BY id ORDER BY id")
  $bad = @($rows | Where-Object { ($_ -split ':')[0] -ne "$Comp" -and $t -like 'mig_*' })
  $color = if ($bad.Count -gt 0) { 'Yellow' } else { 'Gray' }
  Write-Host ("  {0,-16} {1}" -f $t, ($rows -join '  ')) -ForegroundColor $color
}
Write-Host "（mig_* に $Comp 以外の ID があれば抽出 SQL の where を確認。伝票の表の他の ID は、まだ消していない他の会社の行）"
