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
import { BunruiService } from './../services/bunrui.service';
import { GcdhelpComponent } from './../share/gcdhelp/gcdhelp.component';
import { OpelogComponent, OpelogParam } from './../share/opelog/opelog.component';
import { OnBeforeunload } from './../beforeunload.guard';
import { CHOSEI_NUMBER, ChoDen, ChoLine, ChoseiService, EXTYPE_CHOSEI } from './chosei.service';
import { ChohelpComponent } from './chohelp.component';

/** 理由のうち、在庫を増やすもの（原因不明（増））。選ぶと区分を「増」にする */
const ZO_REASONS = ['8'];

const emptyLine = (line: number): ChoLine =>
  ({ line, zo: false, gcode: '', suu: 0, chokbn: '', memo: '', gtext: '', unit: '', gskbn: '0', zais: [], stock: null });

/**
 * 在庫調整伝票（在庫関連 → 在庫調整伝票。現行の破棄伝票）。破棄・紛失などで在庫を減らすほか、
 * 原因不明で在庫が多かったときは増やす。保存すると在庫（trzaiko）の破棄（haki）を増減し（増やすときは負の数）、
 * 操作ログ（DB のトリガー）に残る
 */
@Component({
  selector: 'app-frmchosei',
  templateUrl: './frmchosei.component.html',
  styleUrls: ['./../frmtenkai/frmtenkai.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    '(window:beforeunload)': 'beforeUnload($event)'
  },
  imports: [FormsModule, MatToolbar, MatButton, MatIconButton, MatIcon, MatTooltip]
})
export class FrmchoseiComponent implements AfterViewInit, OnBeforeunload {
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  strsrv = inject(StoreService);
  private bunsrv = inject(BunruiService);
  private stcsrv = inject(StockService);
  private chosrv = inject(ChoseiService);
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  /** 1 = 新規、2 = 変更、3 = 照会 */
  mode = 3;
  dno = 0;
  den: ChoDen = this.blank();
  private saved: ChoDen | null = null;
  dirty = false;
  busy = false;

