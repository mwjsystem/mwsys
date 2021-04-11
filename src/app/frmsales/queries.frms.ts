import gql from 'graphql-tag';

export const GetMast2 = gql`
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

export const GetMast3 = gql`
query get_haisou($id: smallint!) {
  mshaisou(where: {id: {_eq: $id}}) {
    code
    name
    url
  }
}`;

export const GetMast4 = gql`
query get_hktime($id: smallint!){
  mshktime(where: {id: {_eq: $id}}) {
    hscode
    code
    name
    bunrui  
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
export const GetMast7 = gql`
query get_souko($id: smallint!) {
  mssouko(where: {id: {_eq: $id}},order_by: {sort: asc}) {
    code
    subname
  }
}`;
export const GetMast8 = gql`
query get_goods($id: smallint!,$day: date!) {
  msgoods(where: {id: {_eq: $id}}) {
    msggroup {
      gkbn
      siire
    }
    gcode
    subname
    irisu
    iriunit
    koguchi
    max
    order
    send
    skbn
    zkbn
    msgtankas_aggregate(where: {day: {_lt: $day}}) {
      aggregate {
        max {
          day
        }
      }
    }
  }
}`;
export const GetMast9 = gql`
query get_good($id: smallint!,$gds:String!,$day: date!) {
  msgoods_by_pk(gcode: $gds, id: $id){
    msggroup {
      gkbn
      siire
    }
    gcode
    gtext
    irisu
    iriunit
    koguchi
    max
    order
    send
    skbn
    zkbn
    msgtankas_aggregate(where: {day: {_lt: $day}}) {
      aggregate {
        max {
          day
        }
      }
    }
  }
}`;


export const GetJyuden = gql`
query get_jyuden($id: smallint!,$dno: Int!) {
  trjyuden_by_pk(denno: $dno, id: $id) {
    denno
    day
    yday
    sday
    uday
    nday
    hday
    htime
    hcode
    ncode
    nadr
    souko
    tcode
    bunsho
    dbikou
    nbikou
    obikou
    keep
    okurisuu
    okurino
    cusden
    inbikou
    gtotal
    souryou
    tesuu
    nebiki
    ttotal
    tax
    syoukei
    tyousei
    total
    okurinusi
    skbn
    uttotal
    utax
    httotal
    gtotalzn
    souryouzn
    tesuuzn
    nebikizn
    taxtotal
    genka
    hgenka
    egenka
    torikbn
    mcode
    scode
    jcode
    pcode
    daibunrui
    bumon
    shobunrui
    tcode1
    del
    created_at
    created_by
    updated_at
    updated_by
    daibiki
    trjyumeis(order_by: {line: asc}) {
      line
      day
      sday
      souko
      gcode
      gtext
      suu
      teika
      tanka
      money
      taxkbn
      mbikou
      genka
      spec
      tintanka
      touttanka
      taxtanka
      tinmoney
      toutmoney
      taxmoney
      taxrate
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