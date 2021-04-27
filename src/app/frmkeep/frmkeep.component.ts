import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute, ParamMap  } from '@angular/router';

@Component({
  selector: 'app-frmkeep',
  templateUrl: './frmkeep.component.html',
  styleUrls: ['./frmkeep.component.scss']
})
export class FrmkeepComponent implements OnInit {
  denno:number;
  mode: number=3;

  constructor(private route: ActivatedRoute) { }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params: ParamMap)=>{
      if (params.get('denno') !== null){
        this.denno = +params.get('denno');
        // console.log(this.denno);
        // this.get_jyuden(this.denno);
      }
    }); 
  }

  test(){
    console.log(this.denno);
  }
}
