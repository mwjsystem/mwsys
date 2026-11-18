import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { DecimalPipe, PercentPipe } from '@angular/common';
import { UserService } from './../services/user.service';
import { loadExcelJs } from './../services/busy.service';
import { TANKA_KEYS, TankaKey } from './../mstgoods/goods-const';
import { COL_LABELS, ColMap, DEFAULT_RULES, PriceSrc, SheetLike, TankaRule, findHeader, guessCols, readPrices, sheetCells, yen } from './price-parse';
import { CurGoods, NewTanka, PriceService } from './price.service';

/** 1 商品の取り込み結果 */
interface ImpRow {
  src: PriceSrc;
  m: CurGoods | null;
  next: Record<TankaKey, number> | null;
  /** missing: マスタに無い / noprice: 新定価が無い / new: 今の単価が無い / up・down: 定価の上げ下げ / chg: 定価は同じで卸価格が変わる / same: 変更なし */
  status: 'missing' | 'noprice' | 'new' | 'up' | 'down' | 'chg' | 'same';
  on: boolean;
}

const STATUS_TEXT: Record<ImpRow['status'], string> = {
  missing: 'マスタに無い', noprice: '新定価なし', new: '単価なし→新規', up: '値上げ', down: '値下げ', chg: '卸価格の変更', same: '変更なし'
};

/**
 * 価格改定取込（各マスタ → 価格改定取込）。年 1 回のカタログの価格改定で、全情報リストの Excel を読み、
 * 適用開始日の単価の行を商品マスタ（msgtanka）に足す。古い単価は残るので、適用開始日より前の受注は旧価格のまま。
 * 取り込む前に、今の単価と新しい単価・掛率を並べて確かめる。変更は商品マスタの操作ログに残る（DB のトリガー）
 */
