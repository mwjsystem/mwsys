import { Component, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import * as FileSaver from 'file-saver';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { DecimalPipe } from '@angular/common';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { BunruiService } from './../services/bunrui.service';
import { loadExcelJs, excelBuffer } from './../services/busy.service';
import { NyuMember, NyukinService } from './nyukin.service';
import { MISYU_KANOU, MISYU_STATUS, MisyuRec, MisyuRow, MisyuService } from './misyu.service';

/**
 * 未入金管理（売上入金 → 未入金管理）。入金予定日を過ぎて入金残のある受注（都度）・請求伝票（掛売）を一覧にし、
 * 1 件ごとに対応の記録（連絡日・経過・支払予定日・督促状送付・回収可能性・状況）を追記する（現行の Excel「未入金リスト」の代わり）。
 * 入金されれば一覧から消える。支払予定日を過ぎたもの・まだ対応していないものはダッシュボードにも出る
 */
@Component({
  selector: 'app-misyu',
  templateUrl: './misyu.component.html',
  styleUrls: ['./misyu.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, RouterLink, MatToolbar, MatButton, MatIcon, DecimalPipe]
})
export class MisyuComponent implements AfterViewInit {
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  private bunsrv = inject(BunruiService);
  private nyusrv = inject(NyukinService);
  private missrv = inject(MisyuService);
  private route = inject(ActivatedRoute);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  readonly STATUS = MISYU_STATUS;
  readonly KANOU = MISYU_KANOU;
  readonly today = this.usrsrv.formatDate(new Date());

  kind: 'all' | 0 | 1 = 'all';
  from = '2018-01-01';
  to = this.today;
  /** 担当: mine = 自分、'' = すべて、ほかは担当者コード */
  tanto = 'mine';
  /** 絞り込み: open = 対応が要る、overdue = 支払予定日を過ぎた、none = 未対応、closed = 終えた、'' = すべて */
  view: '' | 'open' | 'overdue' | 'none' | 'closed' = 'open';
  pcode = '';
  rows: MisyuRow[] = [];
  members = new Map<string, NyuMember>();
  loaded = false;
  busy = false;
  error = '';

  /** 開いている 1 件と、その記録 */
  cur: MisyuRow | null = null;
  hist: MisyuRec[] = [];
  form: MisyuRec = this.blank();

  constructor() {
    this.title.setTitle('未入金管理(MWSystem)');
    this.bunsrv.qryBunrui().then(() => this.cdRef.detectChanges()).catch(e => console.log('error bunrui', e));
    if (this.stfsrv.tcds.length == 0) {
      this.stfsrv.getStaff().then(() => this.cdRef.detectChanges());
    }
  }

  ngAfterViewInit(): void {
    const q = this.route.snapshot.queryParamMap;
    if (q.get('view')) {
      this.view = q.get('view') as typeof this.view;
    }
    if (q.get('tanto') != null) {
      this.tanto = q.get('tanto') ?? '';
    }
    this.load().then(() => {
      const k = q.get('kind');
      const d = Number(q.get('denno'));
      if (k != null && d) {
        const r = this.rows.find(e => e.kind == Number(k) && e.denno == d);
        if (r) {
          this.select(r);
        }
      }
    });
  }

  private blank(): MisyuRec {
    return { kind: 0, denno: 0, mcode: '', renraku: this.usrsrv.formatDate(new Date()), yotei: null, memo: '', tokusoku: null, kanou: null, status: '対応中' };
  }

  kbnName(k: string, v: string | null): string {
    return v ? ((this.bunsrv.kbn[k] ?? []) as { value: string; viewval: string }[]).find(e => e.value == v)?.viewval ?? v : '';
  }

  name(m: string): string {
    return this.nyusrv.memberName(this.members.get(m));
  }

  staff(c: string | null | undefined): string {
    return c ? this.stfsrv.getName(c) || c : '';
  }

  overdue(r: MisyuRow): boolean {
    return this.missrv.isOverdue(r, this.today);
  }

  get shown(): MisyuRow[] {
    let list = this.rows;
    if (this.tanto == 'mine') {
      list = list.filter(r => this.missrv.isMine(r));
    } else if (this.tanto) {
      list = list.filter(r => r.tcode == this.tanto || r.tcode1 == this.tanto);
    }
    if (this.pcode) {
      list = list.filter(r => r.pcode == this.pcode);
    }
    switch (this.view) {
      case 'open': list = list.filter(r => this.missrv.isOpen(r)); break;
      case 'overdue': list = list.filter(r => this.overdue(r)); break;
      case 'none': list = list.filter(r => !r.last); break;
      case 'closed': list = list.filter(r => !this.missrv.isOpen(r)); break;
    }
    // 支払予定日を過ぎたもの → 未対応 → 入金予定日の古い順
    return [...list].sort((a, b) => (Number(this.overdue(b)) - Number(this.overdue(a))) || (Number(!b.last) - Number(!a.last)) || b.late - a.late);
  }

  get sumZan(): number {
    return this.shown.reduce((a, r) => a + r.zan, 0);
  }

  async load() {
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      const r = await this.missrv.list(this.kind, this.from, this.to);
      this.rows = r.rows;
      this.members = r.members;
      this.loaded = true;
      if (this.cur) {
        this.cur = this.rows.find(e => e.kind == this.cur!.kind && e.denno == this.cur!.denno) ?? null;
      }
    } catch (e) {
      this.error = '読めませんでした：' + (e as Error).message;
      console.log('error misyu', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 1 件を開く（対応の記録を出し、記録の欄を用意する） */
  async select(r: MisyuRow) {
    this.cur = r;
    this.hist = [];
    this.form = { ...this.blank(), kind: r.kind, denno: r.denno, mcode: r.mcode, status: r.last?.status && r.last.status != '完了' ? r.last.status : '対応中', kanou: r.last?.kanou ?? null };
    this.cdRef.detectChanges();
    try {
      this.hist = await this.missrv.history(r.kind, r.denno);
    } catch (e) {
      this.error = '対応の記録を読めませんでした：' + (e as Error).message;
    }
    this.cdRef.detectChanges();
  }

  async addRec() {
    if (!this.cur) {
      return;
    }
    if (!this.form.memo.trim()) {
      this.error = '経過（内容）を入れてください。期限も書いてください';
      return;
    }
    if (this.form.status == '支払予定' && !this.form.yotei) {
      this.error = '支払予定のときは、支払予定日を入れてください';
      return;
    }
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      await this.missrv.add(this.form);
      this.usrsrv.toastSuc((this.cur.kind == 0 ? '受注' : '請求') + this.cur.denno + ' の対応を記録しました');
      const key = this.cur;
      await this.load();
      const r = this.rows.find(e => e.kind == key.kind && e.denno == key.denno);
      if (r) {
        await this.select(r);
      }
    } catch (e) {
      this.error = '記録できませんでした：' + (e as Error).message;
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  openSlip(r: MisyuRow) {
    this.usrsrv.openMst(r.kind == 0 ? 'frmsales' : 'frminvoice', String(r.denno));
  }

  async exportExcel() {
    try {
      const lib = await loadExcelJs();
      const Workbook = lib.Workbook ?? lib.default.Workbook;
      const wb = new Workbook();
      const ws = wb.addWorksheet('未入金');
      ws.addRow(['作成日', this.today, '入金予定日', this.from + '～' + this.to]);
      ws.addRow([]);
      ws.addRow(['区分', '伝票番号', '顧客コード', '氏名', '売上日・締め日', '入金予定日', '経過日数', '請求額', '入金額', '残高', '支払方法', '営業担当', '内勤担当',
        '状況', '連絡日', '支払予定日', '経過', '督促状送付日', '回収可能性', '記録数']);
      for (const r of this.shown) {
        ws.addRow([r.kind == 0 ? '都度' : '掛売', r.denno, r.mcode, this.name(r.mcode), r.day, r.due, r.late, r.total, r.paid, r.zan, this.kbnName('pcode', r.pcode),
          this.staff(r.tcode1), this.staff(r.tcode), r.last?.status ?? '未対応', r.last?.renraku ?? '', r.last?.yotei ?? '', r.last?.memo ?? '',
          r.last?.tokusoku ?? '', r.last?.kanou ?? '', r.last?.cnt ?? 0]);
      }
      ws.getRow(3).font = { bold: true };
      const buf = await excelBuffer(wb);
      FileSaver.saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), '未入金リスト_' + this.today.replace(/-/g, '') + '.xlsx');
    } catch (e) {
      this.error = 'Excel を作れませんでした：' + (e as Error).message;
    }
  }

  get pcodes(): { value: string; viewval: string }[] {
    return (this.bunsrv.kbn['pcode'] ?? []) as { value: string; viewval: string }[];
  }
}
