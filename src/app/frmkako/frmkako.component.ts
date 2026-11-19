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
  EXTYPE_KAKO, KAKO_KINDS, KAKO_STEPS, KakoDen, KakoOrder, KakoPattern, KakoPosi, KakoRow, KakoService, NAIYO_WORDS, POSI_WORDS, stepName
} from './kako.service';
import { KakoprintComponent } from './kakoprint.component';
import { KakoFigure, kakoFigure, shrinkImage, spotOf } from './kakofig';

/** 加工先にする仕入先（名前にこの文字があれば、加工先の選択肢に出す。ほかの仕入先は「ほかの仕入先」から選ぶ） */
export const KAKO_VENDOR_MARKS = ['堀商店', '小西マーク', '豊岡縫製'];

/**
 * 加工指示の画面で使う倉庫・仕入先・担当者を読む（足りないときだけ）。
 * 担当者は、会社が入る前に読むと空の 1 行だけになるので、1 行以下なら読み直す
 */
export function loadMasters(strsrv: StoreService, vensrv: VendsService, stfsrv: StaffService, done: () => void) {
  if (strsrv.scds.length == 0) {
    strsrv.getStore().then(done);
  }
  if (vensrv.vends.length == 0) {
    vensrv.getVendors().then(done);
  }
  if (stfsrv.tcds.length <= 1) {
    stfsrv.getStaff().then(done);
  }
}

