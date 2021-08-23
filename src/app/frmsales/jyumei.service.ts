import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { UserService } from './../services/user.service';

@Injectable({
  providedIn: 'root'
})
export class JyumeiService {
  public jyumei: mwI.Jyumei[]=[]; //読込時にfrmsales⇒jmeitblコンポーネントへ渡すときのみ使用
  public denno:number=0;
  public mtax:string;
  public tankakbn:string;
  public sptnkbn:string;
  // public souko:string;
  public ntype:number;
  public tntype:number;
  public address:string="";
  public subject = new Subject<boolean>();
  public observe = this.subject.asObservable();
  constructor(private usrsrv: UserService,
              private toastr: ToastrService) { }

  async get_denno(){
    // console.log(this.denno,this.denno==0); 
    // let observable:Observable<number> = new Observable<number>(observer => {
      // console.log(this.denno,this.denno==0); 
      if (this.denno==0) {  
        // console.log(this.denno,this.denno==0);   
        return await this.usrsrv.getNumber('jdenno',1);
      }else{
        // console.log(this.denno,this.denno==0);
        return this.denno;
      }
    // });
  }
  edit_jyumei(data:any[]){
    data.forEach(element => {
      // console.log(element);
      let {msgood,...rest} = element;
      let {msggroup,...rest2} = msgood;
      // console.log(rest,rest2);
      this.jyumei.push({...msggroup, ...rest, ...rest2});
    });
    // console.log(this.jyumei);
  }
}
