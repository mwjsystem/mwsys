Attribute VB_Name = "Module1"
Option Explicit
'** 発注勧告（新システム版）
'** 旧システムの DB（Oracle）の代わりに、新システムの画面「発注勧告」で出した
'** 発注勧告データ_yyyymmdd.xlsx を読む。Span の計算・列の追加・式は現行と同じ。
'** 発注伝票は Save_csv（発注取込.csv）ではなく、画面「発注勧告」で data シートから登録する。
    Public gdicVal As Object              '種類|商品コード|キー → Array(値, 値2)
    Public gstBase As String              'データの基準日（yyyymmdd）

Private Function key_of(strKind As String, strGds As String, strKey As String) As String
    key_of = strKind & "|" & Trim(strGds) & "|" & Trim(strKey)
End Function
Private Function get_val(strKey As String, intIdx As Integer) As Variant
    If gdicVal.Exists(strKey) Then
        get_val = gdicVal.Item(strKey)(intIdx)
    Else
        get_val = 0
    End If
End Function

'** 発注勧告データ_yyyymmdd.xlsx を読み込む（旧: DB に接続）
Public Function Con_DB() As Boolean

    Dim vFile  As Variant
    Dim wbDat  As Workbook
    Dim wsDat  As Worksheet
    Dim i      As Long
    Dim lngEnd As Long

    Con_DB = False
    vFile = Application.GetOpenFilename("発注勧告データ (*.xlsx),*.xlsx", , "発注勧告データ_yyyymmdd.xlsx を選んでください")
    If VarType(vFile) = vbBoolean Then
        Exit Function
    End If
    Set gdicVal = CreateObject("Scripting.Dictionary")
    Set wbDat = Workbooks.Open(Filename:=vFile, ReadOnly:=True)
    Set wsDat = wbDat.Worksheets("値")
    gstBase = CStr(wsDat.Range("B1").Value)
    lngEnd = wsDat.Cells(wsDat.Rows.Count, 1).End(xlUp).Row
    For i = 3 To lngEnd
        gdicVal.Item(key_of(CStr(wsDat.Cells(i, 1).Value), CStr(wsDat.Cells(i, 2).Value), CStr(wsDat.Cells(i, 3).Value))) = _
            Array(wsDat.Cells(i, 4).Value, wsDat.Cells(i, 5).Value)
    Next
    wbDat.Close SaveChanges:=False
    Con_DB = True

End Function
'** 在庫数（倉庫 01・001・015・016）
Function get_zaiko(strGds As String, stDate As String, strScd As String) As Long
    get_zaiko = get_val(key_of("在庫", strGds, strScd), 0)
End Function
'** 受注残（新システムは 今日まで・全期間 の大きい方を計算済み）
Function get_jyuzan(strGds As String, stDate As String, strScd As String) As Long
    get_jyuzan = get_val(key_of("在庫", strGds, strScd), 1)
End Function
Function get_jznall(strGds As String, strScd As String) As Long
    get_jznall = get_val(key_of("在庫", strGds, strScd), 1)
End Function
'** 発注残（倉庫 01・016）
Function get_hattyuzan(strGds As String, stDate As String, strScd As String) As Long
    get_hattyuzan = get_val(key_of("発注残", strGds, strScd), 0)
End Function
'** 前月の出荷数 flg：true⇒関東倉庫以外、false⇒関東倉庫
Function get_shukka(strGds As String, stDate As String, flg As Boolean) As Long
    get_shukka = get_val(key_of("出荷", strGds, IIf(flg, "他", "016")), 0)
End Function
'** 発注月ごとの発注残。Array(yyyymm, 数量) の Collection を返す（strYM2 から strYm1 の月）
Function get_hatz(strGds As String, strYm1 As String, strYM2 As String, flg As Boolean) As Collection

    Dim colRet As New Collection
    Dim dtYm   As Date
    Dim strYm  As String
    Dim strKey As String

    dtYm = DateSerial(Val(Left(strYM2, 4)), Val(Right(strYM2, 2)), 1)
    Do
        strYm = Format(dtYm, "YYYYMM")
        If strYm > strYm1 Then Exit Do
        strKey = key_of("発注月", strGds, IIf(flg, "他", "016") & "|" & strYm)
        If gdicVal.Exists(strKey) Then
            colRet.Add Array(strYm, gdicVal.Item(strKey)(0))
        End If
        dtYm = DateAdd("m", 1, dtYm)
    Loop
    Set get_hatz = colRet

