import gql from 'graphql-tag';

export const GetMast0 = gql`
query get_grpcode($id: smallint!, $code: String!) {
  msggroup(where:{_and:{id:{_eq:$id},
                  _or:[{code: {_eq: $code}},
                       {msgoods: {gcode: {_eq: $code}}},
                       {msgoods: {jan: {_eq: $code}}}
                      ]
                  }}) {
    code
  }
}`;

export const GetMast1 = gql`
query get_ggroup($id: smallint!, $grpcd: String!) {
  msggroup_by_pk(id: $id, code: $grpcd) {
    code
    kana
    name
    gkbn
    sozai
    vcode
    tcode
    bikou
    specurl
    genre
    created_at
    updated_at
    created_by
    updated_by
    category
    subcat
    msgoods(order_by: {gcode: asc}) {
      gcode
      color
      unit
      jan
      koguchi
      max
      ordering
      send
      size
      gskbn
      gtext
      tkbn
      weight
      lot
      vgcode
      msgtankas(limit:1,order_by: {day: desc}) {
        day
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
        genka
        currency
        cost
      }
      msgzais(order_by: {zcode: asc}) {
        irisu
        zcode
        msgoods{
          gtext
          unit
        }
      }
    }
  }
}`;

export const GetMast2 = gql`
query check_gcode($id: smallint!, $grpcd: String!, $gcode: String!) {
  msgoods(where: {msggroup: {code: {_neq: $grpcd}}, id: {_eq: $id}, gcode: {_eq: $gcode}}) {
    msggroup {
      code
    }
  }
}`;

export const InsertMast1 = gql`
mutation ins_group($object: [msggroup_insert_input!]!,$ogds: [msgoods_insert_input!]!,$otnk: [msgtanka_insert_input!]!) {
  insert_msggroup(objects: $object) {
    affected_rows
  }
  insert_msgoods(objects: $ogds) {
    affected_rows
  }
  insert_msgtanka(objects: $otnk) {
    affected_rows
  }
}`;
export const UpdateMast1 = gql`
mutation upd_ggroup($id: smallint!, $grpcd: String!,$_set: msggroup_set_input!,$ogds: [msgoods_insert_input!]!,$otnk: [msgtanka_insert_input!]!) {
  update_msggroup(where: {id: {_eq: $id},code: {_eq:$grpcd}}, _set: $_set)  {
    affected_rows
  }
  insert_msgoods(objects:$ogds, on_conflict: {constraint: msgvari_pkey, update_columns: [size,
    color,
    gskbn,
    jan,
    weight,
    unit,
    tkbn,
    gtext,
    max,
    send,
    ordering,
    koguchi,
    lot,
    vgcode
    ]}) {
    affected_rows
  }
  insert_msgtanka(objects: $otnk, on_conflict: {constraint: msgtanka_pkey, update_columns:[tanka1,
    tanka2,
    tanka3,
    tanka4,
    tanka5,
    tanka6,
    tanka7,
    tanka8,
    tanka9,
    cost,
    genka,
    taxrate,
    currency
    ]}) {
    affected_rows
  }
}`;
export const UpdateMast2 = gql`
mutation upd_goods($id: smallint!, $grpcd: String!,$_set: msmadr_set_input!) {
  update_msgdoos(where: {id: {_eq: $id},code: {_eq:$grpcd}}, _set: $_set)  {
    affected_rows
  }
}`;