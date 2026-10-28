import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { NasService } from './../../services/nas.service';
import { UserService } from './../../services/user.service';

/** 出荷フォルダ（NAS）の用途名（NasService の key） */
export const NAS_SHIP = 'ship';

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

  /** 選んであるフォルダの名前（未設定は空） */
  folderName = '';
  /** 書き込みテストの結果 */
  result = '';
  busy = false;

  async ngOnInit() {
    if (this.nassrv.supported) {
      this.folderName = (await this.nassrv.get(NAS_SHIP))?.name ?? '';
    }
    this.cdRef.detectChanges();
  }

  async pick() {
    this.result = '';
    try {
      const dir = await this.nassrv.pick(NAS_SHIP);
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
      const root = await this.nassrv.open(NAS_SHIP);
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
