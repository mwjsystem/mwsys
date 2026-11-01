"""在庫連携のバッチ（現行の ★MW在庫表.xlsm の置き換え）。

  python zaikojob.py list  <MW在庫一覧.xlsx>                     ①在庫表を作る
  python zaikojob.py csv   <products.csv>                        ②おちゃのこの CSV を更新する
  python zaikojob.py rms   <normal-item.xlsx> <normal-item.csv> <goods_stock.csv>   ③在庫数を更新する
  python zaikojob.py barra                                       BARRA 在庫一覧をメールで送る

環境変数
  MWSYS_HASURA_URL     省略時は本番の Hasura
  MWSYS_HASURA_SECRET  admin secret（必須）
  MWSYS_SCHEMA         test なら test スキーマを読む。省略時は public
  MWSYS_LOG            ログファイル。省略時は標準出力のみ
  MWSYS_SMTP_USER      barra のメール送信のユーザー
  MWSYS_SMTP_PASSWORD  barra のメール送信のパスワード
"""
import datetime
import json
import os
import smtplib
import sys
import tempfile
import traceback
import urllib.request
from email.message import EmailMessage

import openpyxl

import zaikolib as zl

COMP_ID = 1
DEFAULT_URL = 'https://mwjtables.herokuapp.com/v1/graphql'
SMTP_HOST = 'mwjapan.sakura.ne.jp'
SMTP_PORT = 587
MAIL_FROM = 'asagosoko@mwjapan.jp'
BARRA_TO = ['kawaguchi@mwjapan.jp', 'onoyama@mwjapan.jp']
BARRA_CC = ['system@mwjapan.jp']
XLSX_TYPE = ('application', 'vnd.openxmlformats-officedocument.spreadsheetml.sheet')


def write_log(job: str, par: str, msg: str) -> None:
    line = datetime.datetime.now().strftime('%Y/%m/%d %H:%M:%S') + ',' + job + ',' + par + ',' + msg
    print(line)
    path = os.environ.get('MWSYS_LOG')
    if path:
        with open(path, 'a', encoding='cp932', errors='replace') as f:
            f.write(line + '\n')


def gql(query: str, variables: dict) -> dict:
    req = urllib.request.Request(
        os.environ.get('MWSYS_HASURA_URL', DEFAULT_URL),
        data=json.dumps({'query': query, 'variables': variables}).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'x-hasura-admin-secret': os.environ['MWSYS_HASURA_SECRET']})
    with urllib.request.urlopen(req, timeout=60) as res:
        body = json.load(res)
    if body.get('errors'):
        raise RuntimeError(json.dumps(body['errors'], ensure_ascii=False))
    return body['data']


def root(name: str) -> str:
    """test スキーマの root field は test_ が付く（アプリの graphql.module と同じ）"""
    return name + ': test_' + name if os.environ.get('MWSYS_SCHEMA') == 'test' else name


def load_master(today: datetime.date) -> zl.Master:
    q = '''
    query zaiko($id: smallint!, $sc: String!, $day: date!, $args: %(fn_args)s!) {
      %(msgoods)s(where: {id: {_eq: $id}}) {
        gcode gtext gskbn tkbn zkbn zh_barra zaikohyo zh_sort zh_fixed zh_kbn zh_addsc zh_addg zh_sku zh_jan zh_name zh_color zh_size zh_send zh_note
        msgtankas(limit: 1, where: {day: {_lte: $day}}, order_by: {day: desc}) { tanka1 }
      }
      %(msgzai)s(where: {id: {_eq: $id}}) { gcode zcode irisu }
      %(mszaikoex)s(where: {id: {_eq: $id}}) { kbn gcode }
      %(vhatzn)s(where: {id: {_eq: $id}, scode: {_eq: $sc}, hatzn: {_gt: 0}, inday: {_is_null: false}},
                 order_by: [{gcode: asc}, {inday: asc}]) { gcode inday hatzn }
      %(fzaikoall)s(args: $args) { scode gcode zaiko juzan }
    }''' % {
        'msgoods': root('msgoods'), 'msgzai': root('msgzai'), 'mszaikoex': root('mszaikoex'),
        'vhatzn': root('vhatzn'), 'fzaikoall': root('fzaikoall'),
        'fn_args': ('test_' if os.environ.get('MWSYS_SCHEMA') == 'test' else '') + 'fzaikoall_args',
    }
    d = gql(q, {'id': COMP_ID, 'sc': zl.MAIN_SCODE, 'day': today.isoformat(), 'args': {'p_id': COMP_ID, 'p_day': today.isoformat()}})
    m = zl.Master(goods={g['gcode']: g for g in d['msgoods']})
    for z in d['msgzai']:
        m.zai.setdefault(z['gcode'], []).append((z['zcode'], float(z['irisu'])))
    for e in d['mszaikoex']:
        m.ex.setdefault(e['kbn'], set()).add(e['gcode'])
    for h in d['vhatzn']:
        m.hatzn.setdefault(h['gcode'], []).append((datetime.date.fromisoformat(h['inday'][:10]), float(h['hatzn'])))
    for s in d['fzaikoall']:
        m.stock[(s['scode'], s['gcode'])] = (float(s['zaiko']), float(s['juzan']))
    return m


def teika(g: dict):
    """定価（税抜）"""
    t = g.get('msgtankas') or []
    n = float(t[0]['tanka1'] or 0) if t else 0
    return round(n * 10 / 11) if n else None


