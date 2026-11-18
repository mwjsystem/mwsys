import { Component, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, ParamMap, RouterLink } from '@angular/router';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { DatePipe } from '@angular/common';
import { UserService } from './../services/user.service';
import { StaffService } from './../services/staff.service';
import { StoreService } from './../services/store.service';
import { VendsService } from './../mstvendor/vends.service';
import { VcdhelpComponent } from './../share/vcdhelp/vcdhelp.component';
import { GcdhelpComponent } from './../share/gcdhelp/gcdhelp.component';
import { OpelogComponent, OpelogParam } from './../share/opelog/opelog.component';
import { OnBeforeunload } from './../beforeunload.guard';
import {
  EXTYPE_KAKO, KAKO_KINDS, KAKO_STEPS, KakoDen, KakoOrder, KakoPosi, KakoRow, KakoService, NAIYO_WORDS, POSI_WORDS, stepName
} from './kako.service';
import { KakoprintComponent } from './kakoprint.component';

/** 加工先にする仕入先（名前にこの文字があれば、加工先の選択肢に出す。ほかの仕入先は「ほかの仕入先」から選ぶ） */
export const KAKO_VENDOR_MARKS = ['堀商店', '小西マーク', '豊岡縫製'];

const emptyPosi = (line: number): KakoPosi => ({ line, posi: '', naiyo: '', shotai: '', color: '', size: '', memo: '' });

/**
 * 加工指示（受注関連 → 加工指示。刺繍・プリント）。受注伝票から伝票番号・顧客・内勤・商品・数量を引き継いで作り、
 * 加工先・希望納期・位置と内容を入れて、指示書（QR 付き）を出す。状態（依頼 → 倉庫から発送 → 加工先で受取 → 加工済・発送 →
 * 倉庫で受取 → 出荷済）を進める。連番（加工先ごと・月ごと）は登録したときに付く。操作ログに残る
 */
@Component({
  selector: 'app-frmkako',
  templateUrl: './frmkako.component.html',
  styleUrls: ['./frmkako.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    '(window:beforeunload)': 'beforeUnload($event)'
  },
  imports: [FormsModule, RouterLink, MatToolbar, MatButton, MatIconButton, MatIcon, MatTooltip, DatePipe]
})
export class FrmkakoComponent implements AfterViewInit, OnBeforeunload {
  usrsrv = inject(UserService);
  stfsrv = inject(StaffService);
  strsrv = inject(StoreService);
  vensrv = inject(VendsService);
  private kakosrv = inject(KakoService);
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  readonly kinds = KAKO_KINDS;
  readonly steps = KAKO_STEPS;
  readonly naiyoWords = NAIYO_WORDS;
  readonly posiWords = POSI_WORDS;
  readonly stepName = stepName;

  /** 1 = 新規、2 = 変更、3 = 照会 */
  mode = 3;
  kno = 0;
  den: KakoDen = this.blank();
  private saved: KakoDen | null = null;
  /** 受注伝票（新規のとき、商品を選ぶのに使う） */
  order: KakoOrder | null = null;
  /** 受注明細の行 → 選んだか */
  picked: Record<number, boolean> = {};
  /** 同じ受注の加工指示 */
  siblings: KakoRow[] = [];
  dirty = false;
  busy = false;

  constructor() {
    this.title.setTitle('加工指示(MWSystem)');
    this.strsrv.getStore().then(() => this.cdRef.detectChanges());
    this.vensrv.getVendors().then(() => this.cdRef.detectChanges());
    if (this.stfsrv.tcds.length == 0) {
      this.stfsrv.getStaff().then(() => this.cdRef.detectChanges());
    }
  }

  ngAfterViewInit(): void {
    this.route.paramMap.subscribe((p: ParamMap) => {
      const mode = Number(p.get('mode') ?? 3);
      const kno = Number(p.get('kno') ?? 0);
      const jdenno = Number(this.route.snapshot.queryParamMap.get('jdenno') ?? 0);
      if (mode == 1 || (!kno && jdenno)) {
        this.modeToCre(jdenno);
      } else if (kno > 0) {
        this.open(kno, mode == 2 ? 2 : 3);
      }
    });
  }

