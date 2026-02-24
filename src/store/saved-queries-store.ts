import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SavedQuery } from '../types/openfga';

interface SavedQueriesState {
  // Map of storeId -> saved queries
  queriesByStore: Record<string, SavedQuery[]>;
  
  // Actions
  getSavedQueries: (storeId: string) => SavedQuery[];
  addSavedQuery: (storeId: string, query: Omit<SavedQuery, 'id' | 'createdAt'>) => void;
  updateSavedQuery: (storeId: string, queryId: string, updates: Partial<SavedQuery>) => void;
  deleteSavedQuery: (storeId: string, queryId: string) => void;
  updateLastResult: (storeId: string, queryId: string, result: SavedQuery['lastResult']) => void;
  reorderQueries: (storeId: string, queries: SavedQuery[]) => void;
  importQueries: (storeId: string, queries: SavedQuery[], mode: 'replace' | 'merge') => void;
  clearAllQueries: (storeId: string) => void;
}

export const useSavedQueriesStore = create<SavedQueriesState>()(
  persist(
    (set, get) => ({
      queriesByStore: {},
      
      getSavedQueries: (storeId: string) => {
        return get().queriesByStore[storeId] || [];
      },
      
      addSavedQuery: (storeId: string, query: Omit<SavedQuery, 'id' | 'createdAt'>) => {
        set((state) => {
          const existingQueries = state.queriesByStore[storeId] || [];
          const newQuery: SavedQuery = {
            ...query,
            id: `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            createdAt: new Date().toISOString(),
          };
          return {
            queriesByStore: {
              ...state.queriesByStore,
              [storeId]: [...existingQueries, newQuery],
            },
          };
        });
      },
      
      updateSavedQuery: (storeId: string, queryId: string, updates: Partial<SavedQuery>) => {
        set((state) => {
          const existingQueries = state.queriesByStore[storeId] || [];
          return {
            queriesByStore: {
              ...state.queriesByStore,
              [storeId]: existingQueries.map((q) =>
                q.id === queryId ? { ...q, ...updates } : q
              ),
            },
          };
        });
      },
      
      deleteSavedQuery: (storeId: string, queryId: string) => {
        set((state) => {
          const existingQueries = state.queriesByStore[storeId] || [];
          return {
            queriesByStore: {
              ...state.queriesByStore,
              [storeId]: existingQueries.filter((q) => q.id !== queryId),
            },
          };
        });
      },
      
      updateLastResult: (storeId: string, queryId: string, result: SavedQuery['lastResult']) => {
        set((state) => {
          const existingQueries = state.queriesByStore[storeId] || [];
          return {
            queriesByStore: {
              ...state.queriesByStore,
              [storeId]: existingQueries.map((q) =>
                q.id === queryId ? { ...q, lastResult: result } : q
              ),
            },
          };
        });
      },
      
      reorderQueries: (storeId: string, queries: SavedQuery[]) => {
        set((state) => ({
          queriesByStore: {
            ...state.queriesByStore,
            [storeId]: queries,
          },
        }));
      },
      
      importQueries: (storeId: string, queries: SavedQuery[], mode: 'replace' | 'merge') => {
        set((state) => {
          const existingQueries = state.queriesByStore[storeId] || [];
          
          if (mode === 'replace') {
            // Replace all queries, regenerating IDs to avoid conflicts
            const importedQueries = queries.map(q => ({
              ...q,
              id: `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              lastResult: undefined, // Clear last results on import
            }));
            return {
              queriesByStore: {
                ...state.queriesByStore,
                [storeId]: importedQueries,
              },
            };
          } else {
            // Merge: add imported queries with new IDs
            const importedQueries = queries.map(q => ({
              ...q,
              id: `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              lastResult: undefined,
            }));
            return {
              queriesByStore: {
                ...state.queriesByStore,
                [storeId]: [...existingQueries, ...importedQueries],
              },
            };
          }
        });
      },
      
      clearAllQueries: (storeId: string) => {
        set((state) => ({
          queriesByStore: {
            ...state.queriesByStore,
            [storeId]: [],
          },
        }));
      },
    }),
    {
      name: 'openfga-saved-queries',
    }
  )
);