def save_book(wb, path: str) -> None:
    """途中のファイルが見えないように、書き終えてから置き換える"""
    fd, tmp = tempfile.mkstemp(suffix='.xlsx', dir=os.path.dirname(os.path.abspath(path)))
    os.close(fd)
    try:
        wb.save(tmp)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def job_list(path: str) -> None:
    today = datetime.date.today()
    m = load_master(today)
    sheet = zl.build_sheet(m)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = '在庫表'
    now = datetime.datetime.now().strftime('%Y/%m/%d %H:%M:%S')
    ws.append(['ＳＫＵ', 'JANコード', 'メーカー品番', '商品名', 'カラー', 'size/oz', '定価\n(税抜)', '在庫数', '送料区分',
               now + '時点', '入荷予定日　※あくまで目安になります', '入荷数'])
    for gcode, it in sheet.items():
        g = m.goods[gcode]
        qty = int(it.qty) if isinstance(it.qty, (int, float)) else it.qty
        yotei = zl.calc_yotei(it.yotei, gcode, m) if it.yotei else None
        ws.append([g.get('zh_sku'), g.get('zh_jan'), gcode, g.get('zh_name'), g.get('zh_color'), g.get('zh_size'), teika(g),
                   qty, it.send, g.get('zh_note'), yotei, int(it.nyu) if it.nyu else None])
    ws.freeze_panes = 'A2'
    ws.auto_filter.ref = 'B1:L' + str(ws.max_row)
    ws.column_dimensions['A'].hidden = True
    for col, width in {'B': 15, 'C': 18, 'D': 45, 'E': 8, 'F': 8, 'G': 8, 'H': 8, 'I': 14, 'J': 24, 'K': 22, 'L': 8}.items():
        ws.column_dimensions[col].width = width
    save_book(wb, path)
    write_log('zaiko_list', path, '正常終了 ' + str(len(sheet)) + ' 件')


def job_csv(path: str) -> None:
    today = datetime.date.today()
    m = load_master(today)
    rows = zl.read_csv(path)
    errors = zl.edit_products(rows, m, zl.build_sheet(m), today)
    zl.write_csv(path, rows)
    write_log('zaiko_csv', path, '正常終了' + (' 品番エラー ' + ','.join(sorted(set(errors))) if errors else ''))


def job_rms(xlsx: str, item_csv: str, ana_csv: str) -> None:
    m = load_master(datetime.date.today())
    sheet = zl.build_sheet(m)
    wb = openpyxl.load_workbook(xlsx)
    ws = wb['normal-item']
    prev = None
    for row in ws.iter_rows(min_row=2):
        if row[0].value in (None, ''):
            break
        if row[4].value not in (None, ''):
            code = row[3].value if row[3].value not in (None, '') else prev
            row[4].value = zl.find_zaiko(m, sheet, code)
        prev = row[1].value
    zl.write_csv(item_csv, [['' if v is None else v for v in r] for r in ws.iter_rows(values_only=True)])
    save_book(wb, xlsx)
    rows = zl.read_csv(ana_csv)
    for r in rows[1:]:
        if r:
            r[1] = zl.find_zaiko(m, sheet, r[0][5:])
    zl.write_csv(ana_csv, rows)
    write_log('zaiko_rms', '', '正常終了')


def barra_mail(today: datetime.date, xlsx: str) -> EmailMessage:
    msg = EmailMessage()
    msg['From'] = MAIL_FROM
    msg['To'] = ', '.join(BARRA_TO)
    msg['Cc'] = ', '.join(BARRA_CC)
    msg['Subject'] = today.strftime('%Y%m%d') + 'BARRA在庫一覧'
    msg.set_content('掲題の件、添付の通りです')
    with open(xlsx, 'rb') as f:
        msg.add_attachment(f.read(), maintype=XLSX_TYPE[0], subtype=XLSX_TYPE[1], filename='BARRA在庫.xlsx')
    return msg


def job_barra() -> None:
    today = datetime.date.today()
    rows = zl.build_barra(load_master(today))
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'BARRA在庫'
    ws.append(['商品コード', '商品名称', '受注可'])
    for r in rows:
        ws.append(r)
    ws.column_dimensions['A'].width = 20
    ws.column_dimensions['B'].width = 50
    with tempfile.TemporaryDirectory() as d:
        xlsx = os.path.join(d, 'BARRA在庫.xlsx')
        wb.save(xlsx)
        msg = barra_mail(today, xlsx)
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=60) as s:
        s.starttls()
        s.login(os.environ['MWSYS_SMTP_USER'], os.environ['MWSYS_SMTP_PASSWORD'])
        s.send_message(msg)
    write_log('zaiko_barra', '', '正常終了 ' + str(len(rows)) + ' 件')


def main() -> int:
    jobs = {'list': (job_list, 1), 'csv': (job_csv, 1), 'rms': (job_rms, 3), 'barra': (job_barra, 0)}
    if len(sys.argv) < 2 or sys.argv[1] not in jobs or len(sys.argv) != 2 + jobs[sys.argv[1]][1]:
        print(__doc__)
        return 2
    try:
        jobs[sys.argv[1]][0](*sys.argv[2:])
        return 0
    except Exception:
        write_log('zaiko_' + sys.argv[1], '', 'エラー ' + traceback.format_exc().replace('\n', ' '))
        return 1


if __name__ == '__main__':
    sys.exit(main())