  private blank(): KakoDen {
    const today = this.usrsrv.formatDate(new Date());
    return {
      kno: 0, jdenno: null, mcode: '', mname: '', kind: '6', dtype: 'S', dcode: '', rscode: '', renban: '',
      tcode: this.usrsrv.staff?.code ?? '', reqday: today, wishday: '', planday: this.kakosrv.planDay(today),
      doukon: false, naiyo: '', memo: '', status: 1, steps: {}, del: false,
      created_at: null, created_by: null, updated_at: null, updated_by: null, lines: [], posis: [emptyPosi(1), emptyPosi(2), emptyPosi(3)]
    };
  }

  // ===================== 加工先 =====================
  /** 加工先の選択肢（倉庫は全部、仕入先は KAKO_VENDOR_MARKS の名前のもの＋今選んでいるもの） */
  get vendorDests(): { code: string; name: string }[] {
    const list = this.vensrv.vends.filter(v => KAKO_VENDOR_MARKS.some(m => (v.adrname ?? '').includes(m)) || (this.den.dtype == 'V' && v.code == this.den.dcode));
    return list.map(v => ({ code: v.code, name: v.adrname ?? v.code }));
  }

  get destKey(): string {
    return this.den.dcode ? this.den.dtype + ':' + this.den.dcode : '';
  }

  setDest(key: string) {
    const [t, c] = key.split(':');
    this.den.dtype = (t as 'S' | 'V') || 'S';
    this.den.dcode = c ?? '';
    this.touch();
  }

  destName(dtype: string, dcode: string): string {
    if (!dcode) {
      return '';
    }
    return dtype == 'V' ? (this.vensrv.getVcdtxt(dcode) || dcode) : (this.strsrv.scds.find(s => s.value == dcode)?.viewval ?? dcode);
  }

  storeName(c: string): string {
    return this.strsrv.scds.find(s => s.value == c)?.viewval ?? c;
  }

  otherVendor() {
    const cfg = new MatDialogConfig();
    cfg.width = '100vw';
    cfg.height = '98%';
    cfg.panelClass = 'full-screen-modal';
    this.dialog.open(VcdhelpComponent, cfg).afterClosed().subscribe(data => {
      if (data?.code) {
        this.den.dtype = 'V';
        this.den.dcode = data.code;
        this.touch();
        this.cdRef.detectChanges();
      }
    });
  }

  // ===================== 画面の状態 =====================
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

  setReqday(v: string) {
    this.den.reqday = v;
    this.den.planday = this.kakosrv.planDay(v);
    this.touch();
  }

  /** 予定納期（希望納期があればそちら） */
  get dueDay(): string {
    return this.den.wishday || this.den.planday;
  }

