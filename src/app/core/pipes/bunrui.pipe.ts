import { Pipe, PipeTransform } from '@angular/core';
import { BunruiService } from './../../services/bunrui.service';

@Pipe({
  name: 'bunrui'
})
export class BunruiPipe implements PipeTransform {
  constructor(private bunsrv: BunruiService) {}

  transform(value: string, kubun: string): string {
    // console.log(this.bunsrv.kbn);
    let i:number = this.bunsrv.kbn[kubun]?.findIndex(obj => obj.value == value);
    let name:string="";
    if( i > -1 ){
      name = this.bunsrv.kbn[kubun][i]['viewval'];
    }
    return name;
  }

}
