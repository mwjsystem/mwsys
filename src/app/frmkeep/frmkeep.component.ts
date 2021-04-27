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
  displayedColumns = ['sequ','keycode','extype','created_by','created_at','status','updated_by','updated_at','memo']; 
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
      },(error) => {
        console.log('error query get_opelog', error);
      });
  }

  confKeep(){
    const InsertOpelog = gql`
    mutation insLog($object: [tropelog_insert_input!]!) {
      insert_tropelog(objects: $object) {
        affected_rows
      }
    }`;  
    this.apollo.mutate<any>({
      mutation: InsertOpelog,
      variables: {
        "object": {
          id: this.usrsrv.compid,
          keycode: this.denno,
          extype:'KEEP_CON',
          created_by:this.usrsrv.staff.code
        }
      },
    }).subscribe(({ data }) => {
    
    },(error) => {
      console.log('error query insert_opelog', error);
    });
    // console.log(this.denno);
  }
}