  async open(kno: number, mode: 2 | 3 = 3) {
    if (!kno) {
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      const d = await this.kakosrv.load(kno);
      if (!d) {
        this.usrsrv.toastWar('加工指示番号' + kno + 'は登録されていません');
        history.replaceState('', '', './frmkako');
      } else {
        this.den = d;
        this.saved = structuredClone(d);
        this.kno = kno;
        this.mode = mode;
        this.dirty = false;
        this.order = null;
        history.replaceState('', '', './frmkako/' + mode + '/' + kno);
        if (mode == 2 && d.jdenno) {
          await this.loadOrder(d.jdenno, false);
        }
        await this.loadSiblings();
      }
    } catch (e) {
      this.usrsrv.toastErr('加工指示を読めませんでした', (e as Error).message);
      console.log('error open kako', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  onEnter() {
    const n = this.usrsrv.convNumber(this.kno);
    if (n && n != this.den.kno) {
      this.open(n);
    }
  }

  private async loadSiblings() {
    this.siblings = this.den.jdenno ? (await this.kakosrv.ofOrder(this.den.jdenno)).filter(s => s.kno != this.den.kno) : [];
  }

  /** 受注伝票を読む。fill = true は顧客・内勤・刺繍/プリントの明細を加工指示に入れる */
  private async loadOrder(jdenno: number, fill: boolean) {
    const o = await this.kakosrv.order(jdenno);
    this.order = o;
    if (!o) {
      this.usrsrv.toastWar('受注伝票' + jdenno + 'が見つかりません');
      return;
    }
    this.picked = {};
    if (fill) {
      this.den.jdenno = o.denno;
      this.den.mcode = o.mcode;
      this.den.mname = o.mname;
      this.den.tcode = o.tcode || this.den.tcode;
      this.den.rscode = o.scode;
      const kako = o.lines.filter(l => l.spec == '6' || l.spec == '7');
      if (kako.length) {
        this.den.kind = kako[0].spec!;
      }
      // 刺繍依頼・プリントの明細を選んでおく（無ければ、加工の付属品でない商品を全部）
      const base = kako.length ? kako : o.lines;
      base.forEach(l => this.picked[l.line] = true);
      this.syncLines();
    } else {
      this.den.lines.forEach(l => {
        if (l.jline) {
          this.picked[l.jline] = true;
        }
      });
    }
  }

  async modeToCre(jdenno = 0) {
    if (!this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      return;
    }
    this.mode = 1;
    this.den = this.blank();
    this.saved = null;
    this.kno = 0;
    this.order = null;
    this.siblings = [];
    this.dirty = false;
    history.replaceState('', '', './frmkako/1/0' + (jdenno ? '?jdenno=' + jdenno : ''));
    if (jdenno) {
      this.busy = true;
      this.cdRef.detectChanges();
      try {
        await this.loadOrder(jdenno, true);
        await this.loadSiblings();
      } catch (e) {
        this.usrsrv.toastErr('受注伝票を読めませんでした', (e as Error).message);
      }
      this.busy = false;
    }
    this.cdRef.detectChanges();
  }

  /** 受注伝票番号を入れたとき（新規） */
  async setJdenno(v: string) {
    const n = Number(v);
    if (!n) {
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      await this.loadOrder(n, true);
      await this.loadSiblings();
      this.touch();
    } catch (e) {
      this.usrsrv.toastErr('受注伝票を読めませんでした', (e as Error).message);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  modeToUpd() {
    this.mode = 2;
    history.replaceState('', '', './frmkako/2/' + this.den.kno);
    if (this.den.jdenno && !this.order) {
      this.loadOrder(this.den.jdenno, false).then(() => this.cdRef.detectChanges()).catch(() => undefined);
    }
  }

  cancel() {
    if (!this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      return;
    }
    this.dirty = false;
    this.mode = 3;
    if (this.saved) {
      this.den = structuredClone(this.saved);
      history.replaceState('', '', './frmkako/3/' + this.den.kno);
    } else {
      this.den = this.blank();
      this.den.posis = [];
      history.replaceState('', '', './frmkako');
    }
  }

  // ===================== 商品 =====================
  /** 受注明細の選びを、加工指示の商品に写す（数量・備考は、もう入っている行のものを残す） */
  syncLines() {
    if (!this.order) {
      return;
    }
    const old = new Map(this.den.lines.filter(l => l.jline).map(l => [l.jline!, l]));
    const fromOrder = this.order.lines.filter(l => this.picked[l.line]).map(l => old.get(l.line) ?? {
      line: 0, jline: l.line, gcode: l.gcode, gtext: l.gtext, suu: l.suu, memo: ''
    });
    const extra = this.den.lines.filter(l => !l.jline);
    this.den.lines = [...fromOrder, ...extra].map((l, i) => ({ ...l, line: i + 1 }));
  }

  togglePick(line: number) {
    this.picked[line] = !this.picked[line];
    this.syncLines();
    this.touch();
  }

  addLine() {
    this.den.lines.push({ line: this.den.lines.length + 1, jline: null, gcode: '', gtext: '', suu: 1, memo: '' });
    this.touch();
  }

  delLine(i: number) {
    const l = this.den.lines[i];
    if (l.jline) {
      this.picked[l.jline] = false;
    }
    this.den.lines.splice(i, 1);
    this.den.lines.forEach((e, k) => e.line = k + 1);
    this.touch();
  }

  gcdHelp(i: number) {
    const cfg = new MatDialogConfig();
    cfg.width = '100vw';
    cfg.height = '98%';
    cfg.panelClass = 'full-screen-modal';
    cfg.data = { gcode: this.den.lines[i].gcode, tkbn: ['0', '1'] };
    this.dialog.open(GcdhelpComponent, cfg).afterClosed().subscribe(data => {
      if (data?.gcode) {
        this.den.lines[i].gcode = data.gcode;
        this.den.lines[i].gtext = data.gtext ?? this.den.lines[i].gtext;
        this.touch();
        this.cdRef.detectChanges();
      }
    });
  }

  get totalSuu(): number {
    return this.den.lines.reduce((a, l) => a + Number(l.suu || 0), 0);
  }

  // ===================== 位置・加工内容 =====================
  addPosi(i: number) {
    this.den.posis.splice(i, 0, emptyPosi(i + 1));
    this.den.posis.forEach((p, k) => p.line = k + 1);
    this.touch();
  }

  delPosi(i: number) {
    this.den.posis.splice(i, 1);
    this.den.posis.forEach((p, k) => p.line = k + 1);
    this.touch();
  }

  addWord(w: string) {
    const parts = this.den.naiyo.split('/').map(s => s.trim()).filter(s => s);
    if (!parts.includes(w)) {
      parts.push(w);
    }
    this.den.naiyo = parts.join('/');
    this.touch();
  }

  // ===================== 保存 =====================
  invalid(): string {
    const d = this.den;
    const err: string[] = [];
    if (!d.dcode) {
      err.push('加工先を選んでください');
    }
    if (!d.reqday) {
      err.push('依頼日を入れてください');
    }
    if (!d.tcode) {
      err.push('内勤を選んでください');
    }
    if (!d.lines.some(l => l.gcode)) {
      err.push('商品を入れてください');
    }
    d.lines.forEach(l => {
      if (l.gcode && !(Number(l.suu) > 0)) {
        err.push(l.line + '行目の商品：数量を入れてください');
      }
    });
    return err.join('\n');
  }

  async save() {
    const msg = this.invalid();
    if (msg) {
      this.usrsrv.toastWar(msg);
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    const isNew = this.mode == 1;
    try {
      const kno = await this.kakosrv.save(this.den, isNew);
      this.dirty = false;
      await this.open(kno);
      this.usrsrv.toastSuc('加工指示' + kno + '（連番 ' + this.den.renban + '）' + (isNew ? 'を登録しました' : 'の変更を保存しました'));
    } catch (e) {
      this.usrsrv.toastErr('データベースエラー', '加工指示を保存できませんでした：' + (e as Error).message);
      console.log('error save kako', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  // ===================== 状態 =====================
  stepAt(s: number): string {
    return this.den.steps[s]?.at ?? '';
  }

  stepBy(s: number): string {
    const by = this.den.steps[s]?.by ?? '';
    return by == 'auto' ? '自動' : (this.stfsrv.getName(by) || by);
  }

  async setStatus(to: number) {
    const from = this.den.status;
    if (to == from || !this.den.kno) {
      return;
    }
    if (to < from && !confirm('状態を「' + stepName(to) + '」に戻します（「' + stepName(to) + '」より後の日時を消します）。よろしいですか？')) {
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      await this.kakosrv.setStatus(this.den.kno, to, from);
      await this.open(this.den.kno);
      this.usrsrv.toastSuc('状態を「' + stepName(to) + '」にしました');
    } catch (e) {
      this.usrsrv.toastErr('状態を変えられませんでした', (e as Error).message);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  async toggleDel() {
    const del = !this.den.del;
    if (!confirm(del ? 'この加工指示を取り消します。よろしいですか？' : '取消を元に戻します。よろしいですか？')) {
      return;
    }
    try {
      await this.kakosrv.setDel(this.den.kno, del);
      await this.open(this.den.kno);
    } catch (e) {
      this.usrsrv.toastErr('取消できませんでした', (e as Error).message);
    }
  }

  // ===================== 指示書・操作ログ =====================
  print() {
    if (!this.den.kno || this.dirty) {
      this.usrsrv.toastWar('保存してから指示書を出してください');
      return;
    }
    this.dialog.open(KakoprintComponent, { width: '560px', data: { den: this.den } });
  }

  opelog() {
    if (!this.den.kno) {
      return;
    }
    const data: OpelogParam = { extype: EXTYPE_KAKO, keycode: String(this.den.kno), title: '加工指示 ' + this.den.kno + '（連番 ' + this.den.renban + '）' };
    this.dialog.open(OpelogComponent, { width: '900px', maxWidth: '95vw', data });
  }

  openOrder() {
    if (this.den.jdenno) {
      this.usrsrv.openMst('frmsales', String(this.den.jdenno));
    }
  }

  kindName(v: string): string {
    return KAKO_KINDS.find(k => k.value == v)?.name ?? v;
  }

  specName(v: string | null): string {
    return v == '6' ? '刺繍依頼' : v == '7' ? 'プリント' : '';
  }
}
