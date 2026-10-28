import { NgModule } from '@angular/core';
import { HttpHeaders } from '@angular/common/http';
import { APOLLO_OPTIONS } from 'apollo-angular';
import { ApolloClientOptions, ApolloLink, InMemoryCache } from '@apollo/client/core';
import { setContext } from '@apollo/client/link/context';
import { HttpLink } from 'apollo-angular/http';
import { AuthService } from '@auth0/auth0-angular';
import { firstValueFrom } from 'rxjs';
import {
  DocumentNode,
  DefinitionNode,
  FieldNode,
  Kind,
  OperationDefinitionNode,
  SelectionNode,
  TypeNode,
  VariableDefinitionNode,
} from 'graphql';

const authHeader = new HttpHeaders()
  .set('Content-Type', 'application/json');

/** Auth0 のアクセストークンを Authorization ヘッダーに付与するリンク */
function createAuthLink(auth: AuthService): ApolloLink {
  return setContext(async () => {
    const token = await firstValueFrom(auth.getAccessTokenSilently());
    return { headers: { Authorization: `Bearer ${token}` } };
  });
}

/**
 * 接続先の切り替え（NAVbarの「本番環境⇔テスト環境」）について。
 *
 * Hasura（mwjtables.herokuapp.com、単一エンドポイント）には public スキーマと test スキーマが
 * 両方トラックされている。public のテーブルはそのままの名前（例: msgoods）でGraphQLに公開され、
 * test のテーブルは自動で "test_" が付いた名前（例: test_msgoods）で公開される。ネストしたリレーション
 * （商品グループ→商品 等）には接頭辞が付かない（Hasuraが親と同じスキーマ側を自動で解決するため）。
 *
 * そのため、既存のクエリ文字列（すべて public 前提でハードコードされている）は一切変更せず、
 * テスト環境が選択されているときだけ、送信直前にクエリの「ルート直下のフィールド名」と
 * 「変数宣言の型名（スカラー以外）」に "test_" を付け替える Apollo Link をかます。
 * ミューテーション（insert_/update_/delete_）は操作名の後ろに "test_" を入れる（toTestFieldName）。
 */
const TEST_PREFIX = 'test_';

/** Hasura/Postgres の組み込みスカラー型名。テーブル固有の生成型ではないので接頭辞を付けない */
const SCALAR_TYPES = new Set([
  'Int', 'Float', 'String', 'Boolean', 'ID',
  'smallint', 'integer', 'bigint', 'numeric', 'float4', 'float8',
  'date', 'timestamp', 'timestamptz', 'time', 'timetz', 'interval',
  'json', 'jsonb', 'uuid', 'bytea', 'bit', 'bpchar', 'varchar', 'text', 'citext', 'name',
]);

function prefixTypeNode(node: TypeNode): TypeNode {
  if (node.kind === Kind.NON_NULL_TYPE) {
    return { ...node, type: prefixTypeNode(node.type) as any };
  }
  if (node.kind === Kind.LIST_TYPE) {
    return { ...node, type: prefixTypeNode(node.type) as any };
  }
  if (SCALAR_TYPES.has(node.name.value)) {
    return node;
  }
  return { ...node, name: { ...node.name, value: TEST_PREFIX + node.name.value } };
}

function prefixVariableDefinition(vd: VariableDefinitionNode): VariableDefinitionNode {
  return { ...vd, type: prefixTypeNode(vd.type) };
}

function prefixRootSelection(sel: SelectionNode): SelectionNode {
  if (sel.kind !== Kind.FIELD) {
    return sel;
  }
  const field = sel as FieldNode;
  // レスポンスのキー名は元のまま（= alias未指定なら元のフィールド名）になるよう、
  // エイリアスをレスポンスキーで明示的に固定してから、実際に問い合わせるフィールド名だけ test_ を付ける。
  // こうしないと Apollo Client 側のキャッシュ/正規化が元のフィールド名を探しに行って失敗する。
  const responseKey = field.alias?.value ?? field.name.value;
  return {
    ...field,
    alias: { kind: Kind.NAME, value: responseKey },
    name: { ...field.name, value: toTestFieldName(field.name.value) },
  };
}

/**
 * ルート直下のフィールド名を test スキーマ側の名前にする。
 * Hasura の既定の命名は、照会系は接頭辞（trjyuden → test_trjyuden、trjyuden_by_pk → test_trjyuden_by_pk）だが、
 * 更新系は操作名の後ろに入る（update_trnumber → update_test_trnumber、insert_trseikyu_one → insert_test_trseikyu_one）。
 */
function toTestFieldName(name: string): string {
  const m = /^(insert|update|delete)_(.+)$/.exec(name);
  return m ? m[1] + '_' + TEST_PREFIX + m[2] : TEST_PREFIX + name;
}

function prefixOperation(def: OperationDefinitionNode): OperationDefinitionNode {
  return {
    ...def,
    variableDefinitions: def.variableDefinitions?.map(prefixVariableDefinition),
    selectionSet: {
      ...def.selectionSet,
      selections: def.selectionSet.selections.map(prefixRootSelection),
    },
  };
}

function toTestSchema(doc: DocumentNode): DocumentNode {
  const definitions: DefinitionNode[] = doc.definitions.map(def =>
    def.kind === Kind.OPERATION_DEFINITION ? prefixOperation(def) : def
  );
  return { ...doc, definitions };
}

const schemaSwitchLink = new ApolloLink((operation, forward) => {
  if (localStorage.getItem('MWSYS_DB') != null) {
    operation.query = toTestSchema(operation.query);
  }
  return forward(operation);
});

export function createApollo(httpLink: HttpLink, auth: AuthService): ApolloClientOptions {
  const uri = 'https://mwjtables.herokuapp.com/v1/graphql';
  return {
    link: ApolloLink.from([
      schemaSwitchLink,
      createAuthLink(auth),
      httpLink.create({ uri, headers: authHeader }),
    ]),
    cache: new InMemoryCache(),
  };
}

@NgModule({
  providers: [
    {
      provide: APOLLO_OPTIONS,
      useFactory: createApollo,
      deps: [HttpLink, AuthService],
    },
  ],
})
export class GraphQLModule {}
