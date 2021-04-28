import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute, ParamMap  } from '@angular/router';
import { UserService } from './../services/user.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { MatTableDataSource } from '@angular/material/table';

@Component({
  selector: 'app-frmkeep',
  templateUrl: './frmkeep.component.html',
  styleUrls: ['./frmkeep.component.scss']
})
export class FrmkeepComponent implements OnInit {
  denno:number;
  dataSource:MatTableDataSource<mwI.Tropelog>;
  displayedColumns = ['actionsColumn','sequ','keycode','extype','created_by','created_at','status','updated_by','updated_at','memo']; 
  constructor(public usrsrv: UserService,
              private apollo: Apollo,
              private route: ActivatedRoute) { }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params: ParamMap)=>{
      if (params.get('denno') !== null){
        this.denno = +params.get('denno');
        this.get_opelog(params.get('denno'));
        // console.log(this.denno);
        // this.get_jyuden(this.denno);
      }
    }); 
  }

  get_opelog(denno:string):void {
    const GetLog = gql`
    query get_opelog($id: smallint!,$kcd:String!,$typ:String!) {
      tropelog(where: {id: {_eq: $id},keycode: {_eq: $kcd},extype: {_eq: $typ}}, order_by: {sequ: asc}) {
        sequ
        keycode
        extype
        memo
        created_by
        created_at
        status
        updated_by
        updated_at
      }
    }`;
    this.apollo.watchQuery<any>({
      query: GetLog, 
        variables: { 
          id : this.usrsrv.compid,
          kcd: denno,
          typ:'KEEP'
        },
      })
      .valueChanges
      .subscribe(({ data }) => {
        this.dataSource= new MatTableDataSource<mwI.Tropelog>(data.tropelog);
        // console.log(data.tropelog);
      },(error) => {
        console.log('error query get_opelog', error);
      });
  }

  confKeep(i:number){
    console.log(i,this.dataSource.data[i]);
    const UpdateOpelog = gql`
    mutation iupdLog($seq: Int!, $obj: tropelog_set_input!) {
      update_tropelog(where: {sequ: {_eq: $seq}}, _set: $obj) {
        affected_rows
      }
    }`;  
    this.apollo.mutate<any>({
      mutation: UpdateOpelog,
      variables: {
        "seq": this.dataSource.data[i].sequ,
        "obj": {
          updated_by: this.usrsrv.staff.code.toString,
          status:'キープ済',
          updated_at:new Date()
        }
      },
    }).subscribe(({ data }) => {
    
    },(error) => {
      console.log('error query update_opelog', error);
    });
    // console.log(this.denno);
  }
}
