import { Component, AfterViewInit, ChangeDetectorRef, OnInit, Inject, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { UserService } from './../../services/user.service';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { ToastrService } from 'ngx-toastr';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-gdsimage',
  templateUrl: './gdsimage.component.html',
  styleUrls: ['./gdsimage.component.scss']
})
export class GdsimageComponent implements OnInit,AfterViewInit {
  public noimgs:Boolean[]=[];
　public url:string="";
  public grpcd:string="";
  @ViewChildren('upfile',{read:ElementRef}) inputs:QueryList<ElementRef>;
  constructor(public usrsrv: UserService,
              public cdRef: ChangeDetectorRef,          
              private apollo: Apollo,
              private toastr: ToastrService,
              private http: HttpClient,
              private dialogRef: MatDialogRef<GdsimageComponent>,
              @Inject(MAT_DIALOG_DATA) data) {
     this.grpcd = data.grpcd;
     this.url=data.url;
   }

  ngOnInit(): void {
    this.get_url(this.grpcd);
    for(let i=0;i<9;i++){
      this.noimgs.push(false);
    }
  }
  ngAfterViewInit(): void{
    setTimeout(() => {
      this.cdRef.detectChanges();
    });
  }




  get_url(grpcd:string):void {
    const GetUrl = gql`
    query get_specurl($id: smallint!, $grpcd: String!) {
      msggroup_by_pk(id: $id, code: $grpcd) {
        specurl
      }
    }`;
    this.apollo.watchQuery<any>({
      query: GetUrl, 
        variables: { 
          id : this.usrsrv.compid,
          grpcd:grpcd
      },
    })
    .valueChanges
    .subscribe(({ data }) => {
      this.url=data.msggroup_by_pk.specurl;
    },(error) => {
      console.log('error query get_url', error);
    });
  }

  set_url(grpcd:string,url:string):void {
    const SetUrl= gql`
    mutation set_specurl($id: smallint!, $grpcd: String!, $url: String) {
      update_msggroup(where: {id: {_eq: $id}, code: {_eq: $grpcd}}, _set: {specurl: $url}) {
        affected_rows
      }
    }`;
    this.apollo.mutate<any>({
      mutation: SetUrl, 
      variables: { 
        id : this.usrsrv.compid,
        grpcd:grpcd,
        url:url
      },
    })
    .subscribe(({ data }) => {
      this.toastr.success('仕様書Urlの変更を保存しました');
    },(error) => {
      this.toastr.error("先に基本情報を保存してください");
      console.log('error query get_url', error);
    });

  }
  onClickFileInputButton(num:number){
    // console.log(this.inputs);
    this.inputs.toArray()[num].nativeElement.click();
  }
 //アップロードの実行
  onchange(list: any,num:string) {
    // ファイルが指定されていなければ
    if (list.length <= 0) { return; }

    // ファイルを取得
    let f = list[0];
    // console.log(list);
    // ファイルをセット
    let data = new FormData();
    data.append('upfile', f, this.grpcd + "_" + num + ".jpg");

    // サーバーに送信(画像データがあるので、POST)
    this.http.post('https://mwjapan.sakura.ne.jp/mwjsys/index.php?topath=./goods/&file=ins', data, {responseType: 'text'})
      .subscribe(
        data => this.cdRef.detectChanges(),
        error => console.log(error)
      );
  }
　
  delImg(num:string){
    // サーバーに送信(ファイル名のみなので、GET)
    this.http.get('https://mwjapan.sakura.ne.jp/mwjsys/index.php?topath=./goods/&file=' + this.grpcd + '_' + num + '.jpg', {responseType: 'text'})
      .subscribe(
        data => this.cdRef.detectChanges(),
        error => console.log(error)
      );
  }

  getTimestamp(){
    return this.usrsrv.formatTime();
    // this.cdRef.detectChanges()
  }

　openXlsx() {
　　window.open(this.url,"_blank");
  }

  saveUrl() {
    this.set_url(this.grpcd,this.url);
    this.dialogRef.close();
  }

  close() {
    this.dialogRef.close();
  }

}
