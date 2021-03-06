import { Component, OnInit, ViewChild, ElementRef, Output, EventEmitter } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { Mcd, McdService } from './mcd.service';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { MatSpinner } from '@angular/material/progress-spinner';
import { Apollo } from 'apollo-angular';
import * as Query from './../../mstmember/queries.mstm';
import { UserService } from './../../services/user.service';
import { StaffService } from './../../services/staff.service';

@Component({
  selector: 'app-mcdtbl',
  templateUrl: './mcdtbl.component.html',
  styleUrls: ['./mcdtbl.component.scss']
})
export class McdtblComponent implements OnInit {
  @ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  @Output() setmcd = new EventEmitter();
  // public filters: any = [{id:'mcode',value:''},
  //                        {id:'sei',value:''},
  //                        {id:'kana',value:''},
  //                        {id:'mail',value:''},
  //                        {id:'tel',value:''}];
  dataSource:MatTableDataSource<Mcd>;
  displayedColumns = ['mcode','sei','kana','tcode1','tcode2','mail','webid','eda','zip','region','local','street','extend','extend2','adrname','tel']; 
  fname:string="";
  fkana:string="";
  fmail:string="";
  fadrnm:string="";
  ftel:string="";
  fwebid:string="";
  ftcd1:string="";
  ftcd:string="";
  overlayRef = this.overlay.create({
    hasBackdrop: true,
    positionStrategy: this.overlay
      .position().global().centerHorizontally().centerVertically()
  });
  constructor(public mcdsrv:McdService,
              public usrsrv: UserService,
              public stfsrv: StaffService,
              private overlay: Overlay,
              private apollo: Apollo) {
    this.dataSource= new MatTableDataSource<Mcd>(this.mcdsrv.mcds);
  }

  ngOnInit(): void {
    this.ftcd=this.usrsrv.staff.code;
    this.dataSource.paginator = this.paginator;    
    this.mcdsrv.observe.subscribe(() => this.refresh());
    // this.dataSource.filterPredicate = (data: Mcd, filtersJson: string) => {
    //   const matchFilter = [];
    //   const filters = JSON.parse(filtersJson);
    //   filters.forEach(filter => {
    //     const val = data[filter.id] === null ? '' : data[filter.id];
    //     matchFilter.push(val.toLowerCase().includes(filter.value.toLowerCase()));
    //   });
    //   return matchFilter.every(Boolean);
    // };
    // this.updateFilter('mcode',this.mcdsrv.filtx);
  }

  setMcd(row){
    this.mcdsrv.selro = row;
    // console.log("setMcd",this.mcdsrv.selro);
    this.setmcd.emit(this.mcdsrv.selro);
  }

