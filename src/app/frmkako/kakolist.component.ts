import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { DatePipe } from '@angular/common';
import * as FileSaver from 'file-saver';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { StoreService } from './../services/store.service';
import { VendsService } from './../mstvendor/vends.service';
import { loadExcelJs, excelBuffer } from './../services/busy.service';
import { KAKO_KINDS, KAKO_STEPS, KakoFilter, KakoRow, KakoService, stepName } from './kako.service';
import { KAKO_VENDOR_MARKS } from './frmkako.component';

/**
 * 加工指示の一覧（受注関連 → 加工指示一覧。養父刺繍依頼一覧.xlsx の置き換え）。
 * 依頼日・加工先・内勤・状態・伝票番号/顧客/連番で探し、予定納期を過ぎたものに色を付ける。道着・色帯の数と未完成の数を出す。
 * 受注伝票が出荷済（完了）になったものは、開いたときに「出荷済」にする
 */
@Component({
  selector: 'app-kakolist',
  templateUrl: './kakolist.component.html',
  styleUrls: ['./frmkako.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, RouterLink, MatToolbar, MatButton, MatIcon, DatePipe]
})
export class KakolistComponent {
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  strsrv = inject(StoreService);
  vensrv = inject(VendsService);
  private kakosrv = inject(KakoService);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  readonly steps = KAKO_STEPS;
  readonly stepName = stepName;
  f: KakoFilter = { from: '', to: '', dest: '', tcode: '', open: true, status: null, text: '' };
  rows: KakoRow[] = [];
  today = this.usrsrv.formatDate(new Date());
  busy = false;
  error = '';
  message = '';

  constructor() {
    this.title.setTitle('加工指示一覧(MWSystem)');
    const d = new Date();
    d.setMonth(d.getMonth() - 2);
    this.f.from = this.usrsrv.formatDate(d);
    this.strsrv.getStore().then(() => this.cdRef.detectChanges());
    this.vensrv.getVendors().then(() => this.cdRef.detectChanges());
    if (this.stfsrv.tcds.length == 0) {
      this.stfsrv.getStaff().then(() => this.cdRef.detectChanges());
    }
    this.find();
  }

  get vendorDests(): { code: string; name: string }[] {
    return this.vensrv.vends.filter(v => KAKO_VENDOR_MARKS.some(m => (v.adrname ?? '').includes(m))).map(v => ({ code: v.code, name: v.adrname ?? v.code }));
  }

  destName(dtype: string, dcode: string): string {
    return dtype == 'V' ? (this.vensrv.getVcdtxt(dcode) || dcode) : (this.strsrv.scds.find(s => s.value == dcode)?.viewval ?? dcode);
  }

  kindName(v: string): string {
    return KAKO_KINDS.find(k => k.value == v)?.name ?? v;
  }

  due(r: KakoRow): string {
    return r.wishday || r.planday;
  }

  /** 予定納期を過ぎて、まだ加工が済んでいない（加工済・発送の前） */
  late(r: KakoRow): boolean {
    return !r.del && r.status < 4 && !!this.due(r) && this.due(r) < this.today;
  }

  async find() {
    this.busy = true;
    this.error = '';
    this.message = '';
    this.cdRef.detectChanges();
    try {
      this.rows = await this.kakosrv.search(this.f);
      const n = await this.kakosrv.autoShipped(this.rows);
      if (n) {
        this.message = '受注伝票が完了になった ' + n + ' 件を「出荷済」にしました';
        if (this.f.open && !this.f.status) {
          this.rows = this.rows.filter(r => r.status < 6);
        }
      }
    } catch (e) {
      this.error = '加工指示を読めませんでした：' + (e as Error).message;
      console.log('error kakolist', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 品番で分けた数（道着 KU・TU・KD、色帯 CB）と、そのうち加工が済んでいない数 */
  get totals(): { name: string; all: number; open: number }[] {
    const sum = (re: RegExp) => {
      const rs = this.rows.filter(r => !r.del && re.test(r.gcodes));
      return { all: rs.reduce((a, r) => a + r.suu, 0), open: rs.filter(r => r.status < 4).reduce((a, r) => a + r.suu, 0) };
    };
    return [
      { name: '道着', ...sum(/(^|\/)(KU|TU|KD)/) },
      { name: '色帯', ...sum(/(^|\/)CB/) },
      { name: 'すべて', all: this.rows.filter(r => !r.del).reduce((a, r) => a + r.suu, 0), open: this.rows.filter(r => !r.del && r.status < 4).reduce((a, r) => a + r.suu, 0) }
    ];
  }

  get lateCount(): number {
    return this.rows.filter(r => this.late(r)).length;
  }

  stepAt(r: KakoRow, s: number): string {
    return r.steps[s]?.at ?? '';
  }

  open(r: KakoRow) {
    this.usrsrv.openMst('frmkako', String(r.kno));
  }

  openOrder(r: KakoRow, ev: Event) {
    ev.stopPropagation();
    if (r.jdenno) {
      this.usrsrv.openMst('frmsales', String(r.jdenno));
    }
  }

  async exportExcel() {
    try {
      const lib = await loadExcelJs();
      const Workbook = lib.Workbook ?? lib.default.Workbook;
      const wb = new Workbook();
      const ws = wb.addWorksheet('加工指示一覧');
      ws.addRow(['依頼日', '伝票番号', '顧客', '内勤', '商品', '数量', '加工内容', '希望納期', '同梱', '連番', '加工先', '倉庫から発送', '加工先で受取', '加工済・発送', '倉庫で受取', '予定納期', '状態', '加工指示', '備考']);
      const day = (s: string) => (s ? s.slice(0, 10) : '');
      for (const r of this.rows) {
        ws.addRow([r.reqday, r.jdenno ?? '', r.mname, this.stfsrv.getName(r.tcode) || r.tcode, r.gcodes, r.suu, r.naiyo, r.wishday,
          r.doukon ? '有' : '無', r.renban, this.destName(r.dtype, r.dcode), day(this.stepAt(r, 2)), day(this.stepAt(r, 3)),
          day(this.stepAt(r, 4)), day(this.stepAt(r, 5)), this.due(r), (r.del ? '取消 ' : '') + stepName(r.status), r.kno, r.memo]);
      }
      ws.getRow(1).font = { bold: true };
      ws.columns.forEach((c: { width?: number }, i: number) => c.width = [11, 10, 24, 8, 16, 6, 24, 11, 5, 8, 12, 11, 11, 11, 11, 11, 12, 8, 24][i] ?? 10);
      const buf = await excelBuffer(wb);
      FileSaver.saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        '加工指示一覧_' + this.today.replace(/-/g, '') + '.xlsx');
    } catch (e) {
      this.error = 'Excel を作れませんでした：' + (e as Error).message;
      this.cdRef.detectChanges();
    }
  }
}
