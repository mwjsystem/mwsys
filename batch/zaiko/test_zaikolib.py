"""python -m unittest test_zaikolib"""
import datetime
import unittest

import zaikolib as zl

TODAY = datetime.date(2026, 11, 1)


def master():
    g = {
        'A': {'gcode': 'A', 'gskbn': '0', 'zaikohyo': True},
        'B': {'gcode': 'B', 'gskbn': '0', 'zaikohyo': True, 'zh_addsc': '015'},
        'C': {'gcode': 'C', 'gskbn': '0'},
        'D': {'gcode': 'D', 'gskbn': '2'},
        'S': {'gcode': 'S', 'gskbn': '1', 'zaikohyo': True, 'zh_kbn': 'セット'},
        'F': {'gcode': 'F', 'gskbn': '0', 'zaikohyo': True, 'zh_fixed': '○'},
        'H': {'gcode': 'H', 'gskbn': '0', 'zaikohyo': True, 'zh_fixed': '廃盤'},
        'W': {'gcode': 'W', 'gskbn': '1'},
        'J': {'gcode': 'J', 'gskbn': '0', 'zaikohyo': True, 'zh_addg': 'A'},
        'BASE-S': {'gcode': 'BASE-S', 'gskbn': '0'},
    }
    return zl.Master(goods=g, zai={'S': [('A', 1), ('C', 2), ('D', 1)], 'W': [('A', 2)]},
                     stock={('01', 'A'): (5, 1), ('01', 'B'): (2, 3), ('015', 'B'): (4, 0), ('01', 'C'): (7, 0), ('015', 'C'): (3, 0)},
                     hatzn={'B': [(datetime.date(2026, 11, 5), 2), (datetime.date(2026, 11, 25), 3)],
                            'C': [(datetime.date(2027, 3, 15), 4)]},
                     ex={'bara': {'A-S'}, 'except': {'NOPE'}, 'haiban': {'X'}})


class Sheet(unittest.TestCase):
    def test_add_store(self):
        it = zl.build_sheet(master())['B']
        self.assertEqual((it.qty, it.yotei, it.nyu), (3, datetime.date(2026, 11, 5), 2))

    def test_set_is_min_of_stock_components(self):
        it = zl.build_sheet(master())['S']
        self.assertEqual(it.qty, 3)  # A:4、C:7/2=3。D は在庫管理しない
        self.assertEqual(it.yotei, datetime.date(2027, 3, 15))

    def test_set_without_stock_component_date(self):
        m = master()
        m.stock[('01', 'A')] = (0, 0)
        it = zl.build_sheet(m)['S']
        self.assertEqual((it.qty, it.yotei), (0, zl.FAR_DATE))

    def test_fixed_and_add_goods(self):
        s = zl.build_sheet(master())
        self.assertEqual(s['F'].qty, '○')
        self.assertEqual(s['H'].qty, '廃盤')
        self.assertEqual(s['J'].qty, 4)


def row(no, name, code, stock='', order='1', desc='説明', val1='', val2='', vstock='', vcode='', vid=''):
    r = [''] * 20
    r[0], r[1], r[2], r[5], r[6], r[7] = no, name, code, stock, order, desc
    r[11], r[13], r[16], r[18], r[19] = val1, val2, vstock, vcode, vid
    return r


