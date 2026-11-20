import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatLabel, MatInput } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatTabGroup, MatTab } from '@angular/material/tabs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RoyItem, RoyMaster, RoyMem, RoyOrg, RoyaltyService } from './royalty.service';

/** 団体ごとの、区分・単価などの意味 */
const HELP: Record<string, string> = {
  shinkyoku: '商品の区分: sapo サポーター / obid 帯留め / akao 赤帯（商品コードは完全一致。カンマで別名も書ける）・kdcb 帯・道着（商品コードの欄は区分のキー ZZSK…。サイズの欄 = シート名、色の欄 = シートの見出し、備考 = 明細の商品名。シート名の無い区分は、上の区分のシートに入る。記念道着の行は、条件に「like:KD15*K,KD14*K;nodetail:KD15*S-K」のように数える商品コードと日別の明細に出さない商品コードを書く）・manual 数を手で入れる行。単価 = ロイヤリティ金額。'
    + '顧客の種類: dojo 支部・道場（順 = 月の明細の並び、年間の順 = 年間集計表の並び。顧客コード-枝番は枝番の欄）/ branch 道場（まとめる先の支部へ）/ eda 本部の別納先の枝番 / kaigai 海外の受注先。',
  daido: '商品の区分 = 明細書の行の名前（同じ区分の品番をまとめる）。商品コード = 集計詳細の品番（カンマで、まとめるサイズ違いのコード）。単価 = 事務局、単価2 = 支部、単価3 = 道場、単価4 = 同好会。区分 mw = MW商品購入（率）、oem = OEM（単価、数は手で入れる）。',
  ashihara: '商品コード（カンマ区切り、末尾 * は前方一致）ごとに単価。',
  rengo: '商品の区分: obi 帯 / dogi 道着（単価 = コミッション。税込にするため 1.1 を掛ける）/ shinpan 審判用品 / kansai 関西総本部の差額（単価2 = 総本部卸価格、単価3 = 関西支部卸価格。無いときは単価 = コミッション）/ grachan グラチャン指定（単価 = 1 個のコミッション。条件 chubunrui:013 は中分類 013 の数だけ）/ cup ファールカップ（条件 teika 定価・oroshi 卸、単価2 = 卸の判定の定価）。'
    + '顧客の種類: kansai・tabata は名前の文字を請求先の顧客マスタ備考から探す / grachan は受注先コード。',
  naniwa: '商品コード（末尾 * は前方一致）ごとの明細書の行。単価は使わない（ロイヤリティ = 税抜単価 − 商品マスタの単価2）。',
  jkjo: '商品の区分: JK（JKJO 報告書）/ JC（JKC 報告書）。単価 = 税抜単価。顧客の種類: taikai 大会（2/3 を報告書に入れる）/ sheet 納品先ごとのシート（名前 = シート名）。',
  yushi: '単価 = 商品定価、率 = ロイヤリティの率（単価 = 商品定価 × 率）。顧客の種類 exclude = 集計から除く受注先。',
  nas: 'マスタは使いません（定価と卸単価の差額）。',
  ibko: '単価 = 明細書の単価。区分 ship = 配送料（条件 region:都道府県 / pcode:入金予定）。顧客の種類 target = 集計する納品先。',
  oishi: '率 = 卸価格（単価2）に掛ける率。単価2 は各行の最後の商品コードの商品マスタから読む（無いときは単価）。顧客の種類 target = 集計する納品先。',
  kenbu: '商品コード（カンマ区切り、* は前方一致など）ごとの明細書の行。単価 = 1 個のロイヤリティ（税込）。読むのは商品コードに KEN を含む明細。',
  zenkoren: '区分 = シート名（同じ区分の商品コードを 1 つのシートに、商品コード・単価ごとの数量で出す）。商品コードは * で前方一致・後方一致など。単価は使わない。',
  khanki: '区分: dogi 道着 / obi 帯（納品先ごとのシートの列）。商品コード（KU* 上下 / KU*-U 上のみ / KU*-S 下のみ / CB* 帯。細かい指定の行に入る）、単価 = 1 枚のロイヤリティ。'
    + '顧客の種類 exclude = 除く納品先。読む商品コード（%KU%-K% など）と卸の単価区分（2・4）はプログラムで決めている。'
};

/**
 * ロイヤリティマスタ（団体・集計する商品・顧客）の編集。保存すると、その団体の商品・顧客を入れ直す。
 */
@Component({
  selector: 'app-roymst',
  templateUrl: './roymst.component.html',
  styleUrls: ['./roymst.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatToolbar, MatButton, MatIconButton, MatIcon, MatFormField, MatLabel, MatInput, MatSelect, MatOption, MatTabGroup, MatTab, FormsModule, RouterLink]
})
export class RoymstComponent implements OnInit {
  private srv = inject(RoyaltyService);
  private title = inject(Title);
  private snack = inject(MatSnackBar);
  private cdRef = inject(ChangeDetectorRef);

  orgs: RoyOrg[] = [];
  org = '';
  m?: RoyMaster;
  /** 表に出す区分・種類（'' はすべて） */
  grp = '';
  kind = '';
  dirty = false;
  busy = false;
  error = '';

  constructor() {
    this.title.setTitle('ロイヤリティマスタ(MWSystem)');
  }

  async ngOnInit() {
    try {
      this.orgs = await this.srv.orgs();
      if (this.orgs.length > 0) {
        await this.load(this.orgs[0].org);
      }
    } catch (e) {
      this.error = '団体を読めませんでした：' + (e as Error).message;
    }
    this.cdRef.detectChanges();
  }

  get help(): string {
    return HELP[this.org] ?? '';
  }
  get grps(): string[] {
    return [...new Set((this.m?.items ?? []).map(e => e.grp ?? ''))];
  }
  get kinds(): string[] {
    return [...new Set((this.m?.mems ?? []).map(e => e.kind))];
  }
  get items(): RoyItem[] {
    return (this.m?.items ?? []).filter(e => !this.grp || (e.grp ?? '') == this.grp);
  }
  get mems(): RoyMem[] {
    return (this.m?.mems ?? []).filter(e => !this.kind || e.kind == this.kind);
  }

  async changeOrg(org: string) {
    if (this.dirty && !confirm('保存していない変更があります。破棄して団体を変えますか？')) {
      const prev = this.org;
      this.org = '';
      this.cdRef.detectChanges();
      this.org = prev;
      this.cdRef.detectChanges();
      return;
    }
    await this.load(org);
  }

  async load(org: string) {
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      this.m = await this.srv.master(org);
      this.org = org;
      this.grp = '';
      this.kind = '';
      this.dirty = false;
    } catch (e) {
      this.error = '読めませんでした：' + (e as Error).message;
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  changed() {
    this.dirty = true;
  }

  addItem() {
    if (!this.m) {
      return;
    }
    const seq = Math.max(0, ...this.m.items.map(e => e.seq)) + 1;
    this.m.items.push({ grp: this.grp || null, seq, name: null, size: null, color: null, gcodes: null, cond: null, price: null, price2: null, price3: null, price4: null, rate: null, memo: null });
    this.dirty = true;
  }
  delItem(it: RoyItem) {
    if (this.m) {
      this.m.items = this.m.items.filter(e => e != it);
      this.dirty = true;
    }
  }
  addMem() {
    if (!this.m) {
      return;
    }
    const kind = this.kind || this.kinds[0] || 'target';
    const seq = Math.max(0, ...this.m.mems.filter(e => e.kind == kind).map(e => e.seq)) + 1;
    this.m.mems.push({ kind, seq, aseq: null, mcode: null, eda: null, pcode: null, name: null, memo: null });
    this.dirty = true;
  }
  delMem(m: RoyMem) {
    if (this.m) {
      this.m.mems = this.m.mems.filter(e => e != m);
      this.dirty = true;
    }
  }

  async save() {
    if (!this.m) {
      return;
    }
    if (this.m.mems.some(e => !e.kind)) {
      this.error = '顧客の「種類」が空の行があります';
      return;
    }
    this.busy = true;
    this.error = '';
    this.cdRef.detectChanges();
    try {
      const nz = (s: string | null) => s == null || String(s).trim() == '' ? null : String(s).trim();
      const nn = (v: number | null) => v == null || String(v) === '' ? null : Number(v);
      this.m.items = this.m.items.map(e => ({
        ...e, grp: nz(e.grp), name: nz(e.name), size: nz(e.size), color: nz(e.color), gcodes: nz(e.gcodes), cond: nz(e.cond), memo: nz(e.memo),
        seq: Number(e.seq) || 0, price: nn(e.price), price2: nn(e.price2), price3: nn(e.price3), price4: nn(e.price4), rate: nn(e.rate)
      }));
      this.m.mems = this.m.mems.map(e => ({
        ...e, kind: String(e.kind).trim(), mcode: nz(e.mcode), eda: nz(e.eda), pcode: nz(e.pcode), name: nz(e.name), memo: nz(e.memo),
        seq: Number(e.seq) || 0, aseq: nn(e.aseq)
      }));
      await this.srv.save(this.m);
      this.dirty = false;
      this.snack.open(this.m.org.name + ' のマスタを保存しました', '', { duration: 2500 });
      await this.load(this.org);
    } catch (e) {
      this.error = '保存できませんでした：' + (e as Error).message;
      console.log('error roymst save', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
