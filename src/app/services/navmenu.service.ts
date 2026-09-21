import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})
export class NavmenuService {
  
  public menu: { [key: string]: mwI.Navmenu[]; } = {};  
  
  constructor(private usrsrv: UserService,
    private apollo: Apollo) { }

  getNavmenu(): void {
    this.qryNavmenu();
  }
  
  async qryNavmenu(): Promise<any> {
    const GetMast = gql`
      query get_bunrui($id: smallint!){
		msnavmenu(where: {id: {_eq: $id}}, order_by: {mmenu: asc, sort: asc}) {
		  mmenu
		  smenu
	  	  tag
		  link
		  sort
		}
      }`;

    return new Promise(resolve => {
		this.apollo.watchQuery<any>({
		  query: GetMast,
		  variables: {
			id: this.usrsrv.compid
		  },
		})
		  .valueChanges
		  .subscribe(({ data }) => {

			data.msnavmenu.forEach((element: { mmenu: string | number; smenu: any; tag: any; link: any; sort: any; }) => {
			  this.menu[element.mmenu].push({ 
			                    smenu: element.smenu,
								tag: element.tag,
								link: element.link,	
								sort: element.sort
								});
			  
			});
			return resolve(this.menu);
		  }, (error) => {
			console.log('error query get_navmenu', error);
		});
    })

  }  
}
