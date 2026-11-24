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
import { EtcDef, EtcField, STAFF_DEF } from './mstetc-defs';

/** 一覧と入力欄の 1 行（列は表ごとに違うので、キーで読む） */
type EtcRow = Record<string, string | number | boolean | null>;

/**
 * 担当者マスタ・倉庫マスタのメンテナンス（各マスタ → 担当者マスタ / 倉庫マスタ）。
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
  private apollo = inject(Apollo);
  private title = inject(Title);
  private cdRef = inject(ChangeDetectorRef);

  def: EtcDef = (inject(ActivatedRoute).snapshot.data['def'] as EtcDef) ?? STAFF_DEF;
  rows: EtcRow[] = [];
  /** 退職・削除の行も一覧に出す */
  showDel = false;
  /** 一覧の絞り込み（コード・名前など、どの列でも） */
  filter = '';

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
      this.strsrv.getStore().then(() => this.cdRef.detectChanges());
      if (this.def.fields.some(f => f.type == 'hokuri') && this.okrsrv.hokuri.length == 0) {
        this.okrsrv.getHokuri();
      }
      this.load();
    });
  }

  get listFields(): EtcField[] {
    return this.def.fields.filter(f => f.list);
  }

  get shown(): EtcRow[] {
    const q = this.filter.trim().toLowerCase();
    return this.rows.filter(r => (this.showDel || !r['del'])
      && (!q || ['code', ...this.def.fields.map(f => f.key)].some(k => String(r[k] ?? '').toLowerCase().includes(q))));
  }

  get delCount(): number {
    return this.rows.filter(r => r['del']).length;
  }

  /** 一覧のセルに出す文字（倉庫・配送方法はコードに名前を付ける） */
  cell(r: EtcRow, f: EtcField): string {
    const v = r[f.key];
    if (v == null || v === '') {
      return '';
    }
    if (f.type == 'store') {
      return v + ' ' + (this.strsrv.scds.find(s => s.value == v)?.viewval ?? '');
    }
    if (f.type == 'hokuri') {
      return this.okrsrv.hokuri.find(h => h.code == v)?.name ?? String(v);
    }
    return String(v);
  }

  /** 倉庫の選択肢。今の値が削除済みの倉庫でも消えないように足す */
  storeOpts(cur: unknown): { value: string; viewval: string }[] {
    const opts = this.strsrv.scds.map(s => ({ value: String(s.value), viewval: s.value + ' ' + s.viewval }));
    if (cur && !opts.some(o => o.value == cur)) {
      opts.push({ value: String(cur), viewval: cur + '（一覧に無い倉庫）' });
    }
    return opts;
  }

  hokuriOpts(cur: unknown): { value: string; viewval: string }[] {
    const opts = this.okrsrv.hokuri.map(h => ({ value: String(h.code), viewval: h.name }));
    if (cur && !opts.some(o => o.value == cur)) {
      opts.push({ value: String(cur), viewval: cur + '（一覧に無い配送方法）' });
    }
    return opts;
  }

  private get cols(): string {
    return ['code', 'del', ...this.def.fields.map(f => f.key)].join(' ');
  }

  async load(): Promise<void> {
    this.error = '';
    const t = this.def.table;
    const Get = gql`
      query get_etc_${t}($id: smallint!) {
        ${t}(where: {id: {_eq: $id}}, order_by: [{sort: asc_nulls_last}, {code: asc}]) { ${this.cols} }
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

  select(r: EtcRow) {
    if (this.edit && !this.isNew && this.edit['code'] == r['code']) {
      return;
    }
    if (!this.okToLeave()) {
      return;
    }
    this.isNew = false;
    this.edit = { ...r };
    this.orig = JSON.stringify(this.edit);
    this.error = '';
  }

  newRow() {
    if (!this.okToLeave()) {
      return;
    }
    const r: EtcRow = { code: '', del: false };
    this.def.fields.forEach(f => r[f.key] = f.type == 'check' ? false : null);
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
    const code = String(e['code'] ?? '').trim();
    if (!code) {
      return 'コードを入れてください';
    }
    if (this.isNew && this.rows.some(r => r['code'] == code)) {
      return 'コード ' + code + ' はもう使われています' + (this.rows.find(r => r['code'] == code)?.['del'] ? '（' + this.def.delLabel + 'の行）' : '');
    }
    for (const f of this.def.fields) {
      const v = e[f.key];
      if (f.req && (v == null || String(v).trim() === '')) {
        return f.label + 'を入れてください';
      }
      if (f.type == 'int' && v != null && String(v).trim() !== '' && !/^-?\d+$/.test(String(v).trim())) {
        return f.label + 'は整数で入れてください';
      }
    }
    return '';
  }

  /** 保存する値（空の文字は null、整数の欄は数にする） */
  private values(e: EtcRow): EtcRow {
    const v: EtcRow = { del: !!e['del'] };
    for (const f of this.def.fields) {
      const x = e[f.key];
      if (f.type == 'check') {
        v[f.key] = !!x;
      } else if (x == null || String(x).trim() === '') {
        v[f.key] = null;
      } else if (f.type == 'int') {
        v[f.key] = Number(String(x).trim());
      } else {
        v[f.key] = String(x).trim();
      }
    }
    return v;
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
    const code = String(this.edit['code']).trim();
    const vals = this.values(this.edit);
    const Ins = gql`
      mutation ins_etc_${t}($obj: ${t}_insert_input!) {
        insert_${t}_one(object: $obj) { ${this.cols} }
      }`;
    const Upd = gql`
      mutation upd_etc_${t}($id: smallint!, $code: String!, $set: ${t}_set_input!) {
        update_${t}_by_pk(pk_columns: {id: $id, code: $code}, _set: $set) { ${this.cols} }
      }`;
    this.busy = true;
    this.cdRef.detectChanges();
    try {
      const res = this.isNew
        ? await firstValueFrom(this.apollo.mutate<Record<string, EtcRow>>({
          mutation: Ins, variables: { obj: { id, code, ...vals } }, refetchQueries: this.def.refetch
        }))
        : await firstValueFrom(this.apollo.mutate<Record<string, EtcRow>>({
          mutation: Upd, variables: { id, code, set: vals }, refetchQueries: this.def.refetch
        }));
      const saved = res.data?.[this.isNew ? 'insert_' + t + '_one' : 'update_' + t + '_by_pk'];
      if (res.error || !saved) {
        throw res.error ?? new Error('保存できませんでした（行が見つかりません）');
      }
      const i = this.rows.findIndex(r => r['code'] == code);
      if (i > -1) {
        this.rows[i] = { ...saved };
      } else {
        this.rows.push({ ...saved });
      }
      // 担当者・倉庫の選択肢（ほかの画面と共用）は refetchQueries で読み直され、サービスの一覧も入れ替わる
      this.isNew = false;
      this.edit = { ...saved };
      this.orig = JSON.stringify(this.edit);
      this.usrsrv.toastSuc(this.def.title + 'を保存しました：' + code);
    } catch (e) {
      const msg = (e as Error).message;
      this.error = '保存できませんでした：' + msg
        + (/not found in type|no mutations exist/.test(msg) ? '\n（Hasura で staff の insert / update の権限がまだ付いていません。db/20261206_mstetc.sql の手順で付けてください）' : '');
      console.log('error mstetc save', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }
}