End Function
'** 最短入荷日と、その日の入荷数。Array(yyyymmdd, 数量)。無ければ Empty
Function get_inday(strGds As String, flg As Boolean) As Variant

    Dim strKey As String

    strKey = key_of("入荷", strGds, IIf(flg, "他", "016"))
    If gdicVal.Exists(strKey) Then
        get_inday = Array(CStr(gdicVal.Item(strKey)(0)), gdicVal.Item(strKey)(1))
    Else
        get_inday = Empty
    End If

End Function

Sub Span()

    Dim strRef As String                  '参照形式退避用
    Dim strCal As String                  '自動計算設定退避用
    Dim wshMe  As Worksheet               '自分シート
    Dim wshKa  As Worksheet               '加工品シート
    Dim intCol As Integer                 '列番号取得用
    Dim i      As Integer                 'ループ用
    Dim j      As Integer                 'ヘッドガード在庫追加用
    Dim intRC  As Integer                 'RC計算用
    Dim lngSpa As Single                  'Span計算用
    Dim dtNow  As Date
    Dim stDate As String
    Dim stLamo As String
    Dim stLam6 As String
    Dim strGds As String
    Dim dicSk  As Object
    Dim dicHz  As Object
    Dim vHz    As Variant
    Dim vIn    As Variant
    Dim rg100  As Range                   '100で見る
    Dim tmpRC  As Integer                 'RC計算用
    Dim tmpJzn As Long                    '受注残
    Dim tmpJz2 As Long                    '受注残
    Dim flg    As Boolean                 'true⇒関東倉庫以外、false⇒関東倉庫

    Set wshMe = ActiveSheet
    dtNow = wshMe.Range("C1")
    stDate = Format(dtNow, "YYYYMMDD")
    '発注勧告データを読む（基準日が C1 と違うときは確認する）
    If Not Con_DB() Then
        Exit Sub
    End If
    If gstBase <> stDate Then
        If MsgBox("発注勧告データの基準日（" & gstBase & "）が C1 の日付（" & stDate & "）と違います。続けますか？", vbYesNo + vbExclamation) <> vbYes Then
            Exit Sub
        End If
    End If

    strRef = Application.ReferenceStyle                               '参照形式を退避
    strCal = Application.Calculation
    With Application
        .ScreenUpdating = False                               '画面更新しない
        .Calculation = xlCalculationAutomatic                 '自動計算する
        .ReferenceStyle = xlR1C1                              '参照形式をR1C1に
    End With
    Set wshKa = ThisWorkbook.Worksheets("加工品")
    Set rg100 = ThisWorkbook.Worksheets("100で見る").Range("A:A")
    Set dicSk = CreateObject("Scripting.Dictionary")
    Set dicHz = CreateObject("Scripting.Dictionary")

    stLamo = Format(DateAdd("M", -1, dtNow), "YYYYMM")
    stLam6 = Format(DateAdd("M", -6, dtNow), "YYYYMM")


    intCol = wshMe.Rows(2).Find(What:="直近1年間", LookIn:=xlValues, _
             LookAt:=xlWhole, SearchOrder:=xlByRows, SearchDirection:=xlNext, _
             MatchCase:=False, MatchByte:=False, SearchFormat:=False).Column
    wshMe.Columns(intCol).Insert
    wshMe.Cells(2, intCol) = Left(stLamo, 4) & "/" & Right(stLamo, 2) & "/01"
    intCol = intCol + 1

    dicHz.Add Format(DateAdd("M", -6, dtNow), "YYYYMM"), intCol + 4
    wshMe.Cells(2, intCol + 4).Value = Format(DateAdd("M", -6, dtNow), "M") & "月発注数"
    dicHz.Add Format(DateAdd("M", -5, dtNow), "YYYYMM"), intCol + 5
    wshMe.Cells(2, intCol + 5).Value = Format(DateAdd("M", -5, dtNow), "M") & "月発注数"
    dicHz.Add Format(DateAdd("M", -4, dtNow), "YYYYMM"), intCol + 6
    wshMe.Cells(2, intCol + 6).Value = Format(DateAdd("M", -4, dtNow), "M") & "月発注数"
    dicHz.Add Format(DateAdd("M", -3, dtNow), "YYYYMM"), intCol + 7
    wshMe.Cells(2, intCol + 7).Value = Format(DateAdd("M", -3, dtNow), "M") & "月発注数"
    dicHz.Add Format(DateAdd("M", -2, dtNow), "YYYYMM"), intCol + 8
    wshMe.Cells(2, intCol + 8).Value = Format(DateAdd("M", -2, dtNow), "M") & "月発注数"
    dicHz.Add Format(DateAdd("M", -1, dtNow), "YYYYMM"), intCol + 9
    wshMe.Cells(2, intCol + 9).Value = Format(DateAdd("M", -1, dtNow), "M") & "月発注数"

    '追加先Dictionary作成
    For i = 2 To wshKa.Range("A1").End(xlDown).Row
        If dicSk.Exists(wshKa.Cells(i, 2).Value) = False Then
            dicSk.Add wshKa.Cells(i, 2).Value, 0
        End If
    Next
    '追加先行番号登録
    For i = 3 To wshMe.Cells(2, 3).End(xlDown).Row
        If dicSk.Exists(wshMe.Cells(i, 2).Value) Then
            dicSk.Item(wshMe.Cells(i, 2).Value) = i
        End If
        '一旦受注可能数を0に
        If wshMe.Cells(i, 6).Value = "海外" And wshMe.Cells(i, 5).Value <> "OEM" Then
            wshMe.Cells(i, 20).Value = 0
        End If
    Next
    '追加元の出荷数を追加先へ
    For i = 2 To wshKa.Range("A1").End(xlDown).Row
        strGds = wshKa.Cells(i, 1).Value
        wshMe.Cells(dicSk.Item(wshKa.Cells(i, 2).Value), intCol - 1).Value = wshMe.Cells(dicSk.Item(wshKa.Cells(i, 2).Value), intCol - 1).Value + get_shukka(strGds, stLamo, True)
        'ヘッドガードは受注可能数を追加先へ
        If wshKa.Cells(i, 1).Value Like "HGKP*" Or wshKa.Cells(i, 1).Value Like "KHS*" Or wshKa.Cells(i, 1).Value Like "SKHG*" Then
            tmpJzn = get_jyuzan(strGds, stDate, "01")
            tmpJz2 = get_jznall(strGds, "01")
            If tmpJzn < tmpJz2 Then
                tmpJzn = tmpJz2
            End If
            wshMe.Cells(dicSk.Item(wshKa.Cells(i, 2).Value), 20).Value = wshMe.Cells(dicSk.Item(wshKa.Cells(i, 2).Value), 20).Value + get_zaiko(strGds, stDate, "01") + get_zaiko(strGds, stDate, "001") + get_zaiko(strGds, stDate, "015") - tmpJzn
        End If
    Next
    For i = 3 To wshMe.Cells(2, 3).End(xlDown).Row
        wshMe.Cells(i, intCol + 4).Value = ""
        wshMe.Cells(i, intCol + 5).Value = ""
        wshMe.Cells(i, intCol + 6).Value = ""
        wshMe.Cells(i, intCol + 7).Value = ""
        wshMe.Cells(i, intCol + 8).Value = ""
        wshMe.Cells(i, intCol + 9).Value = ""
        wshMe.Cells(i, 28).Value = ""
        wshMe.Cells(i, 29).Value = ""
        If wshMe.Cells(i, 6).Value = "海外" And wshMe.Cells(i, 5).Value <> "OEM" Then
            If wshMe.Cells(i, 2).Value Like "*【関東倉庫】" Then
                flg = False

                strGds = Replace(wshMe.Cells(i, 2).Value, "【関東倉庫】", "")
                tmpJzn = get_jyuzan(strGds, stDate, "016")
                tmpJz2 = get_jznall(strGds, "016")
                If tmpJzn < tmpJz2 Then
                    tmpJzn = tmpJz2
                End If
                wshMe.Cells(i, 20).Value = wshMe.Cells(i, 20).Value + get_zaiko(strGds, stDate, "016") - tmpJzn
                wshMe.Cells(i, 21).Value = get_hattyuzan(strGds, stDate, "016")
                wshMe.Cells(i, intCol - 1).Value = wshMe.Cells(i, intCol - 1).Value + get_shukka(strGds, stLamo, flg)
            Else
                flg = True

                strGds = wshMe.Cells(i, 2).Value
                '受注残は 01 と 001 の合計（新システムは 今日まで・全期間 の大きい方を計算済み）
                tmpJzn = get_jyuzan(strGds, stDate, "01") + get_jyuzan(strGds, stDate, "001")
                wshMe.Cells(i, 20).Value = wshMe.Cells(i, 20).Value + get_zaiko(strGds, stDate, "01") + get_zaiko(strGds, stDate, "001") + get_zaiko(strGds, stDate, "015") - tmpJzn
                wshMe.Cells(i, 21).Value = get_hattyuzan(strGds, stDate, "01")
                wshMe.Cells(i, intCol - 1).Value = wshMe.Cells(i, intCol - 1).Value + get_shukka(strGds, stLamo, flg)
            End If

            lngSpa = wshMe.Cells(i, 24).Value
            intRC = intCol - 12 - 22
            wshMe.Cells(i, 23).FormulaR1C1 = "=RC[" & intRC & "]/2"
            lngSpa = lngSpa - 0.5
            intRC = intRC + 1
            If lngSpa > 0 Then
                Do
                    tmpRC = intRC
                    If lngSpa = 1 Then
                        wshMe.Cells(i, 23).FormulaR1C1 = wshMe.Cells(i, 23).FormulaR1C1 & "+ RC[" & tmpRC & "]"
                        Exit Do
                    ElseIf lngSpa = 0.5 Then
                        wshMe.Cells(i, 23).FormulaR1C1 = wshMe.Cells(i, 23).FormulaR1C1 & "+ RC[" & tmpRC & "]/2"
                        Exit Do
                    Else
                        wshMe.Cells(i, 23).FormulaR1C1 = wshMe.Cells(i, 23).FormulaR1C1 & "+ RC[" & tmpRC & "]"
                        lngSpa = lngSpa - 1
                        intRC = intRC + 1
                    End If
                Loop
            End If
            wshMe.Cells(i, intCol).FormulaR1C1 = "=SUM(RC[-12]:RC[-1])"
            '昨対
            wshMe.Cells(i, 15).FormulaR1C1 = "=IFERROR(SUM(R" & i & "C" & intCol - 6 & ":R" & i & "C" & intCol - 1 & ")/SUM(R" & i & "C" & intCol - 18 & ":R" & i & "C" & intCol - 13 & "),0)"
            'スパン数、月平均
            If Application.CountIf(rg100, wshMe.Cells(i, 2).Value) > 0 Then
                wshMe.Cells(i, 25).FormulaR1C1 = "=RC[-2]"
                wshMe.Cells(i, intCol + 2).FormulaR1C1 = "=RC[-1]"
            ElseIf wshMe.Cells(i, 14).Value < 1 Then
                wshMe.Cells(i, 25).FormulaR1C1 = "=RC[-2] * R1C24"
                wshMe.Cells(i, intCol + 2).FormulaR1C1 = "=RC[-1] * R1C" & Val(intCol + 2)
            Else
                wshMe.Cells(i, 25).FormulaR1C1 = "=RC[-2]"
                wshMe.Cells(i, intCol + 2).FormulaR1C1 = "=RC[-1]"
            End If
            If wshMe.Cells(i, 8).Value * 2 - wshMe.Cells(i, 26).Value <= 0 Or wshMe.Cells(i, 16).Value = 0 Then
                wshMe.Cells(i, 10).Value = ""
            Else
                wshMe.Cells(i, 10).Value = Application.RoundUp((wshMe.Cells(i, 8).Value * 2 - wshMe.Cells(i, 26).Value) / wshMe.Cells(i, 16).Value, 0) * wshMe.Cells(i, 16).Value
            End If
            '発注月ごとの発注数
            For Each vHz In get_hatz(strGds, stLamo, stLam6, flg)
                wshMe.Cells(i, dicHz.Item(vHz(0))) = vHz(1)
            Next
             '最短入荷日、入荷数
            vIn = get_inday(strGds, flg)
            If Not IsEmpty(vIn) Then
                wshMe.Cells(i, 28).Value = CDate(Format(vIn(0), "####/##/##"))
                wshMe.Cells(i, 29).Value = vIn(1)
            End If
            If wshMe.Cells(i, 20).Value < wshMe.Cells(i, 8).Value And (wshMe.Cells(i, 28).Value = "" Or DateDiff("d", Date, wshMe.Cells(i, 28).Value) > 30) Then
                wshMe.Cells(i, 20).Interior.Color = 255
            Else
                wshMe.Cells(i, 20).Interior.Color = 10092441
            End If

        Else
            wshMe.Cells(i, 10).Value = ""
        End If
    Next


    With Application
        .ReferenceStyle = strRef                              '参照形式を開始前の状態に戻す
        .ScreenUpdating = True                                '画面更新する
        .Calculation = strCal                                 '自動計算を開始前の状態に戻す
    End With

