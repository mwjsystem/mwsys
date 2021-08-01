import { Component, OnInit, ElementRef } from '@angular/core';
import { UserService } from './../../services/user.service';
import { DownloadService } from './../../services/download.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit {
  public db:string;  
  constructor(public usrsrv:UserService,
              public dwlsrv:DownloadService,
              public elementRef: ElementRef) { }

  ngOnInit():void {
    this.db=localStorage.getItem('MWSYS_DB');
    if(this.db==null){
      this.db='本番環境';
    } else {  
      this.db='テスト環境';
    }
    const color:string = localStorage.getItem(this.usrsrv.userInfo.nickname + 'MWSYS_COLOR');
    // console.log(color);
    if ( color !== null ){this.setColor(color);}
  }
  setColor(colorname:string):void {
    var links = document.getElementsByTagName("link"); 
    for(var i=0; i < links.length; i++) {
        var link = links[i];
        if (link.id=='themeAsset') {
          link.href = 'https://unpkg.com/@angular/material/prebuilt-themes/' + colorname + '.css';
        }
      }
    localStorage.setItem(this.usrsrv.userInfo.nickname + 'MWSYS_COLOR', colorname);
  }
  setDB(flg:boolean){
    if(flg){
      localStorage.setItem('MWSYS_DB','mwsystbl');
      window.location.reload();
    } else {
      localStorage.removeItem('MWSYS_DB');
      window.location.reload();
    }
  }
  dl_kick(form){
    // console.log(this.elementRef.nativeElement); 
    this.dwlsrv.dl_kick(this.usrsrv.system.urischema + form + this.usrsrv.compid,this.elementRef);
  }
}

