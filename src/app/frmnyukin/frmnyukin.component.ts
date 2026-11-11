import { Component, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { DecimalPipe } from '@angular/common';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { BunruiService } from './../services/bunrui.service';
import { ClosedayService } from './../services/closeday.service';
import { McdhelpComponent } from './../share/mcdhelp/mcdhelp.component';
import { OpelogComponent, OpelogParam } from './../share/opelog/opelog.component';
import { OnBeforeunload } from './../beforeunload.guard';
import { EXTYPE_NYUKIN, NyuInvoice, NyuKubun, NyuMember, NyuOrder, NyuRow, NyuSlip, NyukinService, nyuState } from './nyukin.service';
import { NyuhelpComponent } from './nyuhelp.component';

/** 明細の行数の上限（現行と同じ） */
const MAX_LINES = 5;

/**
 * 入金伝票（売上入金 → 入金伝票）。都度（受注ごと）と掛売（請求先ごと）の入金伝票を 1 つの画面で入れる。
 *   ・都度: 受注伝票を入れると、売上額・入金済・入金残と、ほかの入金伝票が出る
 *   ・掛売: 請求先を入れ、消込先の請求伝票を選ぶ（締め処理で、入金日の後の最初の締めの入金額に計上される）
 * 保存すると受注・請求の入金残と状況（未入金・一部入金・入金済・過入金）が変わり、操作ログに残る。
 * 取消（論理削除）できる。締め処理で計上済の掛売の入金と、締め日以前の入金は変えられない
 */
@Component({
  selector: 'app-frmnyukin',
  templateUrl: './frmnyukin.component.html',
  styleUrls: ['./frmnyukin.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    '(window:beforeunload)': 'beforeUnload($event)'
  },
  imports: [FormsModule, RouterLink, MatToolbar, MatButton, MatIconButton, MatIcon, MatTooltip, DecimalPipe]
})
export class FrmnyukinComponent implements AfterViewInit, OnBeforeunload {
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  bunsrv = inject(BunruiService);
  private closesrv = inject(ClosedayService);
  private nyusrv = inject(NyukinService);
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  /** 1 = 新規、2 = 変更、3 = 照会 */
  mode = 3;
  dno = 0;
  s: NyuSlip = this.nyusrv.blank(0);
  /** 読み込んだときの伝票（入金残の計算・中止で戻すため） */
  private saved: NyuSlip | null = null;
  order: NyuOrder | null = null;
  invoice: NyuInvoice | null = null;
  /** 掛売: 請求先の請求伝票（消込先の選択肢） */
  invoices: NyuInvoice[] = [];
  /** 同じ受注・請求のほかの入金伝票 */
  others: NyuRow[] = [];
  members = new Map<string, NyuMember>();
  dirty = false;
  busy = false;
  message = '';

  constructor() {
    this.title.setTitle('入金伝票(MWSystem)');
    this.bunsrv.qryBunrui().then(() => this.cdRef.detectChanges()).catch(e => console.log('error bunrui', e));
    this.closesrv.load();
    if (this.stfsrv.tcds.length == 0) {
      this.stfsrv.getStaff().then(() => this.cdRef.detectChanges());
    }
  }

  ngAfterViewInit(): void {
    this.route.paramMap.subscribe(p => {
      const mode = Number(p.get('mode') ?? 3);
      const dno = Number(p.get('denno') ?? 0);
      const q = this.route.snapshot.queryParamMap;
      if (mode == 1 || (!dno && (q.get('jdenno') || q.get('mcode')))) {
        // 受注伝票・請求伝票の画面から開いたとき（?jdenno= / ?mcode=&idenno=）
        this.modeToCre(q.get('mcode') ? 1 : 0, Number(q.get('jdenno') ?? 0), q.get('mcode') ?? '', Number(q.get('idenno') ?? 0));
      } else if (dno > 0) {
        this.open(dno, mode == 2 ? 2 : 3);
      }
    });
  }

  get ptypes(): { value: string; viewval: string }[] {
    return (this.bunsrv.kbn['ptype'] ?? []) as { value: string; viewval: string }[];
  }

  pcodeName(v: string | null): string {
    return v ? ((this.bunsrv.kbn['pcode'] ?? []) as { value: string; viewval: string }[]).find(e => e.value == v)?.viewval ?? v : '';
  }

  name(mcode: string): string {
    return this.nyusrv.memberName(this.members.get(mcode));
  }

  shouldConfirmOnBeforeunload(): boolean {
    return this.mode != 3 && this.dirty;
  }

  beforeUnload(e: Event): void {
    if (this.shouldConfirmOnBeforeunload()) {
      e.returnValue = true;
    }
  }

  get editable(): boolean {
    return this.mode == 1 || this.mode == 2;
  }

  touch() {
    this.dirty = true;
  }

  /** 変えられない理由（無ければ空）: 締め処理で計上済・締め日以前・取消済 */
  get lockReason(): string {
    if (!this.saved) {
      return '';
    }
    if (this.saved.del) {
      return '取消済の伝票です';
    }
    if (this.saved.kubun == 1 && this.saved.kdenno) {
      return '請求伝票 ' + this.saved.kdenno + ' の締めで入金額に計上済のため、変えられません';
    }
    if (this.closesrv.isClosed(this.saved.day)) {
      return '締め日（' + this.closesrv.closeday + '）以前の入金のため、変えられません';
    }
    return '';
  }

  // ===================== 合計・残 =====================
  sumOf(k: 'nmoney' | 'smoney' | 'tmoney'): number {
    return this.s.lines.reduce((a, l) => a + (Number(l[k]) || 0), 0);
  }

  /** この伝票の入金（入金 − 出金 + 調整） */
  get amount(): number {
    return this.sumOf('nmoney') - this.sumOf('smoney') + this.sumOf('tmoney');
  }

  /** 読み込んだときのこの伝票の入金（残の計算で、一度戻すため） */
  private get savedAmount(): number {
    if (!this.saved || this.saved.del) {
      return 0;
    }
    const t = this.nyusrv.sums(this.saved.lines);
    return t.nmoney - t.smoney + t.tmoney;
  }

  /** 請求額（受注の売上額・請求伝票の今回請求額） */
  get billed(): number | null {
    return this.s.kubun == 0 ? this.order?.total ?? null : this.invoice?.seikyu ?? null;
  }

  /** この伝票を入れる前の残 */
  get zanBefore(): number | null {
    const z = this.s.kubun == 0 ? this.order?.nyuzan : this.invoice?.zan;
    // 保存済みの同じ受注・請求の伝票なら、残にはこの伝票の分が入っているので戻す
    const same = this.saved && (this.s.kubun == 0 ? this.saved.jdenno == this.order?.denno : this.saved.idenno == this.invoice?.denno);
    return z == null ? null : z + (same ? this.savedAmount : 0);
  }

  /** この伝票を入れた後の残 */
  get zanAfter(): number | null {
    return this.zanBefore == null ? null : this.zanBefore - (this.s.del ? 0 : this.amount);
  }

  state(total: number | null, zan: number | null): string {
    return total == null || zan == null ? '' : nyuState(total, zan);
  }

  // ===================== 読み込み =====================
  async open(denno: number, mode: 2 | 3 = 3) {
    this.busy = true;
    this.message = '';
    this.cdRef.detectChanges();
    try {
      const d = await this.nyusrv.load(denno);
      if (!d) {
        this.usrsrv.toastWar('入金伝票番号' + denno + 'は登録されていません');
        history.replaceState('', '', './frmnyukin');
      } else {
        this.s = d;
        this.saved = structuredClone(d);
        this.dno = denno;
        this.mode = mode;
        this.dirty = false;
        if (mode == 2 && this.lockReason) {
          this.mode = 3;
          this.message = this.lockReason;
        }
        history.replaceState('', '', './frmnyukin/' + this.mode + '/' + denno);
        await this.loadTarget();
      }
    } catch (e) {
      this.usrsrv.toastErr('入金伝票を読めませんでした', (e as Error).message);
      console.log('error open nyuslip', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 対象（受注・請求）と、ほかの入金伝票を読む */
  private async loadTarget() {
    this.order = null;
    this.invoice = null;
    this.others = [];
    if (this.s.kubun == 0 && this.s.jdenno) {
      this.order = await this.nyusrv.order(this.s.jdenno);
      this.others = (await this.nyusrv.slips([{ jdenno: { _eq: this.s.jdenno } }])).filter(r => r.denno != this.s.denno);
    } else if (this.s.kubun == 1 && this.s.mcode) {
      this.invoices = await this.nyusrv.invoices([{ mcode: { _eq: this.s.mcode } }], 24);
      this.invoice = this.s.idenno ? this.invoices.find(i => i.denno == this.s.idenno) ?? await this.nyusrv.invoice(this.s.idenno) : null;
      this.others = (await this.nyusrv.slips([{ kubun: { _eq: 1 } }, { mcode: { _eq: this.s.mcode } }], 30)).filter(r => r.denno != this.s.denno);
    }
    this.members = await this.nyusrv.members([this.s.mcode, this.s.code, this.order?.mcode ?? '', this.order?.scde ?? '']);
  }

  onEnter() {
    const n = this.usrsrv.convNumber(this.dno);
    if (n && n != this.s.denno) {
      this.open(n);
    }
  }

  dennoHelp() {
    this.dialog.open(NyuhelpComponent, { width: '1100px', maxWidth: '98vw', height: '90%' }).afterClosed().subscribe(dno => {
      if (dno) {
        this.open(dno);
      }
    });
  }

  /** 新規（kubun 0 = 都度、1 = 掛売）。受注・請求先が分かっていれば入れておく */
  async modeToCre(kubun: NyuKubun, jdenno = 0, mcode = '', idenno = 0) {
    if (!this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      return;
    }
    this.mode = 1;
    this.s = this.nyusrv.blank(kubun);
    this.saved = null;
    this.dno = 0;
    this.dirty = false;
    this.order = null;
    this.invoice = null;
    this.invoices = [];
    this.others = [];
    this.message = '';
    history.replaceState('', '', './frmnyukin/1/0');
    if (kubun == 0 && jdenno) {
      await this.setJdenno(String(jdenno));
    } else if (kubun == 1 && mcode) {
      await this.setMcode(mcode, idenno);
    }
    this.cdRef.detectChanges();
  }

  modeToUpd() {
    if (this.lockReason) {
      this.usrsrv.toastWar(this.lockReason);
      return;
    }
    this.mode = 2;
    history.replaceState('', '', './frmnyukin/2/' + this.s.denno);
  }

  cancel() {
    if (!this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      return;
    }
    this.dirty = false;
    this.mode = 3;
    if (this.saved) {
      this.s = structuredClone(this.saved);
      history.replaceState('', '', './frmnyukin/3/' + this.s.denno);
      this.loadTarget().then(() => this.cdRef.detectChanges());
    } else {
      this.s = this.nyusrv.blank(0);
      this.order = null;
      this.invoice = null;
      history.replaceState('', '', './frmnyukin');
    }
  }

  // ===================== 対象の入力 =====================
  /** 都度: 受注伝票番号を入れたとき */
  async setJdenno(v: string) {
    const n = Number(String(v).trim());
    this.touch();
    this.order = null;
    this.others = [];
    if (!n) {
      this.s.jdenno = null;
      return;
    }
    try {
      const o = await this.nyusrv.order(n);
      if (!o) {
        this.usrsrv.toastWar('受注伝票' + n + 'は登録されていません');
        this.s.jdenno = null;
      } else {
        if (o.torikbn) {
          this.usrsrv.toastWar('受注伝票' + n + 'は掛売（締め請求）の伝票です。掛売の入金伝票で、請求先に入金してください');
        }
        this.s.jdenno = n;
        this.order = o;
        this.s.mcode = o.scde || o.mcode;
        if (!this.saved || !this.s.code) {
          this.s.code = this.s.mcode;
        }
        // 明細の入金額は、残を入れておく（1 行目が空のとき）
        const l0 = this.s.lines[0];
        if (l0 && !Number(l0.nmoney) && !Number(l0.smoney) && !Number(l0.tmoney) && o.nyuzan > 0) {
          l0.nmoney = o.nyuzan;
          l0.ptype ||= this.defaultPtype(o.pcode);
        }
        this.others = (await this.nyusrv.slips([{ jdenno: { _eq: n } }])).filter(r => r.denno != this.s.denno);
        this.members = await this.nyusrv.members([this.s.mcode, this.s.code]);
      }
    } catch (e) {
      this.usrsrv.toastErr('受注伝票を読めませんでした', (e as Error).message);
    }
    this.cdRef.detectChanges();
  }

  /** 受注の入金方法（pcode）から、入金明細の入金方法（ptype）の初期値 */
  private defaultPtype(pcode: string | null): string {
    switch (pcode) {
      case '2': case '3': case '15': return '1';      // 現金・現金書留・現金受取 → 現金
      case '4': return '4';                           // 郵便振替 → 郵便振込
      case '5': case '6': case '1': return '3';       // 銀振・掛 → 銀行振込
      case '7': return '11';                          // カード
      case '9': case '10': return '20';               // 代引・代引代行 → 佐川代引銀
      case '13': return '10';                         // PayPal
      case '14': return '14';                         // NP後払い
      case '16': return '16';                         // 後払い決済
      default: return '';
    }
  }

  /** 掛売: 請求先を入れたとき。請求伝票（消込先の候補）を読む */
  async setMcode(v: string, idenno = 0) {
    const m = String(v ?? '').trim();
    this.touch();
    this.s.mcode = m;
    this.invoices = [];
    this.invoice = null;
    this.others = [];
    if (!m) {
      return;
    }
    if (!this.s.code || !this.saved) {
      this.s.code = m;
    }
    try {
      this.invoices = await this.nyusrv.invoices([{ mcode: { _eq: m } }], 24);
      const open = this.invoices.filter(i => i.zan > 0);
      // 消込先: 指定があればそれ、無ければ残のある一番古い請求伝票
      const pick = idenno ? this.invoices.find(i => i.denno == idenno) : open[open.length - 1];
      this.setIdenno(pick?.denno ?? 0);
      this.others = (await this.nyusrv.slips([{ kubun: { _eq: 1 } }, { mcode: { _eq: m } }], 30)).filter(r => r.denno != this.s.denno);
      this.members = await this.nyusrv.members([m, this.s.code]);
      if (!this.members.get(m)) {
        this.usrsrv.toastWar('請求先' + m + 'は登録されていません');
      }
    } catch (e) {
      this.usrsrv.toastErr('請求伝票を読めませんでした', (e as Error).message);
    }
    this.cdRef.detectChanges();
  }

  setIdenno(dno: number | string) {
    const n = Number(dno) || 0;
    this.s.idenno = n || null;
    this.invoice = this.invoices.find(i => i.denno == n) ?? null;
    const l0 = this.s.lines[0];
    if (this.invoice && l0 && !Number(l0.nmoney) && !Number(l0.smoney) && !Number(l0.tmoney) && this.invoice.zan > 0) {
      l0.nmoney = this.invoice.zan;
      l0.ptype ||= '3';
    }
    this.touch();
  }

  mcdHelp(fld: 'mcode' | 'code') {
    const cfg = new MatDialogConfig();
    cfg.width = '100vw';
    cfg.height = '98%';
    cfg.panelClass = 'full-screen-modal';
    this.dialog.open(McdhelpComponent, cfg).afterClosed().subscribe(data => {
      if (data?.mcode) {
        if (fld == 'mcode') {
          this.setMcode(String(data.mcode));
        } else {
          this.s.code = String(data.mcode);
          this.touch();
          this.nyusrv.members([this.s.code]).then(m => { m.forEach((v, k) => this.members.set(k, v)); this.cdRef.detectChanges(); });
        }
      }
    });
  }

  // ===================== 明細 =====================
  addLine() {
    if (this.s.lines.length >= MAX_LINES) {
      return;
    }
    this.s.lines.push({ line: this.s.lines.length + 1, ptype: this.s.lines[this.s.lines.length - 1]?.ptype ?? '', nmoney: 0, smoney: 0, tmoney: 0, mmemo: '' });
    this.touch();
  }

  delLine(i: number) {
    this.s.lines.splice(i, 1);
    this.s.lines.forEach((l, k) => l.line = k + 1);
    this.touch();
  }

  /** 残を入金額に入れる（その行の入金額を残に合わせる） */
  fillZan(i: number) {
    const z = this.zanBefore;
    if (z == null) {
      return;
    }
    const others = this.s.lines.reduce((a, l, k) => k == i ? a : a + (Number(l.nmoney) || 0) - (Number(l.smoney) || 0) + (Number(l.tmoney) || 0), 0);
    this.s.lines[i].nmoney = Math.max(0, z - others);
    this.touch();
  }

  // ===================== 保存・取消 =====================
  invalid(): string {
    const s = this.s;
    const err: string[] = [];
    if (!s.day) {
      err.push('入金日を入れてください');
    } else if (this.closesrv.isClosed(s.day)) {
      err.push('入金日が締め日（' + this.closesrv.closeday + '）以前です');
    }
    if (!s.tcode) {
      err.push('担当者を選んでください');
    }
    if (s.kubun == 0 && !s.jdenno) {
      err.push('受注伝票を入れてください');
    }
    if (s.kubun == 1 && !s.mcode) {
      err.push('請求先を入れてください');
    }
    const lines = s.lines.filter(l => Number(l.nmoney) || Number(l.smoney) || Number(l.tmoney));
    if (lines.length == 0) {
      err.push('入金額を入れてください');
    }
    lines.forEach(l => {
      if (!l.ptype) {
        err.push(l.line + '行目：入金方法を選んでください');
      }
    });
    return err.join('\n');
  }

  async save() {
    // 金額の無い行は保存しない
    this.s.lines = this.s.lines.filter(l => Number(l.nmoney) || Number(l.smoney) || Number(l.tmoney));
    this.s.lines.forEach((l, k) => l.line = k + 1);
    const msg = this.invalid();
    if (msg) {
      this.usrsrv.toastWar(msg);
      if (this.s.lines.length == 0) {
        this.addLine();
      }
      return;
    }
    const after = this.zanAfter;
    if (after != null && after < 0 && !confirm('入金すると残が ' + after.toLocaleString() + '（過入金）になります。保存しますか？')) {
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      const isNew = !this.s.denno;
      const dno = await this.nyusrv.save(this.s);
      this.usrsrv.toastSuc('入金伝票' + dno + (isNew ? 'を登録しました' : 'の変更を保存しました')
        + (after != null ? '（' + this.state(this.billed, after) + '・残 ' + after.toLocaleString() + '）' : ''));
      this.dirty = false;
      await this.open(dno);
    } catch (e) {
      this.usrsrv.toastErr('データベースエラー', '入金伝票を保存できませんでした：' + (e as Error).message);
      console.log('error save nyuslip', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /** 取消（論理削除）・取消を戻す */
  async toggleDel() {
    if (!this.saved) {
      return;
    }
    const del = !this.saved.del;
    if (del && this.lockReason) {
      this.usrsrv.toastWar(this.lockReason);
      return;
    }
    if (!del && this.saved.kubun == 1 && this.saved.kdenno) {
      this.usrsrv.toastWar('締めで計上済の伝票です');
      return;
    }
    if (!confirm('入金伝票' + this.saved.denno + (del ? ' を取り消しますか？（入金残に戻ります）' : ' の取消を戻しますか？'))) {
      return;
    }
    try {
      await this.nyusrv.setDel(this.saved.denno, del);
      this.usrsrv.toastSuc('入金伝票' + this.saved.denno + (del ? 'を取り消しました' : 'の取消を戻しました'));
      await this.open(this.saved.denno);
    } catch (e) {
      this.usrsrv.toastErr('データベースエラー', (e as Error).message);
    }
  }

  opelog() {
    if (!this.s.denno) {
      return;
    }
    const data: OpelogParam = { extype: EXTYPE_NYUKIN, keycode: String(this.s.denno), title: '入金伝票 ' + this.s.denno, table: 'trnyusub' };
    this.dialog.open(OpelogComponent, { width: '900px', maxWidth: '95vw', data });
  }
}
