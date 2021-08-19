import { Component, OnInit, Input } from '@angular/core';
import { FormGroupDirective, FormGroup, FormControl, Validators, ControlContainer, FormArray, FormBuilder } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import * as Query from './../../mstmember/queries.mstm';
import { UserService } from './../../services/user.service';
// import { TabService } from './../tabidx/tab.service';
import { Observable, Subject } from 'rxjs';

@Component({
  selector: 'app-address',
  templateUrl: './address.component.html',
  // providers: [TabService],
  styleUrls: ['./address.component.scss'],
  viewProviders: [
    {
      provide: ControlContainer,
      useExisting: FormGroupDirective
    }
  ]
})
export class AddressComponent implements OnInit {
  @Input() formName: string;
  constructor(private parent: FormGroupDirective,
              private usrsrv: UserService,
              private apollo: Apollo) { }

  ngOnInit(): void {
    const form = this.parent.form;
    // if (this.formName=='addr1') {
      form.addControl(this.formName, new FormGroup({
        zip: new FormControl(''),
        region: new FormControl(''),
        local: new FormControl(''),
        street: new FormControl(''),
        extend: new FormControl(''),
        extend2: new FormControl(''),
        adrname: new FormControl(''),
        tel: new FormControl(''),
        fax: new FormControl(''),
        tel2: new FormControl(''),
        tel3: new FormControl(''),
        adrbikou: new FormControl(''),
        adrinbikou: new FormControl(''),
        adrokrbko: new FormControl(''),
        del: new FormControl(''),
        target: new FormControl('')
      }));
    // } else {
    //   form.addControl(this.formName, new FormGroup({
    //     zip: new FormControl('', Validators.required),
    //     region: new FormControl('', Validators.required),
    //     local: new FormControl('', Validators.required),
    //     street: new FormControl(''),
    //     extend: new FormControl(''),
    //     extend2: new FormControl(''),
    //     adrname: new FormControl('', Validators.required),
    //     tel: new FormControl('', Validators.required),
    //     fax: new FormControl(''),
    //     tel2: new FormControl(''),
    //     tel3: new FormControl(''),
    //     adrbikou: new FormControl(''),
    //     adrinbikou: new FormControl(''),
    //     adrokrbko: new FormControl(''),
    //     del: new FormControl(''),
    //     target: new FormControl('')
    //   }));     
    // }   
  }
  updTel(fldnm:string,value:string){
    let val:string =this.usrsrv.convTel(value);
    // console.log(value,val);
    this.parent.form.get(this.formName).get(fldnm).setValue(val);
  }

  saveMadr(mcode:string|number,eda:string|number,mode:number):Subject<string|number> {
    // console.log(this.formName,eda);
    const form = this.parent.form;
    let neweda:Subject<string|number>=new Subject();
    let madr:any={
      id: this.usrsrv.compid,
      mcode: mcode,
      eda:eda,
      zip:this.usrsrv.editFrmval(form.get(this.formName),'zip'),
      region:this.usrsrv.editFrmval(form.get(this.formName),'region'),
      local:this.usrsrv.editFrmval(form.get(this.formName),'local'),
      street:this.usrsrv.editFrmval(form.get(this.formName),'street'),
      extend:this.usrsrv.editFrmval(form.get(this.formName),'extend'),
      tel:this.usrsrv.editFrmval(form.get(this.formName),'tel'),
      fax:this.usrsrv.editFrmval(form.get(this.formName),'fax'),
      tel2:this.usrsrv.editFrmval(form.get(this.formName),'tel2'),
      tel3:this.usrsrv.editFrmval(form.get(this.formName),'tel3'),
      extend2:this.usrsrv.editFrmval(form.get(this.formName),'extend2'),
      adrname:this.usrsrv.editFrmval(form.get(this.formName),'adrname'),
      adrbikou:this.usrsrv.editFrmval(form.get(this.formName),'adrbikou'),
      adrinbikou:this.usrsrv.editFrmval(form.get(this.formName),'adrinbikou'),
      adrokrbko:this.usrsrv.editFrmval(form.get(this.formName),'adrokrbko'),
      del:this.usrsrv.editFrmval(form.get(this.formName),'del'),
      ftel:this.usrsrv.editFtel(form.get(this.formName),'tel','fax','tel2','tel3'),
      target:this.usrsrv.editFrmval(form.get(this.formName),'target')
    }
    if(mode==2){      
      this.apollo.mutate<any>({
        mutation: Query.UpdateMast2,
        variables: {
          id: this.usrsrv.compid,
          mcode: mcode,
          eda:eda,
          "_set": madr
        },
      }).subscribe(({ data }) => {
        console.log('update_msmadr', data);
        neweda.next(eda);
        neweda.complete();
      },(error) => {
        console.log('error update_msmember', error);
      });
    } else {
      let madrs:any[]=[];
      this.apollo.watchQuery<any>({
        query: Query.GetMast6, 
          variables: { 
            id: this.usrsrv.compid,
            mcode: mcode
          },
        })
        .valueChanges     
        .subscribe(({ data }) => {
          if (eda>1){
            let lceda=data.msmadr_aggregate.aggregate.max.eda+1;
            madr.eda=lceda;
            neweda.next(lceda);
            neweda.complete();
          } else {
            madr.eda=eda; 
          }
          madrs.push(madr);
          this.apollo.mutate<any>({
            mutation: Query.InsertMast2,
            variables: {
              "object": madrs
            },
          }).subscribe(({ data }) => {
            console.log('Insert_msmadr', data);
          },(error) => {
            console.log('error Insert_msmadr ' + this.formName, error);
          }); 
        },(error) => {
          console.log('error query get_maxeda', error);
        });    
    }
    return neweda;
  } 
}
