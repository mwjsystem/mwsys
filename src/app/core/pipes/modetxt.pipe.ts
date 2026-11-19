import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'modetxt' })
export class ModetxtPipe implements PipeTransform {

  transform(value: number): string {
    let name: string;
    switch (value) {
      // 新しい画面の見出し（「新規入金伝票 123」など）とそろえる。取消済（4）は照会として出し、「取消済」の印は画面の側で付ける
      case 1:
        name = '新規';
        break;
      case 2:
        name = '変更';
        break;
      case 3:
      case 4:
        name = '照会';
        break;
      default:
        name = '';
    }
    return name;
  }

}
