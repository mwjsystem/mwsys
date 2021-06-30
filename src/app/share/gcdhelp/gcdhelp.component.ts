import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatDialogRef } from "@angular/material/dialog";
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './../../services/user.service';
import { Subject } from 'rxjs';
// import { Gcd,GcdService } from './gcd.service';

 export interface Gcd {
    code:string;
    gcode:string;
    gtext:string;
    size:string;
    color:string;
    jan:string;
    irisu:number;
    iriunit:string;
    gskbn:number;
    tkbn:number;
    zkbn:number;
  }

@Component({
  selector: 'app-gcdhelp',
  templateUrl: './gcdhelp.component.html',
  styleUrls: ['./gcdhelp.component.scss']
})
export class GcdhelpComponent implements OnInit {
  @ViewChild(MatPaginator, {static: false}) paginator: MatPaginator;
  dataSource:MatTableDataSource<Gcd>;
  displayedColumns = ['code','gcode','gtext','size','color','jan','irisu','iriunit','gskbn','tkbn','zkbn'];
  public gcds:Gcd[];
  public code:string="";
  public jan:string="";
  public gtext:string="";
  public subject = new Subject<Gcd[]>();
  public observe = this.subject.asObservable();  
  constructor(private dialogRef: MatDialogRef<GcdhelpComponent>,
              public usrsrv: UserService,
              // public gcdsrv: GcdService,
              private apollo: Apollo) {
                this.dataSource= new MatTableDataSource<Gcd>(this.gcds);
                 }

  ngOnInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource= new MatTableDataSource<Gcd>(this.gcds);
    this.observe.subscribe(() => this.refresh());
  }
  filterGcd(){
    let varWh: {[k: string]: any}={"where" : {"_and":[
      {"id": {"_eq": this.usrsrv.compid}},
      {"tkbn": {"_eq": "0"}}
    ]}};
    if (this.code!==""){
      varWh.where._and.push({"code" : {"_like":"%" + this.code + "%"}});
    }
    if (this.jan!==""){
      varWh.where._and.push({"jan" : {"_like":"%" + this.jan + "%"}});
    }    
    if (this.gtext!==""){
      varWh.where._and.push({"gtext" : {"_like":"%" + this.gtext + "%"}});
    }
    const GetMast = gql`
    query get_goods($where:msgoods_bool_exp!) {
    msgoods(where:$where) {
      code
      gcode
      gtext
      size
      color
      jan
      irisu
      iriunit
      gskbn
      tkbn
      zkbn
      }
    }`;
    // console.log(varWh);
    this.apollo.watchQuery<any>({
        query: GetMast, 
        variables: varWh
      })
      .valueChanges
      .subscribe(({ data }) => {
        this.gcds=data.msgoods;
        this.subject.next();
        this.subject.complete();
      },(error) => {
        console.log('error query get_goods', error);
      });
  }

  setGcd(selected ) {
    this.dialogRef.close(selected);
  }

  close() {
    // this.mcdsrv.mcds=[];
    this.dialogRef.close();
  }

  refresh(): void {
    //tableのデータソース更新
    this.dataSource= new MatTableDataSource<Gcd>(this.gcds);
    this.dataSource.paginator = this.paginator;
  }

}
