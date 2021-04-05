import gql from 'graphql-tag';

export const GetMast1 = gql`
query get_bunsho($id: smallint!) {
  msbunsho(where: {id: {_eq: $id}}) {
    code
    name
    title
    gakutxt
    stamp
    atesaki
    message
    second
    include
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