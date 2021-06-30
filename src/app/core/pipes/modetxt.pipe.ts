import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'modetxt'
})
export class ModetxtPipe implements PipeTransform {

  transform(value: number): string {
    let name: string;
    switch (value) {
      case 1:
        name = '【新規登録モード】';
      break;
      case 2:
        name = '【変更モード】';
      break;
      case 3:
        name = '【照会モード】';
      break;
      default:
        name = '';
    }
    return name;
  }

}
