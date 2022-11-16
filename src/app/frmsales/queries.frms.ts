import gql from 'graphql-tag';

export const GetGood = gql`
query get_good($id: smallint!,$gds:String!,$day: date!,$mcd:String!,$sptnk:String) {
  msgoods_by_pk(gcode: $gds, id: $id){
    msggroup {
      code
      gkbn
      vcode
      msprocesses(where: {mcode: {_eq: $mcd}}) {
        prcno
        prcname
      }
    }
    gcode
    gtext
    unit
    koguchi
    max
    ordering
    send
    gskbn
    hgcode
    msgtankas(limit:1,where: {day: {_lt: $day}}, order_by: {day: desc_nulls_last}) {
      cost
      currency
      day
      genka
      tanka1
      tanka2
      tanka3
      tanka4
      tanka5
      tanka6
      tanka7
      tanka8
      tanka9
      taxrate
    }
    msgsptnks(limit:1,where: {day: {_lt: $day},sptnkbn: {_eq: $sptnk}}, order_by: {day: desc_nulls_last}) {
      sptnkbn
      sptanka
    }
    msgzais {
      zcode
      irisu
      msgoods {
        gskbn
      }
    }
  }
}`;
export const GetMember = gql`
query get_member($id: smallint!,$mcode:String!) {
  msmember_by_pk(id: $id, mcode:$mcode) {
    mcode
    sei
    mei
    tankakbn
    torikbn
    scde
    pcode
    hcode
    htime
    jcode
    mtax
    sscode
    tcode1
    tcode
    del
    bikou
    sptnkbn
    daibunrui
    chubunrui
    shobunrui
    ntype
    tntype
    ryoate
    gadr
    msmadrs {
      eda
      zip
      region
      local
      street
      extend
      tel
      fax
      tel2
      tel3
      extend2
      adrname
      nbikou
      sbikou
      obikou
      del
    } 
    msprocesses {
      prcno
      prcname
      code
    } 
  }
}`;
export const GetTran = gql`
query get_nymat($id: smallint!,$gcd: String!){
  vnymat(where: {id: {_eq: $id}, gcode: {_eq: $gcd},hatzn: {_gt: 0}}) {
    denno
    line
    yday
    ydaykbn
    suu
    hatzn
    nymat
    matzn
    mbiko
  }
}`;
// export const GetMadr = gql`
// query get_member($id: smallint!,$mcode:Int!) {
//   msmadr(where: {id: {_eq: $id,}, mcode: {_eq: $mcode}}, order_by: {eda: asc}) {
//     eda
//     zip
//     region
//     local
//     street
//     extend
//     tel
//     fax
//     tel2
//     tel3
//     extend2
//     adrname
//     adrbikou
//     adrinbikou
//     adrokrbko
//     del
//   } 
// }`;

// export const GetMast1 = gql`
// query get_denno($id: smallint!,$maxdno: Int){
//   trjyuden_aggregate(where: {id: {_eq: $id}, denno: {_lt: $maxdno}}) {
//     aggregate {
//       max {
//         denno
//       }
//     }
//   }
// }`;

// export const GetJyuden = gql`
// query get_jyuden($id: smallint!,$dno: Int!) {
//   trjyuden_by_pk(denno: $dno, id: $id) {
//     denno
//     jdstatus
//     jdshsta
//     torikbn
//     created_at
//     created_by
//     updated_at
//     updated_by
//     mcode
//     scode
//     ncode
//     nadr
//     bunsho
//     day
//     yday
//     sday
//     uday
//     nday
//     tcode
//     souko
//     skbn
//     jcode
//     pcode
//     hcode
//     hday
//     htime
//     okurisuu
//     okurino
//     bikou
//     nbikou
//     obikou
//     sbikou
//     cusden
//     ryoate
//     daibiki
//     daibunrui
//     chubunrui
//     shobunrui
//     tcode1
//     gtotalzn
//     souryouzn
//     tesuuzn
//     nebikizn
//     taxtotal
//     total
//     genka
//     hgenka
//     egenka
//     trjyumeis(order_by: {line: asc}) {
//       line
//       sday
//       souko
//       gcode
//       gtext
//       suu
//       tanka
//       tanka1
//       money
//       mtax
//       mbikou
//       genka
//       spec
//       tintanka
//       touttanka
//       taxtanka
//       tinmoney
//       toutmoney
//       taxmoney
//       taxrate
//       msgood {
//         max
//         koguchi
//         ordering
//         send
//         zkbn
//         unit
//         msggroup {
//           vcode
//           gkbn
//           code
//         }
//         msgzais {
//           zcode
//           irisu
//         }
//       }
//     }
//   }
// }`;

// export const InsertMast1 = gql`
// mutation ins_member($object: [msmember_insert_input!]!) {
//   insert_msmember(objects: $object) {
//     affected_rows
//   }
// }`;
// export const InsertMast2 = gql`
// mutation ins_madr($object: [msmadr_insert_input!]!) {
//   insert_msmadr(objects: $object) {
//     affected_rows
//   }
// }`;
// export const UpdateMast1 = gql`
// mutation upd_member($id: smallint!, $mcode: Int!,$_set: msmember_set_input!) {
//   update_msmember(where: {id: {_eq: $id},mcode: {_eq:$mcode}}, _set: $_set)  {
//     affected_rows
//   }
// }`;
// export const UpdateMast2 = gql`
// mutation upd_madr($id: smallint!, $mcode: Int!, $eda: Int!,$_set: msmadr_set_input!) {
//   update_msmadr(where: {id: {_eq: $id},mcode: {_eq:$mcode},eda: {_eq:$eda}}, _set: $_set)  {
//     affected_rows
//   }
// }`;