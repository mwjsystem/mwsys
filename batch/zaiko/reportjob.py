"""抽出のバッチ（現行の 国内発注在庫.xlsm・残少在庫確認.xlsm・大会倉庫.xlsm・竹島さん売上.xlsm の置き換え）。

  python reportjob.py hacchu <国内発注在庫.xlsm> <結果.xlsx>       発注点に届いた商品をメールで知らせ、発注一覧の結果を xlsx に書く
  python reportjob.py hori   <国内発注在庫.xlsm> <FAX フォルダ>     堀商店の発注残の FAX 用 xlsx をフォルダに置く
  python reportjob.py zansho <チャットワークのルーム ID>             今日出荷して朝来の在庫が 5 以下になった商品をチャットワークへ送る
  python reportjob.py kireru <在庫切れ対応リスト.xlsx>              朝来の在庫切れ（在庫 ≦ 受注残）を在庫切れ対応リストに書く
  python reportjob.py taikai <大会倉庫.xlsm>                        大会倉庫ごとの在庫を担当者へメールで送る
  python reportjob.py uriage <営業担当コード> <宛先メール>          営業担当の 3 年分の売上明細と商品×月の集計をメールで送る

商品の一覧・送り先などは、今の Excel の設定（発注一覧シートの品番・仕入先・ロット・メモ、data シートの倉庫と宛先、
対象品番・優先度シート）をそのまま読む。

環境変数（zaikojob.py と同じものに加えて）
  MWSYS_CHATWORK_TOKEN  zansho のチャットワークの API トークン
"""
import datetime
import io
import os
import smtplib
import sys
import traceback
import urllib.parse
import urllib.request
from copy import copy
from email.message import EmailMessage

import openpyxl
from openpyxl.styles import Font

import zaikojob as zj

COMP_ID = zj.COMP_ID
MAIN_SCODE = '01'
SYSTEM_MAIL = 'system@mwjapan.jp'
HACCHU_TO = ['shobuike@mwjapan.jp', 'otani@mwjapan.jp']
# この仕入先の商品は別の担当へ知らせる（現行と同じ）
HACCHU_ALT = {'010051': ['ezaki@mwjapan.jp']}
HORI_VCODE = '000009'
# これより前の発注は古い移行データなので見ない（現行と同じ）
HATZN_FROM = datetime.date(2019, 6, 28)
ZANSHO_MAX = 5
CHATWORK_URL = 'https://api.chatwork.com/v2/rooms/%s/messages'
XLSX_TYPE = zj.XLSX_TYPE


# ---------------------------------------------------------------- 共通

def prefix() -> str:
    return 'test_' if os.environ.get('MWSYS_SCHEMA') == 'test' else ''


def call_func(name: str, args: dict, fields: str) -> list:
    """SQL 関数（Hasura の root field）を呼ぶ"""
    q = 'query %s($args: %s%s_args!) { %s(args: $args) { %s } }' % (name, prefix(), name, zj.root(name), fields)
    return zj.step(name, q, {'args': args})[name]


def num(v) -> float:
    return float(v or 0)


