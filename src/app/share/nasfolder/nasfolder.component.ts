import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogTitle, MatDialogContent, MatDialogActions } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { NasService } from './../../services/nas.service';
import { UserService } from './../../services/user.service';

/** 出荷フォルダ（NAS）の用途名（NasService の key） */
export const NAS_SHIP = 'ship';
/** 倉庫宛 FAX フォルダ（NAS。キープ表を保存する）の用途名 */
export const NAS_FAX = 'fax';

/** ダイアログに渡す設定（省略時は出荷フォルダ） */
export interface NasfolderParam {
  key: string;
  title: string;
  /** 説明 */
  usage: string;
  /** 例（フォルダの場所） */
  example: string;
}
export const NASFOLDER_SHIP: NasfolderParam = {
  key: NAS_SHIP, title: '出荷フォルダ（NAS）の設定',
  usage: '出荷指示書・納品書・送り状データを保存する', example: '\\\\192.168.30.133\\share\\asago出荷'
};
export const NASFOLDER_FAX: NasfolderParam = {
  key: NAS_FAX, title: '倉庫宛FAXフォルダ（NAS）の設定',
  usage: 'キープ表を保存する（倉庫のマクロが印刷する）', example: '\\\\192.168.30.133\\share\\asago宛FAX'
};

/**
 * 出荷フォルダ（NAS）の設定。各 PC で最初に一度、保存先のフォルダ（例: \\192.168.30.133\share\asago出荷）を選ぶ。
 * 「書き込みテスト」で、選んだフォルダに MWSys書込テスト\テスト_日時.txt を書いて読み戻せるかを確認する。
 */
@Component({
    selector: 'app-nasfolder',
    templateUrl: './nasfolder.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatButton, MatIcon]
})
export class NasfolderComponent implements OnInit {
  nassrv = inject(NasService);
  private usrsrv = inject(UserService);
  private cdRef = inject(ChangeDetectorRef);
  private dialogRef = inject<MatDialogRef<NasfolderComponent>>(MatDialogRef);
  /** どのフォルダの設定か */
  param: NasfolderParam = inject<NasfolderParam | null>(MAT_DIALOG_DATA, { optional: true }) ?? NASFOLDER_SHIP;

  /** 選んであるフォルダの名前（未設定は空） */
  folderName = '';
  /** 書き込みテストの結果 */
  result = '';
  /** フォルダへの保存が使えないときの原因の表示用 */
  secure = window.isSecureContext;
  origin = window.location.origin;
  agent = navigator.userAgent;
  busy = false;

  async ngOnInit() {
    if (this.nassrv.supported) {
      this.folderName = (await this.nassrv.get(this.param.key))?.name ?? '';
    }
    this.cdRef.detectChanges();
  }

  async pick() {
    this.result = '';
    try {
      const dir = await this.nassrv.pick(this.param.key);
      if (dir) {
        this.folderName = dir.name;
      }
    } catch (e) {
      this.result = 'フォルダを選べませんでした：' + (e as Error).message;
    }
    this.cdRef.detectChanges();
  }

  async test() {
    this.busy = true;
    this.result = '書き込んでいます…';
    this.cdRef.detectChanges();
    try {
      const root = await this.nassrv.open(this.param.key);
      const now = new Date();
      const stamp = this.usrsrv.formatDate(now).replace(/-/g, '') + ('0' + now.getHours()).slice(-2) + ('0' + now.getMinutes()).slice(-2) + ('0' + now.getSeconds()).slice(-2);
      const name = 'テスト_' + stamp + '.txt';
      const text = 'MWSystem からの書き込みテスト ' + now.toLocaleString('ja-JP') + '\r\n日本語のファイル名・内容の確認';
      const dir = await this.nassrv.folder(root, 'MWSys書込テスト');
      await this.nassrv.write(dir, name, text);
      const back = await (await this.nassrv.read(dir, name))?.text();
      this.result = back == text
        ? '成功：「' + root.name + '\\MWSys書込テスト\\' + name + '」に書き込み、読み戻せました。確認後、このテスト用フォルダは削除して構いません。'
        : '書き込みはできましたが、読み戻した内容が一致しませんでした。';
    } catch (e) {
      this.result = '失敗：' + (e as Error).message;
      console.log('error nas test', e);
    }
    this.busy = false;
    this.cdRef.detectChanges();
  }

  close() {
    this.dialogRef.close();
  }
}
