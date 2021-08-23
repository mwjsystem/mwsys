import gql from 'graphql-tag';

export const GetMast = gql`
query get_member($where:msmember_bool_exp!,$where2:msmadr_bool_exp) {
  msmember(where:$where) {
    mcode
    sei
    mei
    kana
    mail
    mail2
    mail3
    mail4
    mail5
    tcode1
    tcode
    webid
    msmadrs(where:$where2) {
      eda
      zip
      region
      local
      street
      extend
      extend2
      tel
      fax
      tel2
      tel3
    }    
  }
}`;

export const GetMast0 = gql`
query get_members($id: smallint!) {
  msmember(where: {id: {_eq: $id}}, order_by: {mcode: asc}) {
    mcode
    sei
    mei
    del
  }
}`;

export const GetMast1 = gql`
query get_member($id: smallint!,$mcode:Int!) {
  msmember_by_pk(id: $id, mcode:$mcode) {
    mcode
    sei
    mei
    kana
    tankakbn
    mail
    mail2
    mail3
    mail4
    mail5
    torikbn
    sime
    site
    inday
    scode
    pcode
    hcode
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
    created_at
    updated_at
    lday
    created_by
    updated_by
    ntype
    tntype
    webid
    mtgt1
    mtgt2
    mtgt3
    mtgt4
    mtgt5
    msmadrs(order_by: {eda: asc}) {
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
      target
    }    
  }
}`;
export const GetMast2 = gql`
query get_bunrui($id: smallint!){
  msbunrui(where: {id: {_eq: $id}},order_by: {kubun:asc, sort:asc, code:asc}) {
    kubun
    code
    name
    memo
  }
}`;
export const GetMast3 = gql`
query get_staff($id: smallint!){
  msstaff(where: {id: {_eq: $id}}) {
    code
    name
    mail
  }
}`;
export const GetMast4 = gql`
query get_system($id: smallint!){
  mssystem(where: {id: {_eq: $id}}) {
    name
    subname
    maxmcd
  }
}`;
export const GetMast5 = gql`
query get_mcode($id: smallint!,$maxmcd: Int){
  msmember_aggregate(where: {id: {_eq: $id}, mcode: {_lt: $maxmcd}}) {
    aggregate {
      max {
        mcode
      }
    }
  }
}`;
export const GetMast6 = gql`
query get_eda($id: smallint!,$mcode: Int!){
  msmadr_aggregate(where: {id: {_eq: $id}, mcode: {_eq: $mcode}}) {
    aggregate {
      max {
        eda
      }
    }
  }
}`;
export const InsertMast1 = gql`
mutation ins_member($object: [msmember_insert_input!]!) {
  insert_msmember(objects: $object) {
    affected_rows
  }
}`;
export const InsertMast2 = gql`
mutation ins_madr($object: [msmadr_insert_input!]!) {
  insert_msmadr(objects: $object) {
    affected_rows
  }
}`;
export const UpdateMast1 = gql`
mutation upd_member($id: smallint!, $mcode: Int!,$_set: msmember_set_input!) {
  update_msmember(where: {id: {_eq: $id},mcode: {_eq:$mcode}}, _set: $_set)  {
    affected_rows
  }
}`;
export const UpdateMast2 = gql`
mutation upd_madr($id: smallint!, $mcode: Int!, $eda: Int!,$_set: msmadr_set_input!) {
  update_msmadr(where: {id: {_eq: $id},mcode: {_eq:$mcode},eda: {_eq:$eda}}, _set: $_set)  {
    affected_rows
  }
}`;