  filterMcd(){
    let varWh: {[k: string]: any}={"where" : {"_and":[{"id": {"_eq": this.usrsrv.compid}}]}};
    // console.log(varWh,varWh.where);
    if (this.fname!==""){
      varWh.where._and.push({"_or" : [ {"sei":{"_like":"%" + this.fname + "%"}},
                                        {"mei":{"_like":"%" + this.fname + "%"}}
                                      ]});
    }
    if (this.fkana!==""){
      varWh.where._and.push({"kana" : {"_like":"%" + this.fkana + "%"}});
    }
    if (this.fwebid!==""){
      varWh.where._and.push({"webid" : {"_like":"%" + this.fwebid + "%"}});
    }
    if (this.fmail!==""){
      varWh.where._and.push({"_or" : [ {"mail":{"_like":"%" + this.fmail + "%"}},
                                        {"mail2":{"_like":"%" + this.fmail + "%"}},
                                        {"mail3":{"_like":"%" + this.fmail + "%"}},
                                        {"mail4":{"_like":"%" + this.fmail + "%"}},
                                        {"mail5":{"_like":"%" + this.fmail + "%"}}
                                      ]});
    }
    if (this.fadrnm!==""){
      varWh.where2 = {"_and":[{"_or" : [ {"extend":{"_like":"%" + this.fadrnm + "%"}},
                                     {"extend2":{"_like":"%" + this.fadrnm + "%"}},
                                     {"adrname":{"_like":"%" + this.fadrnm + "%"}}
                                    ]}]};
    }
    if (this.ftel!==""){
      // console.log(varWh,varWh.where2 != null);
      if (varWh.where2 != null){
          varWh.where2._and.push({"ftel" : {"_like":"%" + this.ftel + "%"}});
      } else {
        varWh.where2 = {"ftel" : {"_like":"%" + this.ftel + "%"}};
      }

    }
    if (this.ftcd!==""){
      varWh.where._and.push({"tcode" : {"_eq": this.ftcd}});
    }
    if (this.ftcd1!==""){
      varWh.where._and.push({"tcode1" : {"_eq": this.ftcd1}});
    }
    // {
    //   "where": {"_and":[
    //             {"id": {"_eq": 1}},
    //             {"_or":[ {"sei":{"_like":"%???%"}},{"mei":{"_like":"%???%"}}]},
    //             {"kana":{"_like":"%???%"}},
    //             {"_or":[ {"mail":{"_like":"%sano%"}},{"mail2":{"_like":"%???%"}}]}
    //             ]
    // },
    // "where2":{"zip": {"_like": "%%"},"tel":{"_like":"%%"}}
    // }
    this.mcdsrv.mcds=[];
    this.overlayRef.attach(new ComponentPortal(MatSpinner));
    this.apollo.watchQuery<any>({
        query: Query.GetMast, 
        variables: varWh
      })
      .valueChanges
      .subscribe(({ data }) => {
        console.log(data);
        for(let i=0;i<data.msmember.length;i++){
          for(let j=0;j<data.msmember[i].msmadrs.length;j++){
            this.mcdsrv.mcds.push({  
              mcode:data.msmember[i].mcode.toString(),
              sei:data.msmember[i].sei,
              mei:data.msmember[i].mei,
              kana:data.msmember[i].kana,
              mail:this.mcdsrv.set_mail(data.msmember[i].mail ,data.msmember[i].mail2,data.msmember[i].mail3,data.msmember[i].mail4,data.msmember[i].mail5),
              tcode1:data.msmember[i].tcode1,
              tcode2:data.msmember[i].tcode2,
              // del:data.msmember[i].msmadrs[j].edl,
              eda:data.msmember[i].msmadrs[j].eda,
              zip:data.msmember[i].msmadrs[j].zip,
              region:data.msmember[i].msmadrs[j].region,
              local:data.msmember[i].msmadrs[j].local,
              street:data.msmember[i].msmadrs[j].street,
              extend:data.msmember[i].msmadrs[j].extend,
              extend2:data.msmember[i].msmadrs[j].extend2,
              adrname:data.msmember[i].msmadrs[j].adrname,
              tel:this.mcdsrv.set_tel(data.msmember[i].msmadrs[j].tel,data.msmember[i].msmadrs[j].tel2,data.msmember[i].msmadrs[j].tel3,data.msmember[i].msmadrs[j].fax)
            });
          }
        }
        this.mcdsrv.subject.next();
        // this.mcdsrv.subject.complete();
        this.overlayRef.detach();
      },(error) => {
        console.log('error query get_members', error);
        this.overlayRef.detach();
      });
  }  

  // applyFilter():void {
  //   this.dataSource.filter = JSON.stringify(this.filters);
  //   if (this.dataSource.paginator) {
  //     this.dataSource.paginator.firstPage();
  //   }
  // }
  // updateFilter(fldid: string, filval: string) :void{
  //   let i:number = this.filters.findIndex(obj => obj.id == fldid);
  //   this.filters[i].value = filval;
  //   this.applyFilter();
  // }

  refresh(): void {
    //table???????????????????????????
    this.dataSource= new MatTableDataSource<Mcd>(this.mcdsrv.mcds);
    this.dataSource.paginator = this.paginator;
  }

}
