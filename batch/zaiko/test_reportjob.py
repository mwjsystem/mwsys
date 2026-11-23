import datetime
import sys
import types
import unittest

try:
    import openpyxl  # noqa: F401
    HAS_XL = True
except ImportError:
    # openpyxl が無い環境でも、Excel を使わない計算は確かめられるようにする
    HAS_XL = False
    xl = types.ModuleType('openpyxl')
    xl.styles = types.ModuleType('openpyxl.styles')
    xl.styles.Font = object
    sys.modules['openpyxl'] = xl
    sys.modules['openpyxl.styles'] = xl.styles

import reportjob as rj

D = datetime.date


class TestReportJob(unittest.TestCase):
    def test_last_months(self):
        start, end, yms = rj.last_months(D(2026, 11, 23))
        self.assertEqual(start, D(2025, 11, 1))
        self.assertEqual(end, D(2026, 10, 31))
        self.assertEqual(yms[0], '202511')
        self.assertEqual(yms[-1], '202610')
        self.assertEqual(len(yms), 12)
        start, end, yms = rj.last_months(D(2026, 1, 5))
        self.assertEqual((start, end, len(yms)), (D(2025, 1, 1), D(2025, 12, 31), 12))

    def test_calc_hacchu(self):
        yms = ['2025%02d' % m for m in range(1, 13)]
        items = [{'gcode': 'A', 'gtext': 'a', 'lot': 10, 'vcode': '000009', 'vname': '', 'memo': ''},
                 {'gcode': 'B', 'gtext': 'b', 'lot': 10, 'vcode': '000009', 'vname': '', 'memo': ''}]
        syuk = {'A': {ym: 10 for ym in yms}, 'B': {'202501': 12}}
        stock = {('01', 'A'): (5, 2), ('01', 'B'): (10, 0)}
        hatzn = [{'gcode': 'A', 'vcode': '000009', 'day': D(2026, 10, 1), 'denno': 1, 'hatzn': 3},
                 {'gcode': 'A', 'vcode': '000124', 'day': D(2026, 10, 2), 'denno': 2, 'hatzn': 2},
                 {'gcode': 'A', 'vcode': '000009', 'day': D(2018, 1, 1), 'denno': 0, 'hatzn': 1}]
        a, b = rj.calc_hacchu(items, yms, syuk, stock, hatzn)
        self.assertEqual(a['point'], 12.0)
        self.assertEqual(a['kano'], 3)
        self.assertEqual(a['zan'], 6)          # 発注残計は仕入先・日付にかかわらず全部
        self.assertEqual([o['denno'] for o in a['orders']], [1])  # 明細はその仕入先・2019/6/28 以降だけ
        self.assertTrue(a['alert'])            # 3 + 6 < 12
        self.assertEqual(b['point'], 1.2)
        self.assertFalse(b['alert'])

    def test_hori_rows(self):
        items = [{'gcode': 'A', 'gtext': 'a'}]
        hatzn = [{'gcode': 'A', 'vcode': '000009', 'day': D(2026, 10, 1), 'denno': 5, 'hatzn': 3},
                 {'gcode': 'A', 'vcode': '000009', 'day': D(2026, 9, 1), 'denno': 4, 'hatzn': 3},
                 {'gcode': 'X', 'vcode': '000009', 'day': D(2026, 9, 1), 'denno': 3, 'hatzn': 3},
                 {'gcode': 'A', 'vcode': '000124', 'day': D(2026, 9, 1), 'denno': 2, 'hatzn': 3}]
        self.assertEqual([h['denno'] for h in rj.hori_rows(items, hatzn)], [4, 5])

    def test_zansho_rows(self):
        stock = {('01', 'A'): (5, 1), ('01', 'B'): (6, 0)}
        self.assertEqual(rj.zansho_rows(['B', 'A', 'A', 'C'], stock), [('A', 5, 1), ('C', 0, 0)])

    def test_kireru_targets(self):
        goods = {'A': {'tkbn': '0', 'zkbn': '0'}, 'B': {'tkbn': '0', 'zkbn': '0'}, 'C': {'tkbn': '9', 'zkbn': '0'}, 'D': {'tkbn': '0', 'zkbn': '0'}}
        stock = {('01', 'A'): (2, 3), ('01', 'B'): (1, 1), ('01', 'C'): (0, 1), ('01', 'D'): (0, 0),
                 ('01', 'A2'): (5, 0), ('015', 'B'): (0, 0)}
        subs = {'A': ('A2', ''), 'B': ('', '015'), 'C': ('', ''), 'D': ('', '')}
        # A は代わりの A2 に在庫があるので外す。C は中止品
        self.assertEqual(rj.kireru_targets(goods, stock, subs), ['B', 'D'])

    def test_sales_pivot(self):
        rows = [{'uday': '2026-01-05', 'gcode': 'A', 'suu': 2, 'kingaku': 200},
                {'uday': '2026-01-20', 'gcode': 'A', 'suu': -1, 'kingaku': -100},
                {'uday': '2026-02-01', 'gcode': 'B', 'suu': 1, 'kingaku': 50}]
        yms, data = rj.sales_pivot(rows)
        self.assertEqual(yms, ['202601', '202602'])
        self.assertEqual(data, [('A', {'202601': (1, 100)}), ('B', {'202602': (1, 50)})])
        if not HAS_XL:
            return
        wb =rj.sales_book([{**r, 'mcode': '1', 'mname': 'x', 'daibunrui': '', 'chubunrui': '', 'denku': 0, 'denno': 1,
                             'gtext': '', 'tanka': 100, 'mmemo': ''} for r in rows], '竹島', D(2023, 11, 1))
        self.assertEqual(wb.sheetnames, ['2023年11月以降売上', 'pivot'])
        self.assertEqual(wb['pivot'].cell(5, 1).value, '総計')
        self.assertEqual(wb['pivot'].cell(5, 7).value, 150)

    def test_sales_range(self):
        self.assertEqual(rj.sales_range(D(2026, 11, 1)), (D(2023, 11, 1), D(2026, 10, 31)))

    def test_taikai_body(self):
        stock = {('501', 'B'): (2, 0), ('501', 'A'): (1, 0), ('501', 'C'): (0, 0), ('502', 'A'): (9, 0)}
        self.assertEqual(rj.taikai_body('501', stock), '件名時点の在庫数一覧です\nA / 1\nB / 2')


if __name__ == '__main__':
    unittest.main()
