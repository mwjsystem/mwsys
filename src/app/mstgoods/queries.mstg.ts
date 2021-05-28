import gql from 'graphql-tag';

export const GetMast0 = gql`
query MyQuery($id: smallint!, $code: String!) {
  msggroup(where:{_and:{id:{_eq:$id},
                  _or:[{code: {_eq: $code}},
                       {msgoods: {gcode: {_eq: $code}}}
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
    siire
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
