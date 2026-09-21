import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'jdate',
    standalone: false
})
export class JdatePipe implements PipeTransform {

  transform(date: string | number | Date): string {
    let lcdate:Date = new Date(date);
    return date ? '('+[ "日", "月", "火", "水", "木", "金", "土" ][lcdate.getDay()]+')': '  ';
  }

}
