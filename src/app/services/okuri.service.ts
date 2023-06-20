import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})
export class OkuriService {

  hokuri: mwI.Hokuri[] = [];
  haisou: mwI.Haisou[] = [];
  hktime: mwI.Hktime[] = [];

  constructor(private usrsrv: UserService,
    private apollo: Apollo) {
  }

  getHokuri(): void {
    const GetMast = gql`
    query get_okuri($id: smallint!) {
      mshokuri(where: {id: {_eq: $id}}) {
        code
        name
        htype
        binshu
        mtchaku
        daibiki
        scode
        csvimp
        cuscode
        order 
        hscode
        onmin
        onmax
      }
    }`;
    this.apollo.watchQuery<any>({
      query: GetMast,
      variables: {
        id: this.usrsrv.compid
      },
    })
      .valueChanges
      .subscribe(({ data }) => {
        this.hokuri = data.mshokuri;
      }, (error) => {
        console.log('error query get_hokuri', error);
      });
  }

  getHaisou(): void {
    const GetMast = gql`
      query get_haisou($id: smallint!) {
        mshaisou(where: {id: {_eq: $id}}) {
          code
          name
          url
          numbering
        }
      }`;
    this.apollo.watchQuery<any>({
      query: GetMast,
      variables: {
        id: this.usrsrv.compid
      },
    })
      .valueChanges
      .subscribe(({ data }) => {
        this.haisou = data.mshaisou;
      }, (error) => {
        console.log('error query get_haisou', error);
      });
  }

  getHktime(): void {
    const GetMast = gql`
    query get_hktime($id: smallint!){
      mshktime(where: {id: {_eq: $id}}) {
        hscode
        code
        name
        bunrui  
      }
    }`;
    this.apollo.watchQuery<any>({
      query: GetMast,
      variables: {
        id: this.usrsrv.compid
      },
    })
      .valueChanges
      .subscribe(({ data }) => {
        this.hktime = data.mshktime;
      }, (error) => {
        console.log('error query get_hktime', error);
      });
  }

  getUrl(hcode): string {
    let ret: string = "";
    let i: number = this.hokuri.findIndex(obj => obj.code == hcode);
    if (i > -1) {
      let j: number = this.haisou.findIndex(obj => obj.code == this.hokuri[i].hscode);
      if (i > -1) {
        ret = this.haisou[j].url;
      }
    }
    return ret;
  }

  getHinfo(hcode) {
    let ret = { code: 0, numbering: false };
    let i: number = this.hokuri.findIndex(obj => obj.code == hcode);
    if (i > -1) {
      let j: number = this.haisou.findIndex(obj => obj.code == this.hokuri[i].hscode);
      if (j > -1) {
        ret.code = this.haisou[j].code;
        ret.numbering = this.haisou[j].numbering;
      }
    }
    return ret;
  }

  async setOkurino(hcode): Promise<string> {
    const type: string = 'sagawa_' + this.getHinfo(hcode).code;
    let okrno: number[] = await this.getNumber(type, 1);
    // console.log(type,okrno);
    return new Promise(resolve => {
      if (okrno.length == 1) {
        return resolve("採番エラー");
      } else if (okrno[0] <= okrno[2]) {
        return resolve(this.usrsrv.addCheckDigit7(okrno[0]));
      } else {
        const UpdateCurnum = gql`
          mutation setCurnum($id: smallint!, $typ: String!, $set: bigint!) {
            update_trnumber(where: {id: {_eq: $id}, type: {_eq: $typ}}, _set: {curnum: $set}) {
              returning {
                type
                curnum
                minnum
                maxnum
              }
            }
          }`;
        this.apollo.mutate<any>({
          mutation: UpdateCurnum,
          variables: {
            id: this.usrsrv.compid,
            typ: type,
            set: okrno[1]
          },
        }).subscribe(({ data }) => {
          console.log(data);
        }, (error) => {
          console.log('error mutation setCurnum', error);
        });
        return resolve(this.usrsrv.addCheckDigit7(okrno[1]));
      }
    });
  }

  async getNumber(type: string, inc: number): Promise<number[]> {
    const UpdateNumber = gql`
      mutation getNextnum($id: smallint!, $typ: String!, $inc: bigint!) {
        update_trnumber(where: {id: {_eq: $id}, type: {_eq: $typ}}, _inc: {curnum: $inc}) {
          returning {
            curnum
            minnum
            maxnum
          }
        }
      }`;
    // let observable:Observable<number> = new Observable<number>(observer => {
    return new Promise(resolve => {
      this.apollo.mutate<any>({
        mutation: UpdateNumber,
        variables: {
          id: this.usrsrv.compid,
          typ: type,
          inc: inc
        },
      }).subscribe(({ data }) => {
        return resolve([data.update_trnumber.returning[0].curnum, data.update_trnumber.returning[0].minnum, data.update_trnumber.returning[0].maxnum]);
        // observer.next(data.update_trnumber.returning[0].curnum);
        // observer.complete();
      }, (error) => {
        // this.toastr.error('採番エラー','採番タイプ' + type + 'の採番ができませんでした',
        //                     {closeButton: true,disableTimeOut: true,tapToDismiss: false});
        console.log('error mutation getNextnum', error);
        return resolve([0]);
      });
    });
  }

}