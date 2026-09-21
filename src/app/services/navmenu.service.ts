import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

/** get_bunrui クエリの結果（ナビメニュー。mmenu は大メニューの区分） */
interface NavmenuResult { msnavmenu: (mwI.Navmenu & { mmenu: string | number })[] }
@Injectable({
  providedIn: 'root'
})
export class NavmenuService {
  private usrsrv = inject(UserService);
  private apollo = inject(Apollo);

  
  public menu: { [key: string]: mwI.Navmenu[]; } = {};

  getNavmenu(): void {
    this.qryNavmenu();
  }
  
  async qryNavmenu(): Promise<{ [key: string]: mwI.Navmenu[]; }> {
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
		this.apollo.watchQuery<NavmenuResult>({
		  query: GetMast,
		  variables: {
			id: this.usrsrv.compid
		  },
		})
		  .valueChanges
		  .subscribe(({ data }) => {

			(data as NavmenuResult).msnavmenu.forEach(element => {
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
