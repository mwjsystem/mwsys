import { Component, ChangeDetectionStrategy, input } from '@angular/core';

/**
 * 受注伝票の伝票番号のリンク（受注伝票画面を別のタブで照会モードで開く）。
 * 受注取込（おちゃのこ・Amazon・TKD）の処理結果などで使う。伝票番号が無ければ何も出さない
 */
@Component({
  selector: 'app-denlink',
  template: `@if (denno()) {<a class="denlink" [href]="'/frmsales/3/' + denno()" target="_blank" rel="noopener"
    title="受注伝票を開く（別のタブ）">{{denno()}}</a>}`,
  styles: [`.denlink { color: #1565c0; text-decoration: underline; }`],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DenlinkComponent {
  denno = input<number | null | undefined>();
}
