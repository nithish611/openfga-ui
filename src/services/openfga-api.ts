import type {
    AuthorizationModel,
    CheckRequest,
    CheckResponse,
    ConnectionConfig,
    ExpandRequest,
    ExpandResponse,
    ListAuthorizationModelsResponse,
    ListObjectsRequest,
    ListObjectsResponse,
    ListStoresResponse,
    ListUsersRequest,
    ListUsersResponse,
    OpenFGAError,
    ReadAuthorizationModelResponse,
    ReadTuplesResponse,
    Store,
    Tuple,
    TupleKey,
    WriteTuplesRequest,
} from '../types/openfga';

class OpenFGAApiService {
  private config: ConnectionConfig = {
    serverUrl: '',
    authMethod: 'none',
  };

  setConfig(config: ConnectionConfig) {
    this.config = config;
  }

  getConfig(): ConnectionConfig {
    return this.config;
  }

  // Fetch OIDC token from token endpoint
  private async fetchOidcToken(): Promise<string> {
    const oidc = this.config.oidcConfig;
    if (!oidc) {
      throw new Error('OIDC configuration is missing');
    }

    // Check if we have a cached token that's still valid
    if (this.config.cachedOidcToken && this.config.cachedOidcTokenExpiry) {
      const now = Date.now();
      // Use token if it has more than 60 seconds left
      if (this.config.cachedOidcTokenExpiry > now + 60000) {
        return this.config.cachedOidcToken;
      }
    }

    // Fetch new token
    const params = new URLSearchParams();
    params.set('grant_type', 'client_credentials');
    params.set('client_id', oidc.clientId);
    params.set('client_secret', oidc.clientSecret);
    if (oidc.audience) {
      params.set('audience', oidc.audience);
    }
    if (oidc.scopes) {
      params.set('scope', oidc.scopes);
    }

    const response = await fetch(oidc.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OIDC token fetch failed: ${errorText}`);
    }

    const data = await response.json();
    const accessToken = data.access_token;
    const expiresIn = data.expires_in || 3600; // Default to 1 hour

    // Cache the token
    this.config.cachedOidcToken = accessToken;
    this.config.cachedOidcTokenExpiry = Date.now() + (expiresIn * 1000);

    return accessToken;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    switch (this.config.authMethod) {
      case 'preshared':
        if (this.config.apiToken) {
          headers['Authorization'] = `Bearer ${this.config.apiToken}`;
        }
        break;
      case 'oidc':
        try {
          const token = await this.fetchOidcToken();
          headers['Authorization'] = `Bearer ${token}`;
        } catch (error) {
          console.error('Failed to fetch OIDC token:', error);
          throw error;
        }
        break;
      case 'none':
      default:
        // No auth header needed
        break;
    }

    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.serverUrl}${endpoint}`;
    const headers = await this.getHeaders();
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorData: OpenFGAError;
      try {
        errorData = await response.json();
      } catch {
        errorData = {
          code: 'UNKNOWN_ERROR',
          message: `HTTP ${response.status}: ${response.statusText}`,
        };
      }
      throw new Error(errorData.message || `Request failed with status ${response.status}`);
    }

    return response.json();
  }

  // Store operations
  async listStores(pageSize = 100, continuationToken?: string): Promise<ListStoresResponse> {
    const params = new URLSearchParams();
    params.set('page_size', pageSize.toString());
    if (continuationToken) {
      params.set('continuation_token', continuationToken);
    }
    return this.request<ListStoresResponse>(`/stores?${params.toString()}`);
  }

  async getStore(storeId: string): Promise<Store> {
    return this.request<Store>(`/stores/${storeId}`);
  }

  async createStore(name: string): Promise<Store> {
    return this.request<Store>('/stores', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async deleteStore(storeId: string): Promise<void> {
    await this.request<void>(`/stores/${storeId}`, {
      method: 'DELETE',
    });
  }

  // Authorization Model operations
  async listAuthorizationModels(
    storeId: string,
    pageSize = 100,
    continuationToken?: string
  ): Promise<ListAuthorizationModelsResponse> {
    const params = new URLSearchParams();
    params.set('page_size', pageSize.toString());
    if (continuationToken) {
      params.set('continuation_token', continuationToken);
    }
    return this.request<ListAuthorizationModelsResponse>(
      `/stores/${storeId}/authorization-models?${params.toString()}`
    );
  }

  async getAuthorizationModel(
    storeId: string,
    modelId: string
  ): Promise<ReadAuthorizationModelResponse> {
    return this.request<ReadAuthorizationModelResponse>(
      `/stores/${storeId}/authorization-models/${modelId}`
    );
  }

  async getLatestAuthorizationModel(
    storeId: string
  ): Promise<ReadAuthorizationModelResponse> {
    // Get the latest model by fetching with page_size=1
    const response = await this.listAuthorizationModels(storeId, 1);
    if (response.authorization_models.length === 0) {
      throw new Error('No authorization models found for this store');
    }
    return {
      authorization_model: response.authorization_models[0],
    };
  }

  async writeAuthorizationModel(
    storeId: string,
    model: Omit<AuthorizationModel, 'id'>
  ): Promise<{ authorization_model_id: string }> {
    return this.request<{ authorization_model_id: string }>(
      `/stores/${storeId}/authorization-models`,
      {
        method: 'POST',
        body: JSON.stringify(model),
      }
    );
  }

  // Tuple operations
  async readTuples(
    storeId: string,
    pageSize = 100,
    continuationToken?: string,
    tupleKey?: Partial<TupleKey>
  ): Promise<ReadTuplesResponse> {
    const body: Record<string, unknown> = {
      page_size: pageSize,
    };
    if (continuationToken) {
      body.continuation_token = continuationToken;
    }
    if (tupleKey) {
      body.tuple_key = tupleKey;
    }
    return this.request<ReadTuplesResponse>(`/stores/${storeId}/read`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async writeTuples(storeId: string, request: WriteTuplesRequest): Promise<void> {
    await this.request<Record<string, never>>(`/stores/${storeId}/write`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async addTuples(storeId: string, tuples: TupleKey[], modelId?: string): Promise<void> {
    const request: WriteTuplesRequest = {
      writes: {
        tuple_keys: tuples,
      },
    };
    if (modelId) {
      request.authorization_model_id = modelId;
    }
    await this.writeTuples(storeId, request);
  }

  async deleteTuples(storeId: string, tuples: TupleKey[], modelId?: string): Promise<void> {
    const request: WriteTuplesRequest = {
      deletes: {
        tuple_keys: tuples,
      },
    };
    if (modelId) {
      request.authorization_model_id = modelId;
    }
    await this.writeTuples(storeId, request);
  }

  // Query operations
  async check(storeId: string, request: CheckRequest): Promise<CheckResponse> {
    return this.request<CheckResponse>(`/stores/${storeId}/check`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async expand(storeId: string, request: ExpandRequest): Promise<ExpandResponse> {
    return this.request<ExpandResponse>(`/stores/${storeId}/expand`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async listObjects(storeId: string, request: ListObjectsRequest): Promise<ListObjectsResponse> {
    return this.request<ListObjectsResponse>(`/stores/${storeId}/list-objects`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async listUsers(storeId: string, request: ListUsersRequest): Promise<ListUsersResponse> {
    return this.request<ListUsersResponse>(`/stores/${storeId}/list-users`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.serverUrl}/healthz`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const openfgaApi = new OpenFGAApiService();
export default openfgaApi;