End Sub
Sub Make_data()

    Dim strCal As String                  '自動計算設定退避用
    Dim wshMe  As Worksheet               '自分シート
    Dim wshDa  As Worksheet
    Dim i      As Integer
    Dim j      As Integer
    Dim lngSpa As Single
    Dim dteTmp As Date
    Dim rngVen As Range

    strCal = Application.Calculation
    With Application
        .ScreenUpdating = False                               '画面更新しない
        .Calculation = xlCalculationManual                    '自動計算しない
    End With
    Set wshMe = ActiveSheet
    Set wshDa = Worksheets("data")
    wshDa.Rows("2:9999").Delete
    Set rngVen = wshMe.Range("Vendor")
    j = 1
    For i = 3 To wshMe.Cells(2, 3).End(xlDown).Row
        If wshMe.Cells(i, 10) > 0 Then
            j = j + 1
            wshDa.Cells(j, 1) = Format(wshMe.Cells(1, 3), "YYYYMMDD")
            If Int(wshMe.Cells(i, 24)) = wshMe.Cells(i, 24) Then
                wshDa.Cells(j, 2) = Format(DateAdd("m", wshMe.Cells(i, 24) - 1, wshMe.Cells(1, 3)), "YYYYMMDD")
            Else
                dteTmp = DateAdd("m", Int(wshMe.Cells(i, 24)) - 1, wshMe.Cells(1, 3))
                wshDa.Cells(j, 2) = Format(DateAdd("d", 15, dteTmp), "YYYYMMDD")
            End If
            wshDa.Cells(j, 3) = Application.VLookup(wshMe.Cells(i, 18), rngVen, 2, False)
            wshDa.Cells(j, 4) = wshMe.Cells(i, 2)
            wshDa.Cells(j, 5) = wshMe.Cells(i, 10)
        End If
    Next
    wshDa.Activate
    Application.Calculate
    With Application
        .ScreenUpdating = True                                '画面更新する
        .Calculation = strCal                                 '自動計算を開始前の状態に戻す
    End With

End Sub
'** 発注取込.csv は使わない（新システムの画面「発注勧告」で data シートから発注伝票を登録する）
Sub Save_csv()

    MsgBox "発注伝票は、新システムの「仕入関連 → 発注勧告」で、このファイル（保存してから）を選んで登録してください。", vbInformation

End Sub
