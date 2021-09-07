import { Pipe, PipeTransform } from '@angular/core';
import { BunruiService } from './../../services/bunrui.service';

@Pipe({
  name: 'bunrui'
})
export class BunruiPipe implements PipeTransform {
  constructor(private bunsrv: BunruiService) {
    // this.bunsrv.get_bunrui();
    // console.log(this.bunsrv.kbn);
  }

  transform(value: string, kubun: string): string {
    this.bunsrv.get_bunrui();
    let i:number = this.bunsrv.kbn[kubun]?.findIndex(obj => obj.value == value);
    console.log(kubun, this.bunsrv.kbn);
    let name:string="";
    if( i > -1 ){
      name = this.bunsrv.kbn[kubun][i]['viewval'];
    }
    return name;
  }

}
