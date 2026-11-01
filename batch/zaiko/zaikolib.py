"""在庫表の計算と、ファイルの書き換え（現行の ★MW在庫表.xlsm の main / Make_csv / Edit_rms）。

DB に触らない処理だけを置く。読み込みと実行は zaikojob.py。
"""
import csv
import datetime
import math
import re
from dataclasses import dataclass, field

MAIN_SCODE = '01'
#: 在庫表に無い商品の在庫に加算する倉庫（マクロの Find_Zaiko）
SUB_SCODE = '015'
FAR_DATE = datetime.date(9999, 12, 31)
#: 在庫なしで「在庫が0でも注文を受け付ける」を外す入荷予定までの日数
ORDER_DAYS = 90
#: 固定表示「○」を③のファイルに出す数
MARU_QTY = 99999

S_TAG = '＝＝</span></strong></p>'
LINE = '＝' * 35
TAG1 = '<p><strong><span style="color: #ff0000;">' + LINE + '</span></strong><br /><span style="color: #ff0000;"> '
TAG2 = ('</span></strong><br /><span style="color: #000000;"> ※入荷予定は変更となる場合がございますのでご了承下さい。</span>'
        '<br /><span style="color: #000000;"> 　入荷次第発送とさせて頂きますので、入荷予定を考慮してご注文をお願い致します。</span>'
        '<br /><strong><span style="color: #ff0000;">' + LINE + '</span></strong></p>')
TAG3 = ('<p>&nbsp;</p><p><strong><span style="color: #ff0000;">' + LINE + '</span></strong><br />'
        '<strong><span style="color: #ff0000;"> 入荷日程調整中です。</span></strong><br /> 　詳細が分かり次第、'
        'ホームページを更新いたしますので、しばらくお待ちください。<br /><strong><span style="color: #ff0000;">'
        + LINE + '</span></strong></p>')

# products.csv の列
C_NO, C_NAME, C_CODE = 0, 1, 2
C_STOCK, C_ORDER, C_DESC = 5, 6, 7
C_VAL1, C_VAL2 = 11, 13
C_VSTOCK, C_VCODE, C_VID = 16, 18, 19


@dataclass
class Item:
    gcode: str
    #: 数値、または固定表示の '○' / '廃盤'
    qty: object
    yotei: datetime.date | None = None
    nyu: int | None = None
    kbn: str = ''
    send: str = ''


@dataclass
class Master:
    """goods: gcode → msgoods の行、zai: gcode → [(zcode, irisu)]、stock: (scode, gcode) → (在庫, 受注残)、
    hatzn: gcode → 入荷予定日の昇順 [(日付, 数)]、ex: 区分 → コードの集合"""
    goods: dict
    zai: dict = field(default_factory=dict)
    stock: dict = field(default_factory=dict)
    hatzn: dict = field(default_factory=dict)
    ex: dict = field(default_factory=dict)

    def free(self, gcode: str, scode: str = MAIN_SCODE) -> float:
        z = self.stock.get((scode, gcode), (0, 0))
        return z[0] - z[1]

    def in_ex(self, kbn: str, gcode: str) -> bool:
        return gcode in self.ex.get(kbn, ())


def find_yotei(m: Master, gcode: str, stock: float) -> tuple:
    """入荷予定を早い順に足して、在庫がプラスになる便の日付と数を返す"""
    day, nyu = None, None
    for d, n in m.hatzn.get(gcode, ()):
        day, nyu = d, n
        stock += n
        if stock > 0:
            break
    return day, nyu


def set_item(m: Master, gcode: str) -> Item:
    """セット品：在庫管理する内訳のうち、組める数の最小値"""
    qtys, days = [], []
    for zcode, irisu in m.zai.get(gcode, ()):
        if m.goods.get(zcode, {}).get('gskbn') != '0' or irisu <= 0:
            continue
        free = m.free(zcode)
        qtys.append(math.floor(max(free, 0) / irisu))
        day = find_yotei(m, zcode, free)[0]
        if day is None and free < 1:
            day = FAR_DATE
        if day:
            days.append(day)
    return Item(gcode, min(qtys) if qtys else 0, max(days) if days else None)


def calc_item(m: Master, g: dict) -> Item:
    """在庫表の 1 行（マクロの main）"""
    gcode, kbn = g['gcode'], g.get('zh_kbn') or ''
    if g.get('zh_fixed'):
        return Item(gcode, g['zh_fixed'], kbn=kbn, send=g.get('zh_send') or '')
    if kbn in ('セット', 'SB'):
        it = set_item(m, gcode)
    else:
        free = m.free(gcode)
        if g.get('zh_addsc'):
            free += m.free(gcode, g['zh_addsc'])
        if g.get('zh_addg'):
            add = m.goods.get(g['zh_addg'])
            q = calc_item(m, add).qty if add and add.get('zaikohyo') else m.free(g['zh_addg'])
            free += q if isinstance(q, (int, float)) else 0
        day, nyu = find_yotei(m, gcode, free)
        it = Item(gcode, max(free, 0), day, nyu)
    it.kbn, it.send = kbn, g.get('zh_send') or ''
    return it


def build_sheet(m: Master) -> dict:
    rows = sorted((g for g in m.goods.values() if g.get('zaikohyo')), key=lambda g: (g.get('zh_sort') or 0, g['gcode']))
    return {g['gcode']: calc_item(m, g) for g in rows}


