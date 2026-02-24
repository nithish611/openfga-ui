import { useCallback, useEffect, useState } from 'react';
import openfgaApi from '../services/openfga-api';
import { useAppStore } from '../store/app-store';
import { formatDateTime, formatRelativeTime } from '../utils/ulid';
import { CopyButton } from './CopyButton';
import { CustomSelect } from './CustomSelect';

interface StoreSelectorProps {
  compact?: boolean;
  darkMode?: boolean;
}

export function StoreSelector({ compact = false, darkMode = false }: StoreSelectorProps) {
  const {
    isConnected,
    stores,
    setStores,
    appendStores,
    selectedStore,
    setSelectedStore,
    storesLoading,
    setStoresLoading,
    storesContinuationToken,
    setStoresContinuationToken,
    authorizationModels,
    setAuthorizationModels,
    selectedModel,
    setSelectedModel,
    setModelsLoading,
  } = useAppStore();

  const [isCreating, setIsCreating] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Load authorization models when store is selected
  useEffect(() => {
    if (selectedStore) {
      loadAuthorizationModels(selectedStore.id);
    }
  }, [selectedStore]);

  const loadAuthorizationModels = async (storeId: string) => {
    setModelsLoading(true);
    try {
      const response = await openfgaApi.listAuthorizationModels(storeId);
      setAuthorizationModels(response.authorization_models);
      
      if (response.authorization_models.length > 0) {
        setSelectedModel(response.authorization_models[0]);
      }
    } catch (err) {
      console.error('Failed to load authorization models:', err);
    } finally {
      setModelsLoading(false);
    }
  };

  const handleStoreChange = (storeId: string) => {
    const store = stores.find((s) => s.id === storeId);
    if (store) {
      setSelectedStore(store);
    }
  };

  const handleModelChange = (modelId: string) => {
    const model = authorizationModels.find((m) => m.id === modelId);
    if (model) {
      setSelectedModel(model);
    }
  };

  const handleCreateStore = async () => {
    if (!newStoreName.trim()) return;

    setIsCreating(true);
    setError(null);

    try {
      const newStore = await openfgaApi.createStore(newStoreName.trim());
      setStores([newStore, ...stores]);
      setSelectedStore(newStore);
      setNewStoreName('');
      setShowCreateForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create store');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRefreshStores = async () => {
    setStoresLoading(true);
    try {
      const response = await openfgaApi.listStores();
      setStores(response.stores);
      setStoresContinuationToken(response.continuation_token || null);
    } catch (err) {
      console.error('Failed to refresh stores:', err);
    } finally {
      setStoresLoading(false);
    }
  };

  const handleLoadMoreStores = useCallback(async () => {
    if (!storesContinuationToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await openfgaApi.listStores(100, storesContinuationToken);
      appendStores(response.stores);
      setStoresContinuationToken(response.continuation_token || null);
    } catch (err) {
      console.error('Failed to load more stores:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [storesContinuationToken, loadingMore, appendStores, setStoresContinuationToken]);

  if (!isConnected) {
    return null;
  }

  if (compact) {
    return (
      <div className="pt-2 space-y-3">
        {/* Store Selection */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-600">Store</label>
            <div className="flex items-center gap-1">
              <button
                onClick={handleRefreshStores}
                disabled={storesLoading}
                className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                title="Refresh"
              >
                <svg className={`w-3 h-3 ${storesLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="p-1 text-gray-400 hover:text-orange-600 rounded transition-colors"
                title="Create new store"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
          
          {stores.length === 0 ? (
            <p className="text-xs text-gray-500 py-2">No stores found</p>
          ) : (
            <CustomSelect
              value={selectedStore?.id || ''}
              onChange={handleStoreChange}
              options={stores.map((store) => ({ value: store.id, label: store.name }))}
              placeholder="Select store..."
              color="orange"
              size="sm"
              searchable
              searchPlaceholder="Search stores..."
              onLoadMore={handleLoadMoreStores}
              hasMore={!!storesContinuationToken}
              loadingMore={loadingMore}
            />
          )}
        </div>

        {/* Create Store Form */}
        {showCreateForm && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newStoreName}
              onChange={(e) => setNewStoreName(e.target.value)}
              placeholder="Store name"
              className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateStore()}
            />
            <button
              onClick={handleCreateStore}
              disabled={isCreating || !newStoreName.trim()}
              className="px-2 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 text-xs"
            >
              {isCreating ? '...' : 'Add'}
            </button>
          </div>
        )}

        {/* Store Info */}
        {selectedStore && (
          <div className={`p-3 ${darkMode ? 'bg-orange-900/30 border-orange-700' : 'bg-orange-50 border-orange-200'} rounded-lg border`}>
            {/* Store ID with Copy */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0 flex-1">
                <div className={`text-[10px] ${darkMode ? 'text-orange-400' : 'text-orange-600'} font-medium uppercase tracking-wide mb-1`}>Store ID</div>
                <code className={`text-xs ${darkMode ? 'text-orange-300' : 'text-orange-700'} break-all block font-mono leading-relaxed`}>{selectedStore.id}</code>
              </div>
              <CopyButton text={selectedStore.id} label="Store ID" className="!p-1.5 flex-shrink-0 mt-3" />
            </div>
            
            {/* Timestamps */}
            <div className={`pt-3 border-t ${darkMode ? 'border-orange-700/50' : 'border-orange-200/70'} space-y-2`}>
              <div className={`flex items-center gap-2 text-xs ${darkMode ? 'text-orange-400' : 'text-orange-500'}`} title={formatDateTime(selectedStore.created_at)}>
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span><span className={`${darkMode ? 'text-orange-300' : 'text-orange-600'} font-medium`}>Created:</span> {formatRelativeTime(selectedStore.created_at)}</span>
              </div>
              {selectedStore.updated_at !== selectedStore.created_at && (
                <div className={`flex items-center gap-2 text-xs ${darkMode ? 'text-orange-400' : 'text-orange-500'}`} title={formatDateTime(selectedStore.updated_at)}>
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span><span className={`${darkMode ? 'text-orange-300' : 'text-orange-600'} font-medium`}>Updated:</span> {formatRelativeTime(selectedStore.updated_at)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // Original full layout
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-white/20">
      <div className="flex items-center gap-3">
        <div className="p-1.5 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
        </div>
        
        <div className="flex-1">
          {stores.length === 0 ? (
            <span className="text-sm text-gray-500">No stores found</span>
          ) : (
            <CustomSelect
              value={selectedStore?.id || ''}
              onChange={handleStoreChange}
              options={stores.map((store) => ({ value: store.id, label: store.name }))}
              placeholder="Select a store..."
              color="orange"
              searchable
              searchPlaceholder="Search stores..."
              onLoadMore={handleLoadMoreStores}
              hasMore={!!storesContinuationToken}
              loadingMore={loadingMore}
            />
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleRefreshStores}
            disabled={storesLoading}
            className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg disabled:opacity-50 transition-colors"
            title="Refresh stores"
          >
            <svg className={`w-4 h-4 ${storesLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-3 py-1.5 text-xs bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 flex items-center gap-1 font-medium shadow transition-all"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New
          </button>
        </div>
      </div>

      {showCreateForm && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newStoreName}
            onChange={(e) => setNewStoreName(e.target.value)}
            placeholder="Store name"
            className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-orange-500 focus:border-orange-500"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateStore()}
          />
          <button
            onClick={handleCreateStore}
            disabled={isCreating || !newStoreName.trim()}
            className="px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 text-xs font-medium"
          >
            {isCreating ? '...' : 'Create'}
          </button>
          <button
            onClick={() => { setShowCreateForm(false); setNewStoreName(''); setError(null); }}
            className="p-1.5 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      
      {error && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}
