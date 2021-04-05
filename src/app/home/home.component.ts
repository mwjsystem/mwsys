import { Component, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  // userInfo: {[key: string]: any} = {};
  constructor(private title: Title) { 
    this.title.setTitle('ホーム(MwjSystem)');
  }

  ngOnInit(): void {
  }

}