def build_barra(m: Master) -> list:
    """BARRA 在庫一覧の行（マクロの Make_Barra）。在庫は BARRA の倉庫のみ"""
    rows = [g for g in m.goods.values() if g.get('zh_barra') and g.get('zkbn') == '0' and g.get('tkbn') == '0']
    return [[g['gcode'], g.get('gtext'), int(m.free(g['gcode'], SUB_SCODE))] for g in sorted(rows, key=lambda g: g['gcode'])]


def calc_yotei(yotei, gcode: str, m: Master) -> str:
    """入荷予定の文言（上旬・中旬・下旬）"""
    if yotei == FAR_DATE or not isinstance(yotei, datetime.date):
        return '廃番' if m.in_ex('haiban', gcode) else '日程調整中'
    term = '上旬頃' if yotei.day < 11 else '中旬頃' if yotei.day < 21 else '下旬頃'
    return str(yotei.month) + '月' + term


def split_code(code: str) -> tuple:
    """「品番@入数」を分ける"""
    parts = re.split('[@＠]', code, maxsplit=1)
    return parts[0], (int(parts[1]) if len(parts) > 1 else None)


def tail(desc: str) -> str:
    """説明から、前回つけた入荷予定の枠を除く"""
    return desc.replace(S_TAG, '＿').split('＿')[-1]


def lookup(m: Master, sheet: dict, gds: str, errors: list) -> tuple:
    """products.csv の品番の、在庫・入荷予定・廃盤か。在庫を更新しない品番は在庫が None"""
    code = gds.strip()
    it = sheet.get(code)
    if it:
        qty = it.qty if isinstance(it.qty, (int, float)) else -99 if it.qty == '○' else 0
        return qty, it.yotei, it.kbn == '廃番' or it.qty == '廃盤'
    if m.zai.get(code) and m.goods.get(code, {}).get('gskbn') == '1':
        s = set_item(m, code)
        return s.qty, s.yotei, False
    if m.in_ex('bara', code):
        base = sheet.get(code[:-2])
        if base:
            return base.qty if isinstance(base.qty, (int, float)) else 0, None, True
        return m.free(code[:-2]) + m.free(code[:-2], SUB_SCODE), None, True
    if code not in m.goods:
        if not m.in_ex('except', code):
            errors.append(code)
        return None, None, False
    free = m.free(code) + m.free(code, SUB_SCODE)
    return free, find_yotei(m, code, free)[0], False


def edit_products(rows: list, m: Master, sheet: dict, today: datetime.date) -> list:
    """products.csv の在庫数・注文可否・説明を更新する（マクロの Make_csv）。戻り値は品番エラー"""
    errors: list = []
    parents: dict = {}
    for i, r in enumerate(rows):
        if i == 0 or not r[C_NO]:
            continue
        vari = r[C_VID] != ''
        gds, iri = split_code(r[C_VCODE] if vari else r[C_CODE])
        if vari and r[C_NAME] != '' and r[C_NO] not in parents:
            parents[r[C_NO]] = {'row': r, 'tag': ''}
        qty, yotei, haiban = lookup(m, sheet, gds, errors)
        if qty is None:
            continue
        qty = max(qty, 0)
        if iri:
            qty = math.floor(qty / iri)
        qty = int(qty)
        code = gds.strip()
        far = yotei is not None and (yotei - today).days > ORDER_DAYS
        if not vari:
            r[C_STOCK] = qty
            body = tail(r[C_DESC])
            if haiban:
                r[C_ORDER], r[C_DESC] = '', body
            elif qty < 1 and yotei:
                r[C_DESC] = TAG1 + '入荷予定' + calc_yotei(yotei, code, m) + TAG2 + body
                if far:
                    r[C_ORDER] = ''
            elif qty < 1:
                r[C_ORDER], r[C_DESC] = '', TAG3 + body
            else:
                r[C_DESC] = body
        else:
            p = parents.get(r[C_NO])
            if p is not None and not (haiban or m.in_ex('except', code)) and qty < 1:
                text = calc_yotei(yotei, code, m)
                if iri:
                    if r[C_VAL1] not in p['tag']:
                        p['tag'] += r[C_VAL1] + '：' + text + '、'
                else:
                    name = r[C_VAL1] + (' ' + r[C_VAL2] if r[C_VAL2] else '')
                    p['tag'] += name + '：' + text + '、'
            r[C_VSTOCK] = qty
    for p in parents.values():
        r = p['row']
        r[C_ORDER] = ''
        body = tail(r[C_DESC])
        r[C_DESC] = TAG1 + '【各バリエーション入荷予定】' + p['tag'][:-1] + TAG2 + body if p['tag'] else body
    return errors


def find_zaiko(m: Master, sheet: dict, code: str) -> int:
    """③のファイルの在庫数（マクロの Find_Zaiko）。「品番_入数」は入数で割る"""
    code = str(code).strip()
    if m.in_ex('bara', code):
        code = code[:-2]
    iri = 1
    if '_' in code:
        code, n = code.split('_', 1)
        iri = int(n)
    it = sheet.get(code)
    if it:
        if isinstance(it.qty, (int, float)):
            return int(it.qty // iri)
        return MARU_QTY if it.qty == '○' else 0
    return max(int((m.free(code) + m.free(code, SUB_SCODE)) // iri), 0)


def read_csv(path: str) -> list:
    with open(path, encoding='cp932', newline='') as f:
        return list(csv.reader(f))


def write_csv(path: str, rows: list) -> None:
    with open(path, 'w', encoding='cp932', newline='') as f:
        csv.writer(f, lineterminator='\r\n').writerows(rows)
