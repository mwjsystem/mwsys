import { Pipe, PipeTransform } from '@angular/core';
// import { Apollo } from 'apollo-angular';
// import gql from 'graphql-tag';
// import { UserService } from './../../services/user.service';
import { VendsService } from './../../services/vends.service';


@Pipe({
  name: 'vcdtxt'
})
export class VcdtxtPipe implements PipeTransform {
  constructor(private vensrv: VendsService) { }
  transform(value: string): string  {
    // console.log(value,this.vensrv.get_vcdtxt(value));
    return this.vensrv.get_vcdtxt(value);
    // let txt:string="";
    // const GetMast = gql`
    // query get_vendor($id: smallint!,$vcd: String!) {
    //   msvendor_by_pk(id:$id,code:$vcd) {
    //     adrname
    //   }
    // }`;
    // if(value!==null){
    //   this.apollo.watchQuery<any>({
    //     query: GetMast, 
    //       variables: { 
    //         id : this.usrsrv.compid,
    //         vcd: value
    //       },
    //     })
    //     .valueChanges
    //     .subscribe(({ data }) => {
    //       if(data.msvendor_by_pk!=null){
    //         txt=data.msvendor_by_pk.adrnmae;
    //         return txt;
    //       }
    //     },(error) => {
    //       console.log('error query get_vendor', error);
    //     });
    // }else{
    //       return txt;

    // }
  }
}
