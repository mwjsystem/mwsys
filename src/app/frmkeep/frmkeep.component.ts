import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute, ParamMap  } from '@angular/router';
import { UserService } from './../services/user.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';

@Component({
  selector: 'app-frmkeep',
  templateUrl: './frmkeep.component.html',
  styleUrls: ['./frmkeep.component.scss']
})
export class FrmkeepComponent implements OnInit {
  denno:number;

  constructor(public usrsrv: UserService,
              private apollo: Apollo,
              private route: ActivatedRoute) { }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params: ParamMap)=>{
      if (params.get('denno') !== null){
        this.denno = +params.get('denno');
        // console.log(this.denno);
        // this.get_jyuden(this.denno);
      }
    }); 
  }

  confKeep(){
    const InsertOpelog = gql`
    mutation insLog($object: [tropelog_insert_input!]!) {
      update_trnumber(objects: $object) {
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
