// OpenFGA API Types

export interface Store {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface ListStoresResponse {
  stores: Store[];
  continuation_token?: string;
}

export interface AuthorizationModel {
  id: string;
  schema_version: string;
  type_definitions: TypeDefinition[];
  conditions?: Record<string, Condition>;
}

export interface TypeDefinition {
  type: string;
  relations?: Record<string, Userset>;
  metadata?: Metadata;
}

export interface Metadata {
  relations?: Record<string, RelationMetadata>;
}

export interface RelationMetadata {
  directly_related_user_types?: RelationReference[];
}

export interface RelationReference {
  type: string;
  relation?: string;
  wildcard?: Record<string, never>;
  condition?: string;
}

export interface Userset {
  this?: Record<string, never>;
  computedUserset?: ObjectRelation;
  tupleToUserset?: TupleToUserset;
  union?: Usersets;
  intersection?: Usersets;
  difference?: Difference;
}

export interface ObjectRelation {
  object?: string;
  relation?: string;
}

export interface TupleToUserset {
  tupleset?: ObjectRelation;
  computedUserset?: ObjectRelation;
}

export interface Usersets {
  child?: Userset[];
}

export interface Difference {
  base?: Userset;
  subtract?: Userset;
}

export interface Condition {
  name: string;
  expression: string;
  parameters?: Record<string, ConditionParamTypeRef>;
}

export interface ConditionParamTypeRef {
  type_name: string;
  generic_types?: ConditionParamTypeRef[];
}

export interface ListAuthorizationModelsResponse {
  authorization_models: AuthorizationModel[];
  continuation_token?: string;
}

export interface ReadAuthorizationModelResponse {
  authorization_model: AuthorizationModel;
}

export interface Tuple {
  key: TupleKey;
  timestamp: string;
}

export interface TupleKey {
  user: string;
  relation: string;
  object: string;
  condition?: TupleCondition;
}

export interface TupleCondition {
  name: string;
  context?: Record<string, unknown>;
}

export interface ReadTuplesResponse {
  tuples: Tuple[];
  continuation_token?: string;
}

export interface WriteTuplesRequest {
  writes?: {
    tuple_keys: TupleKey[];
  };
  deletes?: {
    tuple_keys: TupleKey[];
  };
  authorization_model_id?: string;
}

export interface CheckRequest {
  tuple_key: TupleKey;
  contextual_tuples?: {
    tuple_keys: TupleKey[];
  };
  authorization_model_id?: string;
  context?: Record<string, unknown>;
}

export interface CheckResponse {
  allowed: boolean;
  resolution?: string;
}

export interface ExpandRequest {
  tuple_key: {
    relation: string;
    object: string;
  };
  authorization_model_id?: string;
}

export interface ExpandResponse {
  tree?: UsersetTree;
}

export interface UsersetTree {
  root?: UsersetTreeNode;
}

export interface UsersetTreeNode {
  name?: string;
  leaf?: Leaf;
  difference?: UsersetTreeDifference;
  union?: Nodes;
  intersection?: Nodes;
}

export interface Leaf {
  users?: Users;
  computed?: Computed;
  tupleToUserset?: UsersetTreeTupleToUserset;
}

export interface Users {
  users?: string[];
}

export interface Computed {
  userset?: string;
}

export interface UsersetTreeTupleToUserset {
  tupleset?: string;
  computed?: Computed[];
}

export interface UsersetTreeDifference {
  base?: UsersetTreeNode;
  subtract?: UsersetTreeNode;
}

export interface Nodes {
  nodes?: UsersetTreeNode[];
}

export interface ListObjectsRequest {
  authorization_model_id?: string;
  type: string;
  relation: string;
  user: string;
  contextual_tuples?: {
    tuple_keys: TupleKey[];
  };
  context?: Record<string, unknown>;
}

export interface ListObjectsResponse {
  objects: string[];
}

export interface ListUsersRequest {
  authorization_model_id?: string;
  object: {
    type: string;
    id: string;
  };
  relation: string;
  user_filters: UserTypeFilter[];
  contextual_tuples?: {
    tuple_keys: TupleKey[];
  };
  context?: Record<string, unknown>;
}

export interface UserTypeFilter {
  type: string;
  relation?: string;
}

export interface ListUsersResponse {
  users: User[];
}

export interface User {
  object?: {
    type: string;
    id: string;
  };
  userset?: {
    type: string;
    id: string;
    relation: string;
  };
  wildcard?: {
    type: string;
  };
}

export interface OpenFGAError {
  code: string;
  message: string;
}

// Connection configuration
export type AuthMethod = 'none' | 'preshared' | 'oidc';

export interface OIDCConfig {
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
  audience?: string;
  scopes?: string;
}

export interface ConnectionConfig {
  serverUrl: string;
  authMethod: AuthMethod;
  // Pre-shared key auth
  apiToken?: string;
  // OIDC auth
  oidcConfig?: OIDCConfig;
  // Cached OIDC token
  cachedOidcToken?: string;
  cachedOidcTokenExpiry?: number;
  // Legacy
  storeId?: string;
  authorizationModelId?: string;
}

// Saved Query types
export type SavedQueryType = 'check' | 'expand' | 'list-objects' | 'list-users';

export interface SavedQuery {
  id: string;
  name: string;
  type: SavedQueryType;
  createdAt: string;
  // Check query params
  user?: string;
  relation?: string;
  object?: string;
  context?: string;
  // List Objects params
  objectType?: string;
  // List Users params
  objectId?: string;
  userFilterType?: string;
  // Expected result (for assertions)
  expectedResult?: boolean | string[];
  // Last run result
  lastResult?: {
    success: boolean;
    allowed?: boolean;
    objects?: string[];
    users?: string[];
    error?: string;
    timestamp: string;
  };
}
