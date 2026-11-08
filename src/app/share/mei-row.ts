import { AbstractControl, FormArray, FormGroup } from '@angular/forms';

/**
 * 伝票の明細で、何も入れていない行（商品コード・数量とも空）の扱い（改善要望 No.9 の続き）。
 * 最後の欄の Enter で足した空の行が残ると、商品コード必須のエラーで保存できなかった。
 * 入力のチェックはそのままにして、空の行だけが原因のときは保存できるようにし、保存の前にその行を消す。
 */
const blank = (v: unknown) => v == null || String(v).trim() === '';

/** 商品コード・数量とも空の行か */
export function isEmptyMei(row: AbstractControl): boolean {
  return blank(row.get('gcode')?.value) && blank(row.get('suu')?.value);
}

/** 空の明細行を除けば保存できるか（空でない明細が 1 行以上あり、ほかの項目にエラーが無い） */
export function validIgnoringEmpty(form: FormGroup, arrName = 'mtbl'): boolean {
  if (form.valid) {
    return true;
  }
  if (form.errors) {
    return false;
  }
  const arr = form.get(arrName) as FormArray | null;
  if (!arr || arr.errors) {
    return false;
  }
  const others = Object.entries(form.controls).every(([k, c]) => k === arrName || c.valid || c.disabled);
  const rows = arr.controls.filter(r => !isEmptyMei(r));
  return others && rows.length > 0 && rows.every(r => r.valid || r.disabled);
}

/** 空の明細行を消す（空でない行が 1 行以上あるときだけ）。消したら true */
export function dropEmptyMei(arr: FormArray): boolean {
  if (!arr.controls.some(r => !isEmptyMei(r))) {
    return false;
  }
  let dropped = false;
  for (let k = arr.length - 1; k >= 0; k--) {
    if (isEmptyMei(arr.at(k))) {
      arr.removeAt(k);
      dropped = true;
    }
  }
  return dropped;
}
