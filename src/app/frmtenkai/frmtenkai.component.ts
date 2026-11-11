import { Component, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { StoreService } from './../services/store.service';
import { StockService } from './../services/stock.service';
import { GcdhelpComponent } from './../share/gcdhelp/gcdhelp.component';
import { OpelogComponent, OpelogParam } from './../share/opelog/opelog.component';
import { OnBeforeunload } from './../beforeunload.guard';
import { EXTYPE_TENKAI, KUBUN_IN, KUBUN_OUT, TENKAI_NUMBER, TenDen, TenKubun, TenLine, TenkaiService } from './tenkai.service';
import { TenhelpComponent } from './tenhelp.component';
import { TenprintComponent, TenprintData } from './tenprint.component';

/** 空の明細 */
const emptyLine = (line: number, kubun: TenKubun): TenLine =>
  ({ line, kubun, gcode: '', suu: 0, memo: '', gtext: '', unit: '', gskbn: '0', tanano: '', zais: [], stock: null });

/**
 * 展開伝票（在庫展開伝票。在庫関連 → 展開伝票）。同じ倉庫の中で、出庫（展開元）の商品を入庫（展開先）の商品に作り替える。
 * 日付は展開依頼日（day）と展開完了日（cday）。保存すると在庫（trzaiko）の展開出（teno）を依頼日に、展開入（teni）を完了日に
 * 増減する（完了日が入るまで入庫は足さない。「展開完了」で完了日を今日にする）。操作ログ（DB のトリガー）に残る。
 * 「展開指示書」で、倉庫の作業用の指示書（A4）を出す
 */
@Component({
  selector: 'app-frmtenkai',
  templateUrl: './frmtenkai.component.html',
  styleUrls: ['./frmtenkai.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    '(window:beforeunload)': 'beforeUnload($event)'
  },
  imports: [FormsModule, MatToolbar, MatButton, MatIconButton, MatIcon, MatTooltip]
})
export class FrmtenkaiComponent implements AfterViewInit, OnBeforeunload {
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  strsrv = inject(StoreService);
  private stcsrv = inject(StockService);
  private tensrv = inject(TenkaiService);
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  readonly KUBUN_OUT = KUBUN_OUT;
  readonly KUBUN_IN = KUBUN_IN;
  /** 1 = 新規、2 = 変更、3 = 照会 */
  mode = 3;
  /** 入力欄の伝票番号 */
  dno = 0;
  /** 表示中の伝票（新規は denno = 0） */
  den: TenDen = this.blank();
  /** 読み込んだときの伝票（変更の保存で、在庫の増減を取り消すため） */
  private saved: TenDen | null = null;
  dirty = false;
  busy = false;

  constructor() {
    this.title.setTitle('展開伝票(MWSystem)');
    this.strsrv.getStore();
    if (this.stfsrv.tcds.length == 0) {
      this.stfsrv.getStaff().then(() => this.cdRef.detectChanges());
    }
  }

  ngAfterViewInit(): void {
    this.route.paramMap.subscribe((p: ParamMap) => {
      const mode = Number(p.get('mode') ?? 3);
      const dno = Number(p.get('denno') ?? 0);
      if (mode == 1) {
        this.modeToCre();
      } else if (dno > 0) {
        this.open(dno, mode == 2 ? 2 : 3);
      }
    });
  }

  private blank(): TenDen {
    return {
      denno: 0, day: this.usrsrv.formatDate(new Date()), scode: this.usrsrv.staff?.scode ?? '', tcode: this.usrsrv.staff?.code ?? '',
      cday: null, created_at: null, created_by: null, updated_at: null, updated_by: null,
      lines: [emptyLine(1, KUBUN_OUT), emptyLine(2, KUBUN_IN)]
    };
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

  storeName(code: string): string {
    return this.strsrv.scds.find(s => s.value == code)?.viewval ?? code;
  }

  /** 伝票を読む */
  async open(denno: number, mode: 2 | 3 = 3) {
    if (!denno) {
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      const d = await this.tensrv.load(denno);
      if (!d) {
        this.usrsrv.toastWar('展開伝票番号' + denno + 'は登録されていません');
        history.replaceState('', '', './frmtenkai');
      } else {
        this.den = d;
        this.saved = structuredClone(d);
        this.dno = denno;
        this.mode = mode;
        this.dirty = false;
        history.replaceState('', '', './frmtenkai/' + mode + '/' + denno);
        this.loadStock();
      }
    } catch (e) {
      this.usrsrv.toastErr('展開伝票を読めませんでした', (e as Error).message);
      console.log('error open tenden', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  onEnter() {
    const n = this.usrsrv.convNumber(this.dno);
    if (n && n != this.den.denno) {
      this.open(n);
    }
  }

  dennoHelp() {
    this.dialog.open(TenhelpComponent, { width: '1000px', maxWidth: '98vw', height: '90%' }).afterClosed().subscribe(dno => {
      if (dno) {
        this.open(dno);
      }
    });
  }

  modeToCre() {
    if (!this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      return;
    }
    this.mode = 1;
    this.den = this.blank();
    this.saved = null;
    this.dno = 0;
    this.dirty = false;
    history.replaceState('', '', './frmtenkai/1/0');
  }

  modeToUpd() {
    this.mode = 2;
    history.replaceState('', '', './frmtenkai/2/' + this.den.denno);
  }

  cancel() {
    if (!this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      return;
    }
    this.dirty = false;
    if (this.saved) {
      this.den = structuredClone(this.saved);
      this.mode = 3;
      history.replaceState('', '', './frmtenkai/3/' + this.den.denno);
      this.loadStock();
    } else {
      this.mode = 3;
      this.den = this.blank();
      this.den.lines = [];
      history.replaceState('', '', './frmtenkai');
    }
  }

  // ===================== 明細 =====================
  private renumber() {
    this.den.lines.forEach((l, i) => l.line = i + 1);
  }

  /** 行を足す（区分は前の行と逆。出庫・入庫を交互に入れやすくする） */
  insRow(i: number) {
    const prev = this.den.lines[i - 1];
    this.den.lines.splice(i, 0, emptyLine(i + 1, prev && prev.kubun == KUBUN_OUT ? KUBUN_IN : KUBUN_OUT));
    this.renumber();
    this.touch();
  }

  delRow(i: number) {
    this.den.lines.splice(i, 1);
    this.renumber();
    this.touch();
  }

  /** 出庫・入庫の組を最後に足す */
  addPair() {
    const n = this.den.lines.length;
    this.den.lines.push(emptyLine(n + 1, KUBUN_OUT), emptyLine(n + 2, KUBUN_IN));
    this.touch();
  }

  /** 品番を入れたとき、商品マスタと在庫を読む */
  async setGcode(l: TenLine, value: string) {
    l.gcode = this.usrsrv.convUpper(String(value ?? '').trim());
    this.touch();
    if (!l.gcode) {
      Object.assign(l, { gtext: '', unit: '', gskbn: '0', tanano: '', zais: [], stock: null, bad: false });
      return;
    }
    try {
      const g = (await this.tensrv.goods([l.gcode])).get(l.gcode);
      if (!g) {
        l.bad = true;
        l.gtext = '';
        this.usrsrv.toastWar('商品コード' + l.gcode + 'は登録されていません');
      } else {
        Object.assign(l, { gtext: g.gtext, unit: g.unit, gskbn: g.gskbn, tanano: g.tanano, zais: g.zais, bad: false });
        this.stockOf(l);
      }
    } catch (e) {
      console.log('error goods', e);
    }
    this.cdRef.detectChanges();
  }

  gcdHelp(l: TenLine) {
    const cfg = new MatDialogConfig();
    cfg.width = '100vw';
    cfg.height = '98%';
    cfg.panelClass = 'full-screen-modal';
    cfg.data = { gcode: l.gcode, tkbn: ['0', '1'] };
    this.dialog.open(GcdhelpComponent, cfg).afterClosed().subscribe(data => {
      if (data?.gcode) {
        this.setGcode(l, data.gcode);
      }
    });
  }

  /** 倉庫の在庫数（在庫品は在庫数、セット品は構成品から作れる数） */
  private stockOf(l: TenLine) {
    const scode = this.den.scode;
    l.stock = null;
    if (!scode || !l.gcode || l.bad) {
      return;
    }
    const done = (n: number) => {
      if (this.den.scode == scode) {
        l.stock = n;
        this.cdRef.detectChanges();
      }
    };
    if (l.gskbn == '0') {
      this.stcsrv.getStock(l.gcode, '0', scode).then(r => done(Number(r[0]?.stock ?? 0))).catch(e => console.log('error stock', e));
    } else if (l.gskbn == '1' && l.zais.length > 0) {
      this.stcsrv.getSetZai(scode, l.zais.map(z => ({ zcode: z.zcode, irisu: z.irisu, msgoods: { gskbn: '0' } })))
        .then(r => done(r.length ? Math.min(...r.map(z => Math.floor(Number(z.stock ?? 0) / Number(z.irisu || 1)))) : 0))
        .catch(e => console.log('error stock', e));
    }
  }

  loadStock() {
    this.den.lines.forEach(l => this.stockOf(l));
  }

  setScode(v: string) {
    this.den.scode = v;
    this.touch();
    this.loadStock();
  }

  sumOf(kubun: TenKubun): number {
    return this.den.lines.filter(l => l.kubun == kubun && l.gcode).reduce((a, l) => a + Number(l.suu || 0), 0);
  }

  // ===================== 保存 =====================
  /** 保存できない理由（無ければ空） */
  invalid(): string {
    const d = this.den;
    const lines = d.lines.filter(l => l.gcode || Number(l.suu));
    const err: string[] = [];
    if (!d.day) {
      err.push('展開依頼日を入れてください');
    }
    if (d.day && d.cday && d.cday < d.day) {
      err.push('展開完了日が展開依頼日より前です');
    }
    if (!d.scode) {
      err.push('倉庫を選んでください');
    }
    if (!d.tcode) {
      err.push('担当者を選んでください');
    }
    if (lines.length == 0) {
      err.push('明細を入れてください');
    }
    lines.forEach(l => {
      if (!l.gcode) {
        err.push(l.line + '行目：商品コードを入れてください');
      } else if (l.bad) {
        err.push(l.line + '行目：商品コード ' + l.gcode + ' は登録されていません');
      }
      if (!(Number(l.suu) > 0) || !Number.isInteger(Number(l.suu))) {
        err.push(l.line + '行目：数量は 1 以上の整数にしてください');
      }
    });
    if (lines.length > 0 && !lines.some(l => l.kubun == KUBUN_OUT)) {
      err.push('出庫の行がありません');
    }
    if (lines.length > 0 && !lines.some(l => l.kubun == KUBUN_IN)) {
      err.push('入庫の行がありません');
    }
    return err.join('\n');
  }

  async save() {
    // 品番も数量も無い行は保存しない
    this.den.lines = this.den.lines.filter(l => l.gcode || Number(l.suu));
    this.renumber();
    const msg = this.invalid();
    if (msg) {
      this.usrsrv.toastWar(msg);
      return;
    }
    const outs = this.sumOf(KUBUN_OUT);
    const ins = this.sumOf(KUBUN_IN);
    if (outs != ins && !confirm('出庫の数量の合計（' + outs + '）と入庫の数量の合計（' + ins + '）が違います。このまま保存しますか？')) {
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    const isNew = this.mode == 1;
    try {
      const d = this.den;
      if (isNew) {
        d.denno = Number(await this.usrsrv.getNumber(TENKAI_NUMBER, 1));
        if (!d.denno) {
          throw new Error('展開伝票番号を採番できませんでした（採番の種別 ' + TENKAI_NUMBER + '）');
        }
      }
      // 在庫: 読み込んだときの分を取り消し、今の倉庫・日付・数量で足す
      // （出庫は依頼日、入庫は完了日。完了日が無ければ入庫はまだ足さない）
      const old = !isNew && this.saved ? this.tensrv.zaikoOf(this.saved.scode, this.saved.day, this.saved.cday, this.saved.lines, -1) : [];
      await this.tensrv.save(d, [...old, ...this.tensrv.zaikoOf(d.scode, d.day, d.cday, d.lines)]);
      this.usrsrv.toastSuc('展開伝票' + d.denno + (isNew ? 'を新規登録しました' : 'の変更を保存しました')
        + (d.cday && !this.saved?.cday ? '（展開完了。入庫の在庫を ' + d.cday + ' に足しました）' : ''));
      this.dirty = false;
      await this.open(d.denno);
    } catch (e) {
      if (isNew) {
        this.den.denno = 0;
      }
      this.usrsrv.toastErr('データベースエラー', '展開伝票を保存できませんでした：' + (e as Error).message);
      console.log('error save tenden', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  /**
   * 展開完了（照会中の未完了の伝票）。完了日を今日にして保存し、入庫（展開先）の在庫を完了日に足す。
   * 今日以外の日にしたいときは、編集で展開完了日を入れて保存する
   */
  async complete() {
    if (!this.den.denno || this.den.cday || this.mode != 3) {
      return;
    }
    const today = this.usrsrv.formatDate(new Date());
    if (!confirm('展開完了日を今日（' + today + '）にして、入庫（展開先）の在庫を足しますか？')) {
      return;
    }
    this.mode = 2;
    this.den.cday = today < this.den.day ? this.den.day : today;
    await this.save();
    if (this.mode == 2) {
      // 保存できなかったときは元に戻す
      this.den.cday = null;
      this.mode = 3;
      this.cdRef.detectChanges();
    }
  }

  // ===================== 操作ログ・指示書 =====================
  opelog() {
    if (!this.den.denno) {
      return;
    }
    const data: OpelogParam = { extype: EXTYPE_TENKAI, keycode: String(this.den.denno), title: '展開伝票 ' + this.den.denno, table: 'trtenden' };
    this.dialog.open(OpelogComponent, { width: '900px', maxWidth: '95vw', data });
  }

  print() {
    if (!this.den.denno) {
      return;
    }
    const data: TenprintData = { den: this.den };
    this.dialog.open(TenprintComponent, { width: '560px', maxWidth: '95vw', data });
  }
}
