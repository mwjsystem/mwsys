/** Hasura の検索条件 1 件（bool_exp）。キーは列名、値は { _eq: 値 } などの比較 */
export type HasuraCond = Record<string, unknown>;

/** 検索ヘルプが Hasura のクエリへ渡す変数。where の _and に条件を追加していく */
export interface HasuraWhere {
  where: { _and: HasuraCond[] };
}