class Products(unittest.TestCase):
    def run_rows(self, rows, m=None):
        m = m or master()
        rows = [['h'] * 20] + rows
        errs = zl.edit_products(rows, m, zl.build_sheet(m), TODAY)
        return rows, errs

    def test_in_stock(self):
        rows, _ = self.run_rows([row('1', 'n', 'A')])
        self.assertEqual((rows[1][zl.C_STOCK], rows[1][zl.C_ORDER], rows[1][zl.C_DESC]), (4, '1', '説明'))

    def test_divide_by_irisu(self):
        rows, _ = self.run_rows([row('1', 'n', 'A@3')])
        self.assertEqual(rows[1][zl.C_STOCK], 1)

    def test_no_stock_near_yotei_keeps_order(self):
        m = master()
        m.stock[('01', 'A')] = (0, 0)
        m.hatzn['A'] = [(datetime.date(2026, 11, 15), 1)]
        rows, _ = self.run_rows([row('1', 'n', 'A')], m)
        self.assertEqual(rows[1][zl.C_ORDER], '1')
        self.assertIn('入荷予定11月中旬頃', rows[1][zl.C_DESC])

    def test_no_stock_far_yotei_stops_order(self):
        m = master()
        m.stock[('01', 'A')] = (0, 0)
        m.hatzn['A'] = [(datetime.date(2027, 3, 25), 1)]
        rows, _ = self.run_rows([row('1', 'n', 'A')], m)
        self.assertEqual(rows[1][zl.C_ORDER], '')
        self.assertIn('3月下旬頃', rows[1][zl.C_DESC])

    def test_no_yotei_and_rerun_replaces_tag(self):
        m = master()
        m.stock[('01', 'A')] = (0, 0)
        rows, _ = self.run_rows([row('1', 'n', 'A')], m)
        self.assertEqual(rows[1][zl.C_ORDER], '')
        self.assertTrue(rows[1][zl.C_DESC].startswith(zl.TAG3))
        again, _ = self.run_rows([rows[1]], master())
        self.assertEqual(again[1][zl.C_DESC], '説明')

    def test_haiban(self):
        rows, _ = self.run_rows([row('1', 'n', 'H')])
        self.assertEqual((rows[1][zl.C_STOCK], rows[1][zl.C_ORDER], rows[1][zl.C_DESC]), (0, '', '説明'))

    def test_web_set_not_in_sheet(self):
        rows, _ = self.run_rows([row('1', 'n', 'W')])
        self.assertEqual(rows[1][zl.C_STOCK], 2)

    def test_bara_uses_base(self):
        rows, _ = self.run_rows([row('1', 'n', 'A-S')])
        self.assertEqual((rows[1][zl.C_STOCK], rows[1][zl.C_ORDER]), (4, ''))

    def test_fallback_adds_sub_store(self):
        rows, _ = self.run_rows([row('1', 'n', 'C')])
        self.assertEqual(rows[1][zl.C_STOCK], 10)

    def test_unknown_code(self):
        rows, errs = self.run_rows([row('1', 'n', 'ZZZ', stock='7'), row('2', 'n', 'NOPE', stock='8')])
        self.assertEqual(errs, ['ZZZ'])
        self.assertEqual(rows[1][zl.C_STOCK], '7')

    def test_variation(self):
        m = master()
        m.stock[('01', 'A')] = (0, 0)
        rows, _ = self.run_rows([row('1', 'n', 'P', val1='赤', vcode='A', vid='v1'), row('1', '', 'P', val1='青', val2='L', vcode='F', vid='v2')], m)
        self.assertEqual(rows[1][zl.C_VSTOCK], 0)
        self.assertEqual(rows[2][zl.C_VSTOCK], 0)
        self.assertEqual(rows[1][zl.C_ORDER], '')
        self.assertIn('【各バリエーション入荷予定】赤：日程調整中、青 L：日程調整中</span>', rows[1][zl.C_DESC])


class Rms(unittest.TestCase):
    def test_find(self):
        m = master()
        s = zl.build_sheet(m)
        self.assertEqual(zl.find_zaiko(m, s, 'A'), 4)
        self.assertEqual(zl.find_zaiko(m, s, 'A_3'), 1)
        self.assertEqual(zl.find_zaiko(m, s, 'A-S'), 4)
        self.assertEqual(zl.find_zaiko(m, s, 'F'), zl.MARU_QTY)
        self.assertEqual(zl.find_zaiko(m, s, 'H'), 0)
        self.assertEqual(zl.find_zaiko(m, s, 'C'), 10)


if __name__ == '__main__':
    unittest.main()