  constructor() {
    this.title.setTitle('在庫調整伝票(MWSystem)');
    this.strsrv.getStore();
    this.bunsrv.qryBunrui().then(() => this.cdRef.detectChanges()).catch(e => console.log('error bunrui', e));
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

  private blank(): ChoDen {
    return {
      denno: 0, day: this.usrsrv.formatDate(new Date()), scode: this.usrsrv.staff?.scode ?? '', tcode: this.usrsrv.staff?.code ?? '',
      created_at: null, created_by: null, updated_at: null, updated_by: null,
      lines: [emptyLine(1)]
    };
  }

  get reasons(): { value: string; viewval: string }[] {
    return (this.bunsrv.kbn['hakikbn'] ?? []) as { value: string; viewval: string }[];
  }

  reasonName(v: string): string {
    return this.reasons.find(r => r.value == v)?.viewval ?? '';
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

  async open(denno: number, mode: 2 | 3 = 3) {
    if (!denno) {
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      const d = await this.chosrv.load(denno);
      if (!d) {
        this.usrsrv.toastWar('在庫調整伝票番号' + denno + 'は登録されていません');
        history.replaceState('', '', './frmchosei');
      } else {
        this.den = d;
        this.saved = structuredClone(d);
        this.dno = denno;
        this.mode = mode;
        this.dirty = false;
        history.replaceState('', '', './frmchosei/' + mode + '/' + denno);
        this.loadStock();
      }
    } catch (e) {
      this.usrsrv.toastErr('在庫調整伝票を読めませんでした', (e as Error).message);
      console.log('error open choden', e);
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
    this.dialog.open(ChohelpComponent, { width: '1000px', maxWidth: '98vw', height: '90%' }).afterClosed().subscribe(dno => {
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
    history.replaceState('', '', './frmchosei/1/0');
  }

  modeToUpd() {
    this.mode = 2;
    history.replaceState('', '', './frmchosei/2/' + this.den.denno);
  }

  cancel() {
    if (!this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      return;
    }
    this.dirty = false;
    this.mode = 3;
    if (this.saved) {
      this.den = structuredClone(this.saved);
      history.replaceState('', '', './frmchosei/3/' + this.den.denno);
      this.loadStock();
    } else {
      this.den = this.blank();
      this.den.lines = [];
      history.replaceState('', '', './frmchosei');
    }
  }

  // ===================== 明細 =====================
  private renumber() {
    this.den.lines.forEach((l, i) => l.line = i + 1);
  }

  insRow(i: number) {
    const prev = this.den.lines[i - 1];
    const l = emptyLine(i + 1);
    // 前の行と同じ区分・理由にしておく（同じ理由でまとめて入れることが多いため）
    if (prev) {
      l.zo = prev.zo;
      l.chokbn = prev.chokbn;
    }
    this.den.lines.splice(i, 0, l);
    this.renumber();
    this.touch();
  }

  delRow(i: number) {
    this.den.lines.splice(i, 1);
    this.renumber();
    this.touch();
  }

  /** 理由を選んだとき。原因不明（増）は区分を「増」に、ほかは「減」にする */
  setReason(l: ChoLine, v: string) {
    l.chokbn = v;
    l.zo = ZO_REASONS.includes(v);
    this.touch();
  }

  async setGcode(l: ChoLine, value: string) {
    l.gcode = this.usrsrv.convUpper(String(value ?? '').trim());
    this.touch();
    if (!l.gcode) {
      Object.assign(l, { gtext: '', unit: '', gskbn: '0', zais: [], stock: null, bad: false });
      return;
    }
    try {
      const g = (await this.chosrv.goods([l.gcode])).get(l.gcode);
      if (!g) {
        l.bad = true;
        l.gtext = '';
        this.usrsrv.toastWar('商品コード' + l.gcode + 'は登録されていません');
      } else {
        Object.assign(l, { gtext: g.gtext, unit: g.unit, gskbn: g.gskbn, zais: g.zais, bad: false });
        this.stockOf(l);
      }
    } catch (e) {
      console.log('error goods', e);
    }
    this.cdRef.detectChanges();
  }

  gcdHelp(l: ChoLine) {
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

  private stockOf(l: ChoLine) {
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

  sumOf(zo: boolean): number {
    return this.den.lines.filter(l => l.zo == zo && l.gcode).reduce((a, l) => a + Number(l.suu || 0), 0);
  }

  // ===================== 保存 =====================
  invalid(): string {
    const d = this.den;
    const lines = d.lines.filter(l => l.gcode || Number(l.suu));
    const err: string[] = [];
    if (!d.day) {
      err.push('日付を入れてください');
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
      if (!l.chokbn) {
        err.push(l.line + '行目：理由を選んでください');
      }
    });
    return err.join('\n');
  }

  async save() {
    this.den.lines = this.den.lines.filter(l => l.gcode || Number(l.suu));
    this.renumber();
    const msg = this.invalid();
    if (msg) {
      this.usrsrv.toastWar(msg);
      return;
    }
    // 減らす数が今の在庫より多いときは確かめる
    const over = this.den.lines.filter(l => !l.zo && l.stock != null && Number(l.suu) > l.stock);
    if (over.length && !confirm(over.map(l => l.gcode + '（在庫 ' + l.stock + '・減 ' + l.suu + '）').join('、') + ' は在庫より多く減らします。このまま保存しますか？')) {
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    const isNew = this.mode == 1;
    try {
      const d = this.den;
      if (isNew) {
        d.denno = Number(await this.usrsrv.getNumber(CHOSEI_NUMBER, 1));
        if (!d.denno) {
          throw new Error('在庫調整伝票番号を採番できませんでした（採番の種別 ' + CHOSEI_NUMBER + '）');
        }
      }
      const old = !isNew && this.saved ? this.chosrv.zaikoOf(this.saved.scode, this.saved.day, this.saved.lines, -1) : [];
      await this.chosrv.save(d, [...old, ...this.chosrv.zaikoOf(d.scode, d.day, d.lines)]);
      this.usrsrv.toastSuc('在庫調整伝票' + d.denno + (isNew ? 'を新規登録しました' : 'の変更を保存しました'));
      this.dirty = false;
      await this.open(d.denno);
    } catch (e) {
      if (isNew) {
        this.den.denno = 0;
      }
      this.usrsrv.toastErr('データベースエラー', '在庫調整伝票を保存できませんでした：' + (e as Error).message);
      console.log('error save choden', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  opelog() {
    if (!this.den.denno) {
      return;
    }
    const data: OpelogParam = { extype: EXTYPE_CHOSEI, keycode: String(this.den.denno), title: '在庫調整伝票 ' + this.den.denno, table: 'trchoden' };
    this.dialog.open(OpelogComponent, { width: '900px', maxWidth: '95vw', data });
  }
}
