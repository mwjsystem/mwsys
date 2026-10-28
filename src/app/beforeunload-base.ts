import { FormGroup } from '@angular/forms';
import { OnBeforeunload } from './beforeunload.guard';

/**
 * フォームの変更有無（dirty）に応じて離脱確認を行う共通処理。
 * BeforeunloadGuard（ルート離脱時）とブラウザの window:beforeunload イベントの両方から呼ばれる。
 * `host: {'(window:beforeunload)': 'beforeUnload($event)'}` は各コンポーネントの @Component デコレータ側に残す。
 */
export abstract class BeforeunloadBase implements OnBeforeunload {
  abstract form: FormGroup;

  shouldConfirmOnBeforeunload(): boolean {
    return this.form.dirty;
  }

  beforeUnload(e: Event): void {
    if (this.shouldConfirmOnBeforeunload()) {
      e.returnValue = true;
    }
  }
}
