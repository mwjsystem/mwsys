import { AbstractControl, FormGroup } from '@angular/forms';

/** 明細の 1 行（FormGroup）の項目を名前で取り出す。項目名を型で限定し、存在しない名前はコンパイルで検出する */
export function rowCtl<T extends string>(control: AbstractControl): Record<T, AbstractControl> {
  return (control as FormGroup).controls as Record<T, AbstractControl>;
}

/** クリップボードコピー用に、オブジェクトの値をカンマ区切りの 1 行（末尾に改行）へ変換する */
export function objectToArray(obj: object): string {
  var result = Object.keys(obj).map((key: string) => {
    let value = (obj as Record<string, unknown>)[key];
    // console.log(value)
    return value;
  });
  // console.log(result.toString())
  return result.toString() + "\n";
}
