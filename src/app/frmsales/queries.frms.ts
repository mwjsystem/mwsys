import gql from 'graphql-tag';

export const GetGood = gql`
query get_good($id: smallint!,$gds:String!,$day: date!) {
  msgoods_by_pk(gcode: $gds, id: $id){
    msggroup {
      code
      gkbn
      vcode
    }
    gcode
    gtext
    unit
    koguchi
    max
    ordering
    send
    gskbn
    zkbn
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
    msgsptnks{
      sptnkbn
      sptanka
    }
    msgzais {
      zcode
      irisu
    }
  }
}`;
export const GetMember = gql`
query get_member($id: smallint!,$mcode:Int!) {
  msmember_by_pk(id: $id, mcode:$mcode) {
    mcode
    sei
    mei
    tankakbn
    torikbn
    scode
    pcode
    hcode
    mtax
    sscode
    tcode1
    tcode
    del
    sptnkbn
    daibunrui
    chubunrui
    shobunrui
    ntype
    tntype
    msmadrs(where: {eda: {_eq: 0}}) {
      adrname
      adrbikou
      adrinbikou
      adrokrbko
      del
    } 
    msmstits {
      patno
      seq
      stitype
      stitno
      vcode
      biko
      size
      color
      colorno
      letter
      position
      posibikou
    } 
  }
}`;
export const GetMadr = gql`
query get_member($id: smallint!,$mcode:Int!) {
  msmadr(where: {id: {_eq: $id,}, mcode: {_eq: $mcode}}, order_by: {eda: asc}) {
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
    adrbikou
    adrinbikou
    adrokrbko
    del
  } 
}`;

export const GetMast1 = gql`
query get_denno($id: smallint!,$maxdno: Int){
  trjyuden_aggregate(where: {id: {_eq: $id}, denno: {_lt: $maxdno}}) {
    aggregate {
      max {
        denno
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
    chubunrui
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
      mtax
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
      gkbn
      zkbn
      msgood {
        max
        koguchi
        ordering
        send
        msggroup {
          vcode
          gkbn
          code
        }
        msgzais {
          zcode
          irisu
        }
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