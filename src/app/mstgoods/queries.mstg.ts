import gql from 'graphql-tag';

export const GetMast0 = gql`
query get_groups($id: smallint!) {
  msggroup(where: {id: {_eq: $id}}, order_by: {code: asc}) {
    code
    name
    kana
  }
}`;

export const GetMast1 = gql`
query get_ggroup($id: smallint!, $grpcd: String!) {
  msggroup_by_pk(id: $id, code: $grpcd) {
    code
    kana
    name
    sozai
    siire
    tcode
    bikou
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
      order
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
