import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { firstValueFrom } from 'rxjs';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { UserService } from './../services/user.service';
import { StoreService } from './../services/store.service';
import { OkuriService } from './../services/okuri.service';
import { RateService } from './../services/rate.service';
import { EtcDef, EtcField, EtcOption, STAFF_DEF } from './mstetc-defs';

/** 一覧と入力欄の 1 行（列は表ごとに違うので、キーで読む） */
type EtcRow = Record<string, string | number | boolean | null>;

/**
 * 小さなマスタのメンテナンス（各マスタ → 担当者・倉庫・配送方法・帳票タイプ・文書マスタ）。
 * 左の一覧で行を選ぶと右に中身が出て、そのまま直して「保存」する。「新規」で空の欄から登録する。
 * どの表を扱うかは、ルートの data.def（mstetc-defs.ts）で決める
 */
@Component({
  selector: 'app-mstetc',
  templateUrl: './mstetc.component.html',
  styleUrls: ['./mstetc.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, MatToolbar, MatButton, MatIcon]
})
export class MstetcComponent {
  usrsrv = inject(UserService);
  strsrv = inject(StoreService);
  okrsrv = inject(OkuriService);
  private ratesrv = inject(RateService);
  private apollo = inject(Apollo);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  def: EtcDef = (inject(ActivatedRoute).snapshot.data['def'] as EtcDef) ?? STAFF_DEF;
  rows: EtcRow[] = [];
  /** 退職・削除の行も一覧に出す */
  showDel = false;
  /** 一覧の絞り込み（コード・名前など、どの列でも） */
  filter = '';
  /** ref の欄の選択肢（欄のキーごと） */
  private refOpts: Record<string, EtcOption[]> = {};

  /** 入力欄の中身。null = 何も選んでいない */
  edit: EtcRow | null = null;
  /** true = 新規（コードを入れられる） */
  isNew = false;
  /** 選んだときの中身（変えたかどうかの判定に使う） */
  private orig = '';
  busy = false;
  error = '';

  constructor() {
    this.title.setTitle(this.def.title + '(MWSystem)');
    // 画面を直接開いたときは会社ID（compid）がまだ無いので、ログインした人の情報を読み終わってから読む
    this.usrsrv.staffReady.then(() => {
      if (this.def.fields.some(f => f.type == 'store')) {
        this.strsrv.getStore().then(() => this.cdRef.detectChanges());
      }
      if (this.def.fields.some(f => f.type == 'hokuri') && this.okrsrv.hokuri.length == 0) {
        this.okrsrv.getHokuri();
      }
      this.loadRefs();
      this.load();
    });
  }

  /** コードの列名（code。為替レートは適用開始日 day） */
  get ck(): string {
    return this.def.codeKey ?? 'code';
  }

  /** code のほかのキーの列 */
  get keyFields(): EtcField[] {
    return this.def.keyFields ?? [];
  }

  /** キーの列と中身の列 */
  private get allFields(): EtcField[] {
    return [...this.keyFields, ...this.def.fields];
  }

  get listFields(): EtcField[] {
    return this.def.fields.filter(f => f.list);
  }

  /** 行を見分ける文字（code と、ほかのキーの列） */
  rowKey(r: EtcRow): string {
    return [...this.keyFields.map(f => String(r[f.key] ?? '')), String(r[this.ck] ?? '').trim()].join('|');
  }

  private isDel(r: EtcRow): boolean {
    return !!this.def.delKey && !!r[this.def.delKey];
  }

  get shown(): EtcRow[] {
    const q = this.filter.trim().toLowerCase();
    return this.rows.filter(r => (this.showDel || !this.isDel(r))
      && (!q || [String(r[this.ck] ?? ''), ...this.allFields.map(f => this.cell(r, f))].some(s => s.toLowerCase().includes(q))));
  }

  get delCount(): number {
    return this.rows.filter(r => this.isDel(r)).length;
  }

  /** 欄の選択肢。今の値が選択肢に無くても消えないように足す */
  opts(f: EtcField, cur: unknown): EtcOption[] {
    let opts: EtcOption[];
    if (f.type == 'store') {
      opts = this.strsrv.scds.map(s => ({ value: String(s.value), label: s.value + ' ' + s.viewval }));
    } else if (f.type == 'hokuri') {
      opts = this.okrsrv.hokuri.map(h => ({ value: String(h.code), label: h.name }));
    } else if (f.type == 'ref') {
      opts = [...(f.extra ?? []), ...(this.refOpts[f.key] ?? [])];
    } else {
      opts = f.options ?? [];
    }
    if (cur != null && cur !== '' && !opts.some(o => o.value == String(cur))) {
      opts = [...opts, { value: String(cur), label: cur + '（一覧に無い値）' }];
    }
    return opts;
  }

  /** 一覧のセルに出す文字（選択肢のある欄は名前を付ける） */
  cell(r: EtcRow, f: EtcField): string {
    const v = r[f.key];
    if (f.type == 'check') {
      return v ? '○' : '';
    }
    if (v == null || v === '') {
      return '';
    }
    if (['store', 'hokuri', 'choice', 'ref'].includes(f.type)) {
      const o = this.opts(f, null).find(x => x.value == String(v));
      return o ? (f.type == 'ref' && o.label != String(v) ? v + ' ' + o.label : o.label) : String(v);
    }
    return String(v);
  }

  /** 選択肢の value は文字で持つ（数の列も、保存のときに数に戻す） */
  selValue(v: unknown): string | null {
    return v == null || v === '' ? null : String(v);
  }

  private get cols(): string {
    return [this.ck, ...(this.def.delKey ? [this.def.delKey] : []), ...this.allFields.map(f => f.key)].join(' ');
  }

  /** ref の欄の選択肢を読む */
  private async loadRefs(): Promise<void> {
    for (const f of this.allFields.filter(x => x.type == 'ref' && x.ref)) {
      const r = f.ref!;
      const Get = gql`
        query get_etcref_${r.table}($id: smallint!) {
          ${r.table}(where: {id: {_eq: $id}}, order_by: {${r.value}: asc}) { ${r.value} ${r.label} }
        }`;
      try {
        const res = await firstValueFrom(this.apollo.query<Record<string, Record<string, unknown>[]>>({
          query: Get, variables: { id: this.usrsrv.compid }, fetchPolicy: 'network-only'
        }));
        this.refOpts[f.key] = (res.data?.[r.table] ?? []).map(x => ({ value: String(x[r.value]), label: String(x[r.label] ?? '') }));
      } catch (e) {
        console.log('error mstetc ref', r.table, e);
      }
    }
    this.cdRef.detectChanges();
  }

  async load(): Promise<void> {
    this.error = '';
    const t = this.def.table;
    const keys = this.def.orderBy ?? (this.def.sortKey ? [this.def.sortKey] : []);
    const order = keys.map(k => `{${k}: asc_nulls_last}, `).join('') + '{' + this.ck + ': ' + (this.def.codeDesc ? 'desc' : 'asc') + '}';
    const Get = gql`
      query get_etc_${t}($id: smallint!) {
        ${t}(where: {id: {_eq: $id}}, order_by: [${order}]) { ${this.cols} }
      }`;
    try {
      const res = await firstValueFrom(this.apollo.query<Record<string, EtcRow[]>>({
        query: Get, variables: { id: this.usrsrv.compid }, fetchPolicy: 'network-only'
      }));
      if (res.error || !res.data) {
        throw res.error ?? new Error('結果がありません');
      }
      this.rows = (res.data[t] ?? []).map(r => ({ ...r }));
    } catch (e) {
      this.error = this.def.title + 'を読めませんでした：' + (e as Error).message;
      console.log('error mstetc load', e);
    }
    this.cdRef.detectChanges();
  }

  private get dirty(): boolean {
    return this.edit != null && JSON.stringify(this.edit) != this.orig;
  }

  /** 直している途中の中身を捨ててよいか聞く */
  private okToLeave(): boolean {
    return !this.dirty || confirm('保存していない変更があります。捨てますか？');
  }

  /** 入力欄に出す中身（選択肢の欄は文字にそろえる） */
  private toEdit(r: EtcRow): EtcRow {
    const e: EtcRow = { ...r };
    for (const f of this.allFields) {
      if (['store', 'hokuri', 'choice', 'ref'].includes(f.type)) {
        e[f.key] = this.selValue(e[f.key]);
      }
    }
    return e;
  }

  /** 選んでいる行か（一覧の色付け） */
  isSel(r: EtcRow): boolean {
    return !!this.edit && !this.isNew && this.rowKey(this.edit) == this.rowKey(r);
  }

  select(r: EtcRow) {
    if (this.isSel(r)) {
      return;
    }
    if (!this.okToLeave()) {
      return;
    }
    this.isNew = false;
    this.edit = this.toEdit(r);
    this.orig = JSON.stringify(this.edit);
    this.error = '';
  }

  newRow() {
    if (!this.okToLeave()) {
      return;
    }
    const r: EtcRow = { [this.ck]: '' };
    if (this.def.delKey) {
      r[this.def.delKey] = false;
    }
    this.allFields.forEach(f => r[f.key] = f.type == 'check' ? false : null);
    this.isNew = true;
    this.edit = r;
    this.orig = JSON.stringify(r);
    this.error = '';
  }

  cancel() {
    if (!this.okToLeave()) {
      return;
    }
    this.edit = null;
    this.isNew = false;
    this.error = '';
  }

  /** 入力の確認。問題があればその文を返す */
  private check(e: EtcRow): string {
    const code = String(e[this.ck] ?? '').trim();
    const codeLabel = this.def.codeLabel ?? 'コード';
    for (const f of this.keyFields) {
      if (e[f.key] == null || String(e[f.key]).trim() === '') {
        return f.label + 'を入れてください';
      }
    }
    if (!code) {
      return codeLabel + 'を入れてください';
    }
    if (this.def.codeType == 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(code)) {
      return codeLabel + 'は日付で入れてください';
    }
    if (this.isNew) {
      const key = this.rowKey({ ...e, [this.ck]: code });
      const same = this.rows.find(r => this.rowKey(r) == key);
      if (same) {
        return codeLabel + ' ' + code + ' はもう使われています' + (this.keyFields.length ? '（' + this.keyFields.map(f => this.cell(same, f)).join('・') + '）' : '')
          + (this.isDel(same) ? '（' + this.def.delLabel + 'の行）' : '');
      }
    }
    for (const f of this.def.fields) {
      const v = e[f.key];
      if (f.req && f.type != 'check' && (v == null || String(v).trim() === '')) {
        return f.label + 'を入れてください';
      }
      if (f.type == 'int' && v != null && String(v).trim() !== '' && !/^-?\d+$/.test(String(v).trim())) {
        return f.label + 'は整数で入れてください';
      }
      if (f.type == 'dec' && v != null && String(v).trim() !== '' && !/^-?\d+(\.\d+)?$/.test(String(v).trim())) {
        return f.label + 'は数で入れてください';
      }
    }
    return '';
  }

  /** 保存する値（空の文字は null、整数の欄は数にする） */
  private values(e: EtcRow): EtcRow {
    const v: EtcRow = {};
    if (this.def.delKey) {
      v[this.def.delKey] = !!e[this.def.delKey];
    }
    for (const f of this.def.fields) {
      v[f.key] = this.conv(f, e[f.key]);
    }
    return v;
  }

  /** 欄の値を保存する形にする（空の文字は null、整数の欄は数） */
  private conv(f: EtcField, x: EtcRow[string]): EtcRow[string] {
    if (f.type == 'check') {
      return !!x;
    }
    if (x == null || String(x).trim() === '') {
      return null;
    }
    if (f.type == 'int' || f.type == 'dec' || (f.type == 'ref' && f.ref?.num)) {
      return Number(String(x).trim());
    }
    return String(x).trim();
  }

  async save() {
    if (!this.edit || this.busy) {
      return;
    }
    this.error = this.check(this.edit);
    if (this.error) {
      return;
    }
    const t = this.def.table;
    const id = this.usrsrv.compid;
    const code = String(this.edit[this.ck]).trim();
    const vals = this.values(this.edit);
    // 主キー（id・code と、ほかのキーの列）
    const pk: EtcRow = { id, [this.ck]: code };
    for (const f of this.keyFields) {
      pk[f.key] = this.conv(f, this.edit[f.key]);
    }
    const Ins = gql`
      mutation ins_etc_${t}($obj: ${t}_insert_input!) {
        insert_${t}_one(object: $obj) { ${this.cols} }
      }`;
    const Upd = gql`
      mutation upd_etc_${t}($pk: ${t}_pk_columns_input!, $set: ${t}_set_input!) {
        update_${t}_by_pk(pk_columns: $pk, _set: $set) { ${this.cols} }
      }`;
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      const res = this.isNew
        ? await firstValueFrom(this.apollo.mutate<Record<string, EtcRow>>({
          mutation: Ins, variables: { obj: { ...pk, ...vals } }, refetchQueries: this.def.refetch
        }))
        : await firstValueFrom(this.apollo.mutate<Record<string, EtcRow>>({
          mutation: Upd, variables: { pk, set: vals }, refetchQueries: this.def.refetch
        }));
      const saved = res.data?.[this.isNew ? 'insert_' + t + '_one' : 'update_' + t + '_by_pk'];
      if (res.error || !saved) {
        throw res.error ?? new Error('保存できませんでした（行が見つかりません）');
      }
      const key = this.rowKey(saved);
      const i = this.rows.findIndex(r => this.rowKey(r) == key);
      if (i > -1) {
        this.rows[i] = { ...saved };
      } else {
        this.rows.push({ ...saved });
      }
      // 担当者・倉庫・配送方法の選択肢（ほかの画面と共用）は refetchQueries で読み直され、サービスの一覧も入れ替わる
      this.isNew = false;
      this.edit = this.toEdit(saved);
      this.orig = JSON.stringify(this.edit);
      if (t == 'msrate') {
        this.ratesrv.load(true).catch(() => undefined);  // 受注伝票・決算資料のレートをすぐ読み直す
      }
      this.usrsrv.toastSuc(this.def.title + 'を保存しました：' + code);
    } catch (e) {
      const msg = (e as Error).message;
      this.error = '保存できませんでした：' + msg
        + (/not found in type|no mutations exist/.test(msg) ? '\n（Hasura で staff の insert / update の権限がまだ付いていません。db/ の手順書のとおりに付けてください）' : '');
      console.log('error mstetc save', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