const emptyPosi = (line: number): KakoPosi => ({ line, posi: '', naiyo: '', shotai: '', color: '', size: '', memo: '', img: '' });

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
  }

  ngAfterViewInit(): void {
    // 倉庫・仕入先・担当者は、ログインの情報（会社）が入ってから読む（別のタブで直接開いたとき、コンストラクタでは早すぎて空になる）
    loadMasters(this.strsrv, this.vensrv, this.stfsrv, () => this.cdRef.detectChanges());
    this.route.paramMap.subscribe((p: ParamMap) => {
      const mode = Number(p.get('mode') ?? 3);
      const kno = Number(p.get('kno') ?? 0);
      const jdenno = Number(this.route.snapshot.queryParamMap.get('jdenno') ?? 0);
      const tdenno = Number(this.route.snapshot.queryParamMap.get('tdenno') ?? 0);
      if (mode == 1 || (!kno && (jdenno || tdenno))) {
        this.modeToCre(jdenno, tdenno);
      } else if (kno > 0) {
        this.open(kno, mode == 2 ? 2 : 3);
      }
    });
  }

  private blank(): KakoDen {
    const today = this.usrsrv.formatDate(new Date());
    return {
      kno: 0, jdenno: null, tdenno: null, mcode: '', mname: '', kind: '6', dtype: 'S', dcode: '', rscode: '', renban: '',
      tcode: this.usrsrv.staff?.code ?? '', reqday: today, wishday: '', planday: this.kakosrv.planDay(today),
      doukon: false, naiyo: '', memo: '', photo: '', status: 1, steps: {}, del: false,
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
    this.refreshFig();
  }

  // ===================== 指示書の図 =====================
  /** 指示書の図の見本（位置と内容から描く。図に出る位置がなければ null） */
  fig: KakoFigure | null = null;
  private figTimer: ReturnType<typeof setTimeout> | null = null;

  /** 図を描き直す（打つたびに描かないよう、少し待ってから） */
  refreshFig() {
    if (this.figTimer) {
      clearTimeout(this.figTimer);
    }
    this.figTimer = setTimeout(async () => {
      this.figTimer = null;
      this.fig = await kakoFigure(this.den.posis, this.den.lines.map(l => l.gcode));
      this.cdRef.detectChanges();
    }, 300);
  }

  /** 位置の場所が図にあるか（ない位置は、図には出ず表だけに出る） */
  onFig(p: KakoPosi): boolean {
    return !!spotOf(p.posi);
  }

  /** 刺繍の図（画像ファイル）を選んだとき */
  async pickImg(p: KakoPosi, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) {
      await this.setImg(p, f);
    }
  }

  /** 刺繍の図を貼り付けたとき（Excel・ペイントなどでコピーした画像） */
  async pasteImg(p: KakoPosi, ev: ClipboardEvent) {
    const item = [...(ev.clipboardData?.items ?? [])].find(i => i.type.startsWith('image/'));
    const f = item?.getAsFile();
    if (!f) {
      this.usrsrv.toastWar('貼り付けたものに画像がありません');
      return;
    }
    ev.preventDefault();
    await this.setImg(p, f);
  }

  private async setImg(p: KakoPosi, f: Blob) {
    try {
      p.img = await shrinkImage(f);
      this.touch();
    } catch (e) {
      this.usrsrv.toastErr('刺繍の図を入れられませんでした', (e as Error).message);
    }
    this.cdRef.detectChanges();
  }

  delImg(p: KakoPosi) {
    p.img = '';
    this.touch();
  }

  // ===================== 商品の写真 =====================
  /** 商品の写真（道着・帯の絵がない商品で、加工する場所が分かるもの）をファイルから選んだとき */
  async pickPhoto(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) {
      await this.setPhoto(f);
    }
  }

  /** 商品の写真を貼り付けたとき */
  async pastePhoto(ev: ClipboardEvent) {
    const item = [...(ev.clipboardData?.items ?? [])].find(i => i.type.startsWith('image/'));
    const f = item?.getAsFile();
    if (!f) {
      this.usrsrv.toastWar('貼り付けたものに画像がありません');
      return;
    }
    ev.preventDefault();
    await this.setPhoto(f);
  }

  private async setPhoto(f: Blob) {
    try {
      // 指示書で大きめに出すので、刺繍の図より大きく残す
      this.den.photo = await shrinkImage(f, 1000);
      this.touch();
    } catch (e) {
      this.usrsrv.toastErr('商品の写真を入れられませんでした', (e as Error).message);
    }
    this.cdRef.detectChanges();
  }

  delPhoto() {
    this.den.photo = '';
    this.touch();
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
        this.refreshFig();
        this.saved = structuredClone(d);
        this.kno = kno;
        this.mode = mode;
        this.dirty = false;
        this.order = null;
        history.replaceState('', '', './frmkako/' + mode + '/' + kno);
        if (mode == 2 && (d.jdenno || d.tdenno)) {
          await this.loadOrder(d.tdenno ? 'T' : 'J', (d.tdenno || d.jdenno)!, false);
        }
        await this.loadSiblings();
        await this.loadPatterns(false);
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
    const d = this.den;
    this.siblings = d.tdenno || d.jdenno ? (await this.kakosrv.ofOrder((d.tdenno || d.jdenno)!, !!d.tdenno)).filter(s => s.kno != d.kno) : [];
  }

  /** 元の伝票の名前（受注伝票 / 展開伝票） */
  get srcName(): string {
    return this.den.tdenno || this.order?.src == 'T' ? '展開伝票' : '受注伝票';
  }

  /**
   * 受注伝票（src = 'J'）・展開伝票（src = 'T'）を読む。fill = true は顧客・内勤・商品を加工指示に入れる。
   * 受注伝票は、在庫種別が加工指示の種類（刺繍依頼 / プリント）の明細だけを選んでおく。展開伝票は展開元の商品を全部選んでおく
   */
  private async loadOrder(src: 'J' | 'T', denno: number, fill: boolean) {
    const o = src == 'T' ? await this.kakosrv.tenkai(denno) : await this.kakosrv.order(denno);
    this.order = o;
    if (!o) {
      this.usrsrv.toastWar((src == 'T' ? '展開伝票' : '受注伝票') + denno + 'が見つかりません');
      return;
    }
    this.picked = {};
    if (fill) {
      this.den.jdenno = src == 'J' ? o.denno : null;
      this.den.tdenno = src == 'T' ? o.denno : null;
      this.den.mcode = o.mcode;
      this.den.mname = o.mname;
      this.den.tcode = o.tcode || this.den.tcode;
      this.den.rscode = o.scode;
      if (src == 'T') {
        o.lines.forEach(l => this.picked[l.line] = true);
      } else {
        const kako = o.lines.filter(l => l.spec == '6' || l.spec == '7');
        this.den.kind = kako.find(l => l.spec == '6')?.spec ?? kako[0]?.spec ?? '6';
        o.lines.filter(l => l.spec == this.den.kind).forEach(l => this.picked[l.line] = true);
      }
      this.syncLines();
      await this.loadPatterns(true);
    } else {
      this.den.lines.forEach(l => {
        if (l.jline) {
          this.picked[l.jline] = true;
        }
      });
    }
  }

  /** 新規（jdenno: 受注伝票から、tdenno: 展開伝票から） */
  async modeToCre(jdenno = 0, tdenno = 0) {
    if (!this.usrsrv.confirmCan(this.shouldConfirmOnBeforeunload())) {
      return;
    }
    this.mode = 1;
    this.den = this.blank();
    this.fig = null;
    this.saved = null;
    this.kno = 0;
    this.order = null;
    this.siblings = [];
    this.patterns = [];
    this.dirty = false;
    history.replaceState('', '', './frmkako/1/0' + (tdenno ? '?tdenno=' + tdenno : jdenno ? '?jdenno=' + jdenno : ''));
    if (jdenno || tdenno) {
      this.busy = true;
      this.cdRef.detectChanges();
      try {
        await this.loadOrder(tdenno ? 'T' : 'J', tdenno || jdenno, true);
        await this.loadSiblings();
      } catch (e) {
        this.usrsrv.toastErr((tdenno ? '展開伝票' : '受注伝票') + 'を読めませんでした', (e as Error).message);
      }
      this.busy = false;
    }
    this.cdRef.detectChanges();
  }

  /** 受注伝票番号・展開伝票番号を入れたとき（新規） */
  async setSrcDenno(src: 'J' | 'T', v: string) {
    const n = Number(v);
    if (!n) {
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      await this.loadOrder(src, n, true);
      await this.loadSiblings();
      this.touch();
    } catch (e) {
      this.usrsrv.toastErr((src == 'T' ? '展開伝票' : '受注伝票') + 'を読めませんでした', (e as Error).message);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  modeToUpd() {
    this.mode = 2;
    history.replaceState('', '', './frmkako/2/' + this.den.kno);
    const d = this.den;
    if ((d.jdenno || d.tdenno) && !this.order) {
      this.loadOrder(d.tdenno ? 'T' : 'J', (d.tdenno || d.jdenno)!, false).then(() => this.cdRef.detectChanges()).catch(() => undefined);
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
    this.refreshFig();
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
    this.refreshPatterns();
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
        this.refreshPatterns();
        this.cdRef.detectChanges();
      }
    });
  }

  get totalSuu(): number {
    return this.den.lines.reduce((a, l) => a + Number(l.suu || 0), 0);
  }

  // ===================== 位置・加工内容 =====================
  /** 位置を選んだとき。「その他（入力）…」は、候補にない位置を入れてもらう（やめたら元の位置に戻す） */
  setPosi(p: KakoPosi, v: string, sel: HTMLSelectElement) {
    if (v == '__other') {
      const s = prompt('位置を入れてください（候補にない位置は、指示書の図には出ません）', p.posi);
      if (s == null || !s.trim()) {
        sel.value = p.posi;
        return;
      }
      v = s.trim();
    }
    p.posi = v;
    this.touch();
  }

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

  // ===================== 加工マスタ =====================
  /** 加工する商品の商品コード → 商品グループコード */
  groups = new Map<string, string>();
  /** 加工する商品の商品グループ・この顧客の加工マスタ */
  patterns: KakoPattern[] = [];
  /** マスタに登録する商品グループ・パターン（0 は新しいパターン）・パターンの名前 */
  mstGrp = '';
  mstPtn = 0;
  mstName = '';

  /** 加工する商品の商品グループ（重ならないように） */
  get lineGroups(): string[] {
    return [...new Set(this.den.lines.map(l => this.groups.get(l.gcode) ?? '').filter(g => g))];
  }

  /** マスタに登録する商品グループの今のパターン */
  get mstPatterns(): KakoPattern[] {
    return this.patterns.filter(p => p.grpcode == this.mstGrp);
  }

  /**
   * 商品グループと加工マスタを読む。apply = true（受注伝票・展開伝票から新しく作るとき）は、
   * パターンが 1 つだけならそれを入れる（2 つ以上なら選んでもらう）
   */
  async loadPatterns(apply: boolean) {
    try {
      this.groups = await this.kakosrv.groupsOf(this.den.lines.map(l => l.gcode));
      this.patterns = await this.kakosrv.patterns(this.lineGroups, this.den.mcode);
    } catch (e) {
      // 加工マスタが無い（Hasura の設定前など）ときも、加工指示は作れるようにする
      this.patterns = [];
      console.log('error kako patterns', e);
    }
    if (!this.lineGroups.includes(this.mstGrp)) {
      this.mstGrp = this.lineGroups[0] ?? '';
      this.mstPtn = 0;
    }
    if (apply) {
      if (this.patterns.length == 1) {
        this.applyPattern(this.patterns[0], false);
        this.usrsrv.toastSuc('加工マスタ（' + this.patternLabel(this.patterns[0]) + '）の内容を入れました');
      } else if (this.patterns.length > 1) {
        this.usrsrv.toastWar('加工マスタにパターンが ' + this.patterns.length + ' つあります。「加工マスタ」から選んでください');
      }
    }
    this.cdRef.detectChanges();
  }

  patternLabel(p: KakoPattern): string {
    return p.grpcode + ' パターン' + p.ptn + (p.ptname ? '「' + p.ptname + '」' : '');
  }

  /** パターンの加工先の名前（なければ ''） */
  patternDest(p: KakoPattern): string {
    return p.dcode ? this.destName(p.dtype || 'S', p.dcode) : '';
  }

  /** 加工マスタの内容（種類・加工先・加工内容・位置と内容・備考）を入れる */
  applyPattern(p: KakoPattern, ask = true) {
    const filled = this.den.posis.some(x => x.posi || x.naiyo || x.img);
    if (ask && filled && !confirm('いま入っている位置と内容を、' + this.patternLabel(p) + ' に置き換えます。よろしいですか？')) {
      return;
    }
    this.den.kind = p.kind || this.den.kind;
    if (p.dcode) {
      this.den.dtype = (p.dtype as 'S' | 'V') || 'S';
      this.den.dcode = p.dcode;
    }
    this.den.naiyo = p.naiyo;
    if (p.memo) {
      this.den.memo = p.memo;
    }
    if (p.photo) {
      this.den.photo = p.photo;
    }
    this.den.posis = p.posis.length ? structuredClone(p.posis) : [emptyPosi(1)];
    this.mstGrp = p.grpcode;
    this.mstPtn = p.ptn;
    this.mstName = p.ptname;
    this.touch();
  }

  /** いまの種類・加工先・加工内容・位置と内容・備考を、加工マスタに登録する（新しいパターン、または上書き） */
  async saveMaster() {
    if (!this.den.mcode) {
      this.usrsrv.toastWar('顧客がありません。受注伝票か展開伝票から作った加工指示で登録してください');
      return;
    }
    if (!this.mstGrp) {
      this.usrsrv.toastWar('商品グループを選んでください');
      return;
    }
    if (!this.den.posis.some(x => x.posi || x.naiyo || x.img) && !this.den.photo) {
      this.usrsrv.toastWar('位置と内容（または商品の写真）を入れてから登録してください');
      return;
    }
    const old = this.mstPatterns.find(p => p.ptn == this.mstPtn);
    const what = this.mstGrp + '・' + this.den.mcode + ' の' + (old ? ' ' + this.patternLabel(old) + ' に上書き' : '新しいパターン') + 'で';
    const dest = this.den.dcode ? '加工先「' + this.destName(this.den.dtype, this.den.dcode) + '」' : '加工先なし（加工先が選ばれていません）';
    if (!confirm('いまの種類・' + dest + '・加工内容・位置と内容' + (this.den.photo ? '・商品の写真' : '') + 'を、加工マスタ（' + what + '）に登録します。よろしいですか？')) {
      return;
    }
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      const ptn = await this.kakosrv.saveMaster({
        grpcode: this.mstGrp, mcode: this.den.mcode, ptn: old ? old.ptn : 0, ptname: this.mstName.trim(), kind: this.den.kind,
        dtype: this.den.dtype, dcode: this.den.dcode, naiyo: this.den.naiyo, memo: this.den.memo, photo: this.den.photo, posis: this.den.posis
      });
      await this.loadPatterns(false);
      this.mstPtn = ptn;
      this.usrsrv.toastSuc('加工マスタに登録しました（' + this.mstGrp + ' パターン' + ptn + '）');
    } catch (e) {
      this.usrsrv.toastErr('加工マスタに登録できませんでした', (e as Error).message);
      console.log('error save kako master', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  async delMaster(p: KakoPattern) {
    if (!confirm('加工マスタの ' + this.patternLabel(p) + ' を消します。よろしいですか？')) {
      return;
    }
    try {
      await this.kakosrv.delMaster(p.grpcode, p.mcode, p.ptn);
      this.mstPtn = 0;
      await this.loadPatterns(false);
      this.usrsrv.toastSuc(this.patternLabel(p) + ' を消しました');
    } catch (e) {
      this.usrsrv.toastErr('加工マスタを消せませんでした', (e as Error).message);
    }
    this.cdRef.detectChanges();
  }

  setMstPtn(v: string) {
    this.mstPtn = Number(v) || 0;
    this.mstName = this.mstPatterns.find(p => p.ptn == this.mstPtn)?.ptname ?? '';
  }

  /** 商品を変えたあと、商品グループと加工マスタを読み直す */
  refreshPatterns() {
    const missing = this.den.lines.some(l => l.gcode && !this.groups.has(l.gcode));
    const shown = new Set(this.patterns.map(p => p.grpcode));
    if (missing || this.lineGroups.some(g => !shown.has(g))) {
      this.loadPatterns(false);
    }
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
    if (!confirm('加工指示' + this.den.kno + (del ? ' を取り消しますか？' : ' の取消を戻しますか？'))) {
      return;
    }
    try {
      await this.kakosrv.setDel(this.den.kno, del);
      this.usrsrv.toastSuc('加工指示' + this.den.kno + (del ? 'を取り消しました' : 'の取消を戻しました'));
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
    if (this.den.tdenno) {
      this.usrsrv.openMst('frmtenkai', String(this.den.tdenno));
    } else if (this.den.jdenno) {
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