def last_months(today: datetime.date, n: int = 12) -> tuple:
    """前月までの n か月（初日、末日、yyyymm の並び）"""
    end = today.replace(day=1) - datetime.timedelta(days=1)
    y, m = end.year, end.month - n + 1
    while m <= 0:
        y, m = y - 1, m + 12
    start = datetime.date(y, m, 1)
    yms = []
    d = start
    while d <= end:
        yms.append(d.strftime('%Y%m'))
        d = (d.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
    return start, end, yms


def zaiko_map(day: datetime.date, scodes: list) -> dict:
    """(倉庫, 商品) → (在庫, 受注残)"""
    rows = call_func('fzaikosc', {'p_id': COMP_ID, 'p_day': day.isoformat(), 'p_scodes': ','.join(scodes)}, 'scode gcode zaiko juzan')
    return {(r['scode'], r['gcode']): (num(r['zaiko']), num(r['juzan'])) for r in rows}


def syuk_map(start: datetime.date, end: datetime.date, scode: str = '') -> dict:
    """商品 → {yyyymm: 出荷数}"""
    out = {}
    for r in call_func('fsyukmon', {'p_id': COMP_ID, 'p_from': start.isoformat(), 'p_to': end.isoformat(), 'p_scode': scode}, 'gcode ym suu'):
        out.setdefault(r['gcode'], {})[r['ym']] = num(r['suu'])
    return out


def hatzn_rows(scode: str) -> list:
    rows = call_func('fhatzmei', {'p_id': COMP_ID, 'p_scode': scode}, 'denno line day gcode vcode tcode tname yday hatzn')
    for r in rows:
        r['day'] = datetime.date.fromisoformat(r['day'][:10]) if r.get('day') else None
        r['yday'] = datetime.date.fromisoformat(r['yday'][:10]) if r.get('yday') else None
        r['hatzn'] = num(r['hatzn'])
    return rows


def cell_text(v) -> str:
    return '' if v is None else str(v).strip()


def ival(v):
    """表示用: 整数なら int に"""
    return int(v) if isinstance(v, float) and v.is_integer() else v


def send_mail(to: list, cc: list, subject: str, body: str, attach: tuple = None) -> None:
    """attach は (ファイル名, bytes)。MWSYS_MAIL_TEST_TO があれば、そこにだけ送る"""
    msg = EmailMessage()
    msg['From'] = zj.MAIL_FROM
    test_to = os.environ.get('MWSYS_MAIL_TEST_TO')
    msg['To'] = test_to or ', '.join(to)
    if cc and not test_to:
        msg['Cc'] = ', '.join(cc)
    msg['Subject'] = subject
    msg.set_content(body)
    if attach:
        msg.add_attachment(attach[1], maintype=XLSX_TYPE[0], subtype=XLSX_TYPE[1], filename=attach[0])
    with smtplib.SMTP(zj.SMTP_HOST, zj.SMTP_PORT, timeout=60) as s:
        s.starttls()
        s.login(os.environ['MWSYS_SMTP_USER'], os.environ['MWSYS_SMTP_PASSWORD'])
        s.send_message(msg)


def book_bytes(wb) -> bytes:
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------- 国内発注在庫

def read_hacchu_list(path: str) -> list:
    """発注一覧シート（3 行目から、A 列が空になるまで）: 品番・商品名・ロット・仕入先・仕入先名・メモ"""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb['発注一覧']
    out = []
    for row in ws.iter_rows(min_row=3, values_only=True):
        gcode = cell_text(row[0])
        if not gcode:
            break
        get = lambda i: row[i] if len(row) > i else None
        out.append({'gcode': gcode, 'gtext': cell_text(get(1)), 'lot': get(15), 'vcode': cell_text(get(16)),
                    'vname': cell_text(get(17)), 'memo': cell_text(get(22))})
    wb.close()
    return out


def calc_hacchu(items: list, yms: list, syuk: dict, stock: dict, hatzn: list) -> list:
    """発注点（12 か月の出荷の月平均 × 1.2）・受注可・発注残と、その仕入先への発注残の明細（新しい順に 5 件）"""
    total = {}
    for h in hatzn:
        total[h['gcode']] = total.get(h['gcode'], 0) + h['hatzn']
    out = []
    for it in items:
        g = it['gcode']
        months = [syuk.get(g, {}).get(ym, 0) for ym in yms]
        point = round(sum(months) / 12 * 1.2, 1)
        zaiko, juzan = stock.get((MAIN_SCODE, g), (0, 0))
        kano = zaiko - juzan
        zan = total.get(g, 0)
        orders = sorted([h for h in hatzn if h['gcode'] == g and h['vcode'] == it['vcode'] and h['day'] and h['day'] >= HATZN_FROM],
                        key=lambda h: (h['day'], h['denno']), reverse=True)[:5]
        out.append({**it, 'months': months, 'point': point, 'zaiko': zaiko, 'juzan': juzan, 'kano': kano, 'zan': zan,
                    'orders': orders, 'alert': kano + zan < point})
    return out


def hacchu_body(rows: list) -> str:
    lines = ['掲題の件、以下の通りです', '', '仕入先Cd\t発注点\t受注可(在庫－注残)\t発注残\t商品コード[商品名]']
    for r in rows:
        lines.append('%s\t%d\t%s(%s-%s)\t%s\t%s[%s]' % (r['vcode'], int(r['point']), ival(r['kano']), ival(r['zaiko']), ival(r['juzan']),
                                                         ival(r['zan']), r['gcode'], r['gtext']))
    lines += ['', '以上']
    return '\n'.join(lines)


def write_hacchu_book(rows: list, yms: list, path: str) -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = '発注一覧'
    ws.append(['最終実行日時', datetime.datetime.now().strftime('%Y/%m/%d %H:%M:%S')])
    head = ['商品コード', '商品名', '発注点'] + yms + ['発注ロット', '仕入先', '仕入先名', '在庫', '受注残', '受注可', '発注残計', 'メモ欄']
    for _ in range(5):
        head += ['発注日', '発注残']
    ws.append(head)
    red = Font(color='FFFF0000', bold=True)
    for r in rows:
        line = [r['gcode'], r['gtext'], r['point']] + [ival(v) for v in r['months']] + [
            r['lot'], r['vcode'], r['vname'], ival(r['zaiko']), ival(r['juzan']), ival(r['kano']), ival(r['zan']), r['memo']]
        for o in r['orders']:
            line += [o['day'].strftime('%Y%m%d'), ival(o['hatzn'])]
        ws.append(line)
        if r['alert']:
            ws.cell(ws.max_row, 3 + len(yms) + 6).font = red
    ws.freeze_panes = 'C3'
    ws.column_dimensions['A'].width = 18
    ws.column_dimensions['B'].width = 30
    zj.save_book(wb, path)


def job_hacchu(xlsm: str, out: str) -> None:
    today = datetime.date.today()
    items = read_hacchu_list(xlsm)
    start, end, yms = last_months(today)
    rows = calc_hacchu(items, yms, syuk_map(start, end), zaiko_map(today, [MAIN_SCODE]), hatzn_rows(MAIN_SCODE))
    write_hacchu_book(rows, yms, out)
    alerts = [r for r in rows if r['alert']]
    subject = today.strftime('%Y%m%d') + '発注点到達商品一覧'
    groups = {}
    for r in alerts:
        groups.setdefault(tuple(HACCHU_ALT.get(r['vcode'], HACCHU_TO)), []).append(r)
    for to, rs in groups.items():
        send_mail(list(to), [SYSTEM_MAIL], subject, hacchu_body(rs))
    zj.write_log('report_hacchu', out, '正常終了 %d 件 / 発注点到達 %d 件' % (len(rows), len(alerts)))


# ---------------------------------------------------------------- 堀商店の発注残 FAX

def hori_rows(items: list, hatzn: list) -> list:
    names = {it['gcode']: it['gtext'] for it in items}
    rows = [h for h in hatzn if h['vcode'] == HORI_VCODE and h['gcode'] in names and h['day'] and h['day'] >= HATZN_FROM]
    rows.sort(key=lambda h: (h['denno'], -h['day'].toordinal()))
    return [{**h, 'gtext': names[h['gcode']]} for h in rows]


def job_hori(xlsm: str, folder: str) -> None:
    items = read_hacchu_list(xlsm)
    rows = hori_rows(items, hatzn_rows(MAIN_SCODE))
    if not rows:
        zj.write_log('report_hori', folder, '発注残なし')
        return
    # 見出し（1〜9 行目）は国内発注在庫.xlsm の Hori シートをそのまま写す
    src = openpyxl.load_workbook(xlsm)['Hori']
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Hori'
    for row in src.iter_rows(min_row=1, max_row=9):
        for c in row:
            d = ws.cell(c.row, c.column, c.value)
            if c.has_style:
                d.font, d.alignment, d.border, d.fill = copy(c.font), copy(c.alignment), copy(c.border), copy(c.fill)
    for key, dim in src.column_dimensions.items():
        ws.column_dimensions[key].width = dim.width
    for rng in src.merged_cells.ranges:
        if rng.max_row <= 9:
            ws.merge_cells(str(rng))
    ws['A1'] = datetime.datetime.now()
    ws['A1'].number_format = 'yyyy/mm/dd hh:mm'
    tmpl = [src.cell(10, c) for c in range(1, 7)]
    for i, h in enumerate(rows, start=1):
        vals = [i, h['day'].strftime('%Y/%m/%d') + '\n　' + str(h['denno']), h['gcode'] + '\n　' + h['gtext'], ival(h['hatzn']),
                h['yday'].strftime('%Y/%m/%d') if h['yday'] else None, '発注者：' + (h['tname'] or '')]
        for c, v in enumerate(vals, start=1):
            d = ws.cell(i + 9, c, v)
            t = tmpl[c - 1]
            if t.has_style:
                d.font, d.alignment, d.border = copy(t.font), copy(t.alignment), copy(t.border)
    path = os.path.join(folder, datetime.datetime.now().strftime('%Y%m%d%H%M%S') + '.xlsx')
    zj.save_book(wb, path)
    zj.write_log('report_hori', path, '正常終了 %d 件' % len(rows))


# ---------------------------------------------------------------- 残少在庫（チャットワーク）

def zansho_rows(shipped: list, stock: dict) -> list:
    out = []
    for g in sorted(set(shipped)):
        zaiko, juzan = stock.get((MAIN_SCODE, g), (0, 0))
        if zaiko <= ZANSHO_MAX:
            out.append((g, zaiko, juzan))
    return out


def job_zansho(room: str) -> None:
    today = datetime.date.today()
    shipped = [r['gcode'] for r in call_func('fsyukday', {'p_id': COMP_ID, 'p_day': today.isoformat(), 'p_scode': MAIN_SCODE}, 'gcode')]
    rows = zansho_rows(shipped, zaiko_map(today, [MAIN_SCODE]))
    msg = '%d月%d日出荷商品 残少在庫一覧\n商品 / 在庫数 / 受注残' % (today.month, today.day)
    msg += ''.join('\n%s / %s / %s' % (g, ival(z), ival(j)) for g, z, j in rows)
    req = urllib.request.Request(CHATWORK_URL % room, data=urllib.parse.urlencode({'body': msg}).encode('utf-8'),
                                 headers={'X-ChatWorkToken': os.environ['MWSYS_CHATWORK_TOKEN']})
    with urllib.request.urlopen(req, timeout=60) as res:
        res.read()
    zj.write_log('report_zansho', room, '正常終了 %d 件' % len(rows))


# ---------------------------------------------------------------- 在庫切れ対応リスト

def kireru_targets(goods: dict, stock: dict, subs: dict) -> list:
    """朝来で 在庫 ≦ 受注残 の、在庫管理する・中止でない商品のうち、対象品番シートにあり、代わりの在庫も無いもの"""
    def free(sc, g):
        z = stock.get((sc, g))
        return z[0] - z[1] if z else 0
    out = []
    for (sc, g), (zaiko, juzan) in sorted(stock.items()):
        if sc != MAIN_SCODE or zaiko > juzan or g not in subs:
            continue
        info = goods.get(g)
        if not info or cell_text(info.get('tkbn')) not in ('', '0') or cell_text(info.get('zkbn')) not in ('', '0'):
            continue
        gcd2, scd2 = subs[g]
        tmp = 0
        if gcd2:
            tmp += free(MAIN_SCODE, gcd2)
        if scd2:
            tmp += free(scd2, g)
        if gcd2 and scd2:
            tmp += free(scd2, gcd2)
        if tmp <= 0:
            out.append(g)
    return out


def job_kireru(path: str) -> None:
    today = datetime.date.today()
    wb = openpyxl.load_workbook(path)
    ws, ws2, ws3 = wb['シート1'], wb['対象品番'], wb['優先度']
    subs = {}
    for row in ws2.iter_rows(min_row=1, values_only=True):
        g = cell_text(row[1] if len(row) > 1 else None)
        if g:
            subs[g] = (cell_text(row[2] if len(row) > 2 else None), cell_text(row[3] if len(row) > 3 else None))
    prio = {}
    for row in ws3.iter_rows(min_row=1, values_only=True):
        if row and cell_text(row[0]):
            prio[cell_text(row[0])] = row[7] if len(row) > 7 else None
    scodes = sorted({MAIN_SCODE} | {s for _, s in subs.values() if s})
    stock = zaiko_map(today, scodes)
    q = zj.step('msgoods', 'query kireru_goods($id: smallint!) { %s(where: {id: {_eq: $id}}) { gcode tkbn zkbn } }' % zj.root('msgoods'), {'id': COMP_ID})
    goods = {g['gcode']: g for g in q['msgoods']}
    targets = kireru_targets(goods, stock, subs)
    start, end, yms = last_months(today)
    syuk = syuk_map(start, end, MAIN_SCODE)
    first = {}
    for h in sorted(hatzn_rows(MAIN_SCODE), key=lambda h: (h['yday'] or datetime.date.max)):
        if h['yday']:
            first.setdefault(h['gcode'], h)
    rows = {cell_text(ws.cell(r, 2).value): r for r in range(2, ws.max_row + 1) if cell_text(ws.cell(r, 2).value)}
    last = max(rows.values(), default=1)
    for g in targets:
        r = rows.get(g)
        if r is None:
            last += 1
            r = rows[g] = last
            ws.cell(r, 2, g)
        ws.cell(r, 3, round(sum(syuk.get(g, {}).values()) / 12, 1))
        h = first.get(g)
        ws.cell(r, 4, h['yday'].strftime('%Y-%m-%d') if h else '')
        ws.cell(r, 5, ival(h['hatzn']) if h else '')
        if g in prio:
            ws.cell(r, 6, prio[g])
    zj.save_book(wb, path)
    zj.write_log('report_kireru', path, '正常終了 %d 件' % len(targets))


# ---------------------------------------------------------------- 大会倉庫

def read_taikai(path: str) -> list:
    """data シート: A 倉庫コード、B 宛先"""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    out = [(cell_text(r[0]), cell_text(r[1])) for r in wb['data'].iter_rows(values_only=True) if r and cell_text(r[0]) and len(r) > 1 and cell_text(r[1])]
    wb.close()
    return out


def taikai_body(scode: str, stock: dict) -> str:
    lines = ['件名時点の在庫数一覧です']
    for (sc, g), (zaiko, _) in sorted(stock.items()):
        if sc == scode and zaiko > 0:
            lines.append('%s / %s' % (g, ival(zaiko)))
    return '\n'.join(lines)


def job_taikai(xlsm: str) -> None:
    today = datetime.date.today()
    stores = read_taikai(xlsm)
    stock = zaiko_map(today, [s for s, _ in stores])
    for scode, to in stores:
        send_mail([to], [SYSTEM_MAIL], '%d月%d日大会倉庫在庫一覧' % (today.month, today.day), taikai_body(scode, stock))
    zj.write_log('report_taikai', xlsm, '正常終了 %d 倉庫' % len(stores))


# ---------------------------------------------------------------- 営業担当の売上

def sales_range(today: datetime.date) -> tuple:
    """3 年前の同じ月の 1 日から、前月末まで（現行と同じ）"""
    return datetime.date(today.year - 3, today.month, 1), today.replace(day=1) - datetime.timedelta(days=1)


def sales_pivot(rows: list) -> tuple:
    """商品 × 売上月 の 数量・金額。(月の並び, [(商品, {月: (数量, 金額)})])"""
    yms = sorted({r['uday'][:7].replace('-', '') for r in rows})
    data = {}
    for r in rows:
        ym = r['uday'][:7].replace('-', '')
        d = data.setdefault(r['gcode'], {})
        s, k = d.get(ym, (0, 0))
        d[ym] = (s + num(r['suu']), k + num(r['kingaku']))
    return yms, sorted(data.items())


def sales_book(rows: list, tname: str, start: datetime.date):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = start.strftime('%Y年%m月以降売上')
    ws.append(['受注先コード', '受注先', '大分類', '部門', '担当者', '伝票区分', '売上日', '売上月', '売上年', '伝票番号', '商品コード', '名称', '数量', '単価', '税抜金額', '備考'])
    for r in sorted(rows, key=lambda r: (r['mcode'], r['uday'], r['denno'])):
        day = r['uday'][:10].replace('-', '')
        ws.append([r['mcode'], r['mname'], r['daibunrui'], r['chubunrui'], tname, '返品' if r['denku'] == 2 else '受注',
                   day, day[:6], day[:4], r['denno'], r['gcode'], r['gtext'], ival(num(r['suu'])), ival(num(r['tanka'])),
                   ival(num(r['kingaku'])), r['mmemo']])
    ws.freeze_panes = 'A2'
    ws.auto_filter.ref = 'A1:P' + str(ws.max_row)
    pv = wb.create_sheet('pivot')
    yms, data = sales_pivot(rows)
    pv.append(['商品コード'] + [x for ym in yms for x in (ym, '')] + ['全体', ''])
    pv.append([''] + ['売上数', '税抜額'] * (len(yms) + 1))
    tot = {}
    for g, d in data:
        line = [g]
        ts, tk = 0, 0
        for ym in yms:
            s, k = d.get(ym, (None, None))
            line += [ival(s), ival(k)]
            if s is not None:
                ts, tk = ts + s, tk + k
                a, b = tot.get(ym, (0, 0))
                tot[ym] = (a + s, b + k)
        pv.append(line + [ival(ts), ival(tk)])
    line = ['総計']
    for ym in yms:
        s, k = tot.get(ym, (0, 0))
        line += [ival(s), ival(k)]
    pv.append(line + [ival(sum(v[0] for v in tot.values())), ival(sum(v[1] for v in tot.values()))])
    pv.freeze_panes = 'B3'
    pv.column_dimensions['A'].width = 20
    return wb


def job_uriage(tcode1: str, to: str) -> None:
    today = datetime.date.today()
    start, end = sales_range(today)
    q = zj.step('msstaff', 'query uriage_staff($id: smallint!, $code: String!) { %s(where: {id: {_eq: $id}, code: {_eq: $code}}) { sei } }'
                % zj.root('msstaff'), {'id': COMP_ID, 'code': tcode1})
    tname = (q['msstaff'][0]['sei'] if q['msstaff'] else tcode1).strip()
    rows = call_func('fsalesdet', {'p_id': COMP_ID, 'p_from': start.isoformat(), 'p_to': end.isoformat(), 'p_tcode1': tcode1},
                     'mcode mname daibunrui chubunrui tcode1 denku denno uday gcode gtext suu tanka kingaku mmemo')
    wb = sales_book(rows, tname, start)
    send_mail([to], [SYSTEM_MAIL], tname + 'さん売上', '掲題の件、添付ご確認ください。', (tname + 'さん売上.xlsx', book_bytes(wb)))
    zj.write_log('report_uriage', tcode1, '正常終了 %d 行' % len(rows))


# ----------------------------------------------------------------

def main() -> int:
    jobs = {'hacchu': (job_hacchu, 2), 'hori': (job_hori, 2), 'zansho': (job_zansho, 1), 'kireru': (job_kireru, 1),
            'taikai': (job_taikai, 1), 'uriage': (job_uriage, 2)}
    if len(sys.argv) < 2 or sys.argv[1] not in jobs or len(sys.argv) != 2 + jobs[sys.argv[1]][1]:
        print(__doc__)
        return 2
    try:
        jobs[sys.argv[1]][0](*sys.argv[2:])
        return 0
    except Exception:
        zj.write_log('report_' + sys.argv[1], '', 'エラー ' + traceback.format_exc().replace('\n', ' '))
        return 1


if __name__ == '__main__':
    sys.exit(main())
