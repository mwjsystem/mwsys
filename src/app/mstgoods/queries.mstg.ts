import gql from 'graphql-tag';

export const GetMast0 = gql`
query MyQuery($id: smallint!, $code: String!) {
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
    msgoods(order_by: {gcode: asc}) {
      gcode
      color
      irisu
      iriunit
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
      zkbn
      msgtankas(order_by: {day: desc}) {
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
      msgzais(order_by: {gcode: asc}) {
        irisu
        zcode
      }
    }
  }
}`;
export const InsertMast1 = gql`
mutation ins_group($object: [msggroup_insert_input!]!) {
  insert_msggroup(objects: $object) {
    affected_rows
  }
}`;
export const InsertMast2 = gql`
mutation ins_goods($object: [msgoods_insert_input!]!) {
  insert_msgoods(objects: $object) {
    affected_rows
  }
}`;
export const InsertMast3 = gql`
mutation ins_gtanka($object: [msgtanka_insert_input!]!) {
  insert_msgtanka(objects: $object) {
    affected_rows
  }
}`;
export const UpdateMast1 = gql`
mutation upd_ggroup($id: smallint!, $grpcd: String!,$_set: msggroup_set_input!) {
  update_msggroup(where: {id: {_eq: $id},code: {_eq:$grpcd}}, _set: $_set)  {
    affected_rows
  }
}`;
export const UpdateMast2 = gql`
mutation upd_madr($id: smallint!, $mcode: Int!, $eda: Int!,$_set: msmadr_set_input!) {
  update_msmadr(where: {id: {_eq: $id},mcode: {_eq:$mcode},eda: {_eq:$eda}}, _set: $_set)  {
    affected_rows
  }
}`;

export const DeleteMast2 = gql`
mutation del_goods($id: smallint!,$grpcd: String!) {
  delete_msgdoos(where: {id: {_eq: $id}, code: {_eq: $grpcd}}) {
    affected_rows
  }
}`;