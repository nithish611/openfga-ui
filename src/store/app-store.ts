import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthorizationModel, ConnectionConfig, Store, Tuple } from '../types/openfga';

interface AppState {
  // Connection
  connection: ConnectionConfig;
  isConnected: boolean;
  connectionError: string | null;
  
  // Stores
  stores: Store[];
  selectedStore: Store | null;
  storesLoading: boolean;
  storesContinuationToken: string | null;
  
  // Authorization Models
  authorizationModels: AuthorizationModel[];
  selectedModel: AuthorizationModel | null;
  modelsLoading: boolean;
  
  // Tuples
  tuples: Tuple[];
  tuplesLoading: boolean;
  tuplesContinuationToken: string | null;
  
  // UI State
  activeTab: 'model' | 'tuples' | 'check' | 'expand' | 'list-objects' | 'list-users';
  darkMode: boolean;
  
  // Actions
  setConnection: (config: ConnectionConfig) => void;
  setIsConnected: (connected: boolean) => void;
  setConnectionError: (error: string | null) => void;
  
  setStores: (stores: Store[]) => void;
  appendStores: (stores: Store[]) => void;
  setSelectedStore: (store: Store | null) => void;
  setStoresLoading: (loading: boolean) => void;
  setStoresContinuationToken: (token: string | null) => void;
  
  setAuthorizationModels: (models: AuthorizationModel[]) => void;
  setSelectedModel: (model: AuthorizationModel | null) => void;
  setModelsLoading: (loading: boolean) => void;
  
  setTuples: (tuples: Tuple[]) => void;
  appendTuples: (tuples: Tuple[]) => void;
  setTuplesLoading: (loading: boolean) => void;
  setTuplesContinuationToken: (token: string | null) => void;
  
  setActiveTab: (tab: AppState['activeTab']) => void;
  toggleDarkMode: () => void;
  
  reset: () => void;
}

const initialState = {
  connection: {
    serverUrl: 'http://localhost:8080',
    authMethod: 'none' as const,
    apiToken: '',
    oidcConfig: undefined,
    storeId: '',
    authorizationModelId: '',
  },
  isConnected: false,
  connectionError: null,
  
  stores: [],
  selectedStore: null,
  storesLoading: false,
  storesContinuationToken: null,
  
  authorizationModels: [],
  selectedModel: null,
  modelsLoading: false,
  
  tuples: [],
  tuplesLoading: false,
  tuplesContinuationToken: null,
  
  activeTab: 'model' as const,
  darkMode: false,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialState,
      
      setConnection: (config) => set({ connection: config }),
      setIsConnected: (connected) => set({ isConnected: connected }),
      setConnectionError: (error) => set({ connectionError: error }),
      
      setStores: (stores) => set({ stores }),
      appendStores: (newStores) => set((state) => ({
        stores: [...state.stores, ...newStores],
      })),
      setSelectedStore: (store) => set({ 
        selectedStore: store,
        authorizationModels: [],
        selectedModel: null,
        tuples: [],
        tuplesContinuationToken: null,
      }),
      setStoresLoading: (loading) => set({ storesLoading: loading }),
      setStoresContinuationToken: (token) => set({ storesContinuationToken: token }),
      
      setAuthorizationModels: (models) => set({ authorizationModels: models }),
      setSelectedModel: (model) => set({ selectedModel: model }),
      setModelsLoading: (loading) => set({ modelsLoading: loading }),
      
      setTuples: (tuples) => set({ tuples }),
      appendTuples: (newTuples) => set((state) => ({ 
        tuples: [...state.tuples, ...newTuples] 
      })),
      setTuplesLoading: (loading) => set({ tuplesLoading: loading }),
      setTuplesContinuationToken: (token) => set({ tuplesContinuationToken: token }),
      
      setActiveTab: (tab) => set({ activeTab: tab }),
      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
      
      reset: () => set(initialState),
    }),
    {
      name: 'openfga-ui-storage',
      partialize: (state) => ({
        connection: state.connection,
        darkMode: state.darkMode,
      }),
    }
  )
);