@Component({
  selector: 'app-priceimp',
  templateUrl: './priceimp.component.html',
  styleUrls: ['./mstprice.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, RouterLink, MatToolbar, MatButton, MatIcon, DecimalPipe, PercentPipe]
})
export class PriceimpComponent {
  usrsrv = inject(UserService);
  private prcsrv = inject(PriceService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  readonly keys = TANKA_KEYS;
  readonly colKeys = Object.keys(COL_LABELS) as (keyof ColMap)[];
  readonly colLabels = COL_LABELS;
  readonly statusText = STATUS_TEXT;

  fileName = '';
  /** 読んだ Excel のシート（見出しの行・列・セル） */
  sheets: { name: string; cells: string[][]; header: number }[] = [];
  sheet = '';
  cols: ColMap = guessCols([]);
  headers: string[] = [];
  rules: Record<TankaKey, TankaRule> = { ...DEFAULT_RULES };
  day = '';
  setPage = true;
  rows: ImpRow[] = [];
  filter: '' | 'chg' | 'missing' | 'same' = 'chg';
  busy = false;
  error = '';
  message = '';
  done = 0;

  constructor() {
    this.title.setTitle('価格改定取込(MWSystem)');
    // 一番近い来月 1 日を初期値にする（カタログの改定は月初めから）
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 1);
    this.day = this.usrsrv.formatDate(d);
  }

  tankaName(k: string): string {
    const sys = this.usrsrv.system as unknown as Record<string, string> | undefined;
    return String(sys?.['tnk' + k.slice(5) + 'txt'] ?? k);
  }

  /** 単価の列のうち、決め方を画面に出す列（「不使用」は出さない） */
  get usedKeys(): TankaKey[] {
    return this.keys.filter(k => !this.tankaName(k).includes('不使用'));
  }

  /** 表に出す単価の列（今の値のままの列は出さない） */
  get shownKeys(): TankaKey[] {
    return this.usedKeys.filter(k => k != 'tanka1' && this.rules[k] != 'keep');
  }

  async onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) {
      return;
    }
    this.busy = true;
    this.error = '';
    this.message = '';
    this.rows = [];
    this.sheets = [];
    this.cdRef.detectChanges();
    try {
      const lib = await loadExcelJs();
      const ExcelJS = (lib as unknown as { default?: typeof lib }).default ?? lib;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await f.arrayBuffer());
      wb.eachSheet(ws => {
        const s = ws as unknown as SheetLike;
        if (s.state && s.state != 'visible') {
          return;
        }
        const cells = sheetCells(s);
        this.sheets.push({ name: s.name, cells, header: findHeader(cells) });
      });
      this.fileName = f.name;
      const first = this.sheets.find(s => s.header >= 0);
      if (!first) {
        throw new Error('「品番詳細」の見出しがあるシートが見つかりません');
      }
      this.selectSheet(first.name);
    } catch (e) {
      this.error = 'Excel を読めませんでした：' + (e as Error).message;
      console.log('error priceimp file', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  private get cur() {
    return this.sheets.find(s => s.name == this.sheet);
  }

  /** シートの付いている見出しの行（全情報リストのシートだけ選べる） */
  get usableSheets() {
    return this.sheets.filter(s => s.header >= 0);
  }

  selectSheet(name: string) {
    this.sheet = name;
    const s = this.cur;
    this.headers = s && s.header >= 0 ? s.cells[s.header] : [];
    this.cols = guessCols(this.headers);
    this.rows = [];
    this.message = '';
  }

  colText(i: number): string {
    if (i < 0) {
      return '（無し）';
    }
    const letter = (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + (i % 26));
    return letter + '列 ' + (this.headers[i] ?? '');
  }

  /** 全情報リストを読み、商品マスタと突き合わせる */
  async check() {
    const s = this.cur;
    if (!s || s.header < 0) {
      return;
    }
    if (this.cols.gcode < 0 || this.cols.teika < 0) {
      this.error = '品番詳細（商品コード）と新定価（税抜）の列を選んでください';
      return;
    }
    if (!this.day) {
      this.error = '適用開始日を入れてください';
      return;
    }
    this.busy = true;
    this.error = '';
    this.message = '';
    this.cdRef.detectChanges();
    try {
      const src = readPrices(s.cells, s.header, this.cols);
      // 同じ商品コードが 2 回あるときは後の行
      const byCode = new Map(src.map(r => [r.gcode, r]));
      const master = await this.prcsrv.current([...byCode.keys()], this.day);
      this.rows = [...byCode.values()].map(r => this.build(r, master.get(r.gcode) ?? null));
      this.filter = 'chg';
      const cnt = (st: ImpRow['status']) => this.rows.filter(r => r.status == st).length;
      this.message = this.rows.length + ' 商品を読みました（値上げ ' + cnt('up') + '・値下げ ' + cnt('down') + '・卸価格の変更 ' + cnt('chg') + '・単価なし ' + cnt('new')
        + '・変更なし ' + cnt('same') + '・マスタに無い ' + cnt('missing') + '・新定価なし ' + cnt('noprice') + '）';
    } catch (e) {
      this.error = '突き合わせできませんでした：' + (e as Error).message;
      console.log('error priceimp check', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 決め方に従って新しい単価を作る */
  private build(src: PriceSrc, m: CurGoods | null): ImpRow {
    if (!m) {
      return { src, m, next: null, status: 'missing', on: false };
    }
    if (!src.teika) {
      return { src, m, next: null, status: 'noprice', on: false };
    }
    const cur = m.cur;
    const curTeika = cur ? cur.tanka1 / 1.1 : 0;
    const next = {} as Record<TankaKey, number>;
    for (const k of this.keys) {
      const rule = this.rules[k];
      const old = cur?.[k] ?? 0;
      let v: number | null = null;
      if (rule == 'teika') {
        v = src.teika * 1.1;
      } else if (rule == 'dojo' || rule == 'hojin' || rule == 'fc') {
        v = src[rule];
      } else if (rule == 'rate') {
        v = curTeika > 0 && old > 0 ? src.teika * (old / curTeika) : old;
      }
      next[k] = v == null ? old : yen(v);
    }
    const status: ImpRow['status'] = !cur ? 'new'
      : next.tanka1 > cur.tanka1 ? 'up' : next.tanka1 < cur.tanka1 ? 'down'
      : this.keys.every(k => next[k] == cur[k]) ? 'same' : 'chg';
    return { src, m, next, status, on: status != 'same' };
  }

  /** 単価の決め方を変えたら作り直す */
  rebuild() {
    if (this.rows.length) {
      this.rows = this.rows.map(r => {
        const n = this.build(r.src, r.m);
        return n;
      });
    }
  }

  get shown(): ImpRow[] {
    switch (this.filter) {
      case 'chg': return this.rows.filter(r => r.status == 'up' || r.status == 'down' || r.status == 'chg' || r.status == 'new');
      case 'missing': return this.rows.filter(r => r.status == 'missing' || r.status == 'noprice');
      case 'same': return this.rows.filter(r => r.status == 'same');
      default: return this.rows;
    }
  }

  get checked(): ImpRow[] {
    return this.rows.filter(r => r.on && r.next && r.m);
  }

  setAll(on: boolean) {
    this.shown.forEach(r => r.on = on && !!r.next);
  }

  rate(r: ImpRow, k: TankaKey, which: 'cur' | 'next'): number | null {
    const t = which == 'cur' ? r.m?.cur : r.next;
    if (!t || !t.tanka1 || !t[k]) {
      return null;
    }
    return t[k] / (t.tanka1 / 1.1);
  }

  /** 今の単価から変わったか */
  diff(r: ImpRow, k: TankaKey): boolean {
    return !!r.next && (r.m?.cur?.[k] ?? 0) != r.next[k];
  }

  async save() {
    const rows = this.checked;
    if (rows.length == 0) {
      return;
    }
    const same = rows.filter(r => r.m?.same).length;
    if (!confirm(rows.length + ' 商品の単価を、適用開始日 ' + this.day + ' で商品マスタに入れます。'
      + (same ? '\nうち ' + same + ' 商品は同じ日の単価があるので上書きします。' : '')
      + '\n古い単価は残ります（' + this.day + ' より前の受注は旧価格）。よろしいですか？')) {
      return;
    }
    // 頁はグループごと（全情報リストで最初に出てきた頁）
    const pages = new Map<string, number>();
    if (this.setPage) {
      for (const r of rows) {
        if (r.src.page != null && r.m && !pages.has(r.m.code)) {
          pages.set(r.m.code, r.src.page);
        }
      }
    }
    const data: NewTanka[] = rows.map(r => ({ gcode: r.src.gcode, code: r.m!.code, tanka: r.next!, base: r.m!.cur }));
    this.busy = true;
    this.error = '';
    this.done = 0;
    this.cdRef.detectChanges();
    try {
      const n = await this.prcsrv.importPrices(this.day, data, pages, d => { this.done = d; this.cdRef.detectChanges(); });
      this.usrsrv.toastSuc(n + ' 商品の単価を入れました');
      this.message = n + ' 商品の単価を、適用開始日 ' + this.day + ' で入れました。' + (pages.size ? pages.size + ' グループの頁を入れました。' : '');
      this.rows = [];
    } catch (e) {
      this.error = '単価を入れられませんでした：' + (e as Error).message;
      console.log('error priceimp save', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
