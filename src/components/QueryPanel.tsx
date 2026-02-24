import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import openfgaApi from '../services/openfga-api';
import { useAppStore } from '../store/app-store';
import { useSavedQueriesStore } from '../store/saved-queries-store';
import type { AuthorizationModel, CheckResponse, ExpandResponse, ListObjectsResponse, ListUsersResponse, SavedQuery, SavedQueryType, Tuple } from '../types/openfga';
import { ConfirmDialog, useConfirmDialog } from './ConfirmDialog';
import { CopyButton } from './CopyButton';
import { CustomSelect, InlineSelect } from './CustomSelect';

type QueryType = 'check' | 'expand' | 'list-objects' | 'list-users';

// Helper to extract types and relations from model
function useModelInfo(model: AuthorizationModel | null) {
  return useMemo(() => {
    if (!model) {
      return { types: [], relationsByType: {}, allRelations: [] };
    }

    const types = model.type_definitions.map(td => td.type);
    const relationsByType: Record<string, string[]> = {};
    const allRelations = new Set<string>();

    for (const typeDef of model.type_definitions) {
      const relations = typeDef.relations ? Object.keys(typeDef.relations) : [];
      relationsByType[typeDef.type] = relations;
      relations.forEach(r => allRelations.add(r));
    }

    return { 
      types, 
      relationsByType, 
      allRelations: Array.from(allRelations) 
    };
  }, [model]);
}

// Helper to extract suggestions from actual tuples
function useTupleSuggestions(tuples: Tuple[]) {
  return useMemo(() => {
    const users = new Set<string>();
    const objects = new Set<string>();
    const relations = new Set<string>();
    const userIdsByType: Record<string, Set<string>> = {};
    const objectIdsByType: Record<string, Set<string>> = {};

    for (const tuple of tuples) {
      const key = tuple.key;
      
      // Extract user (full value like "user:anne")
      if (key.user) {
        users.add(key.user);
        const userMatch = key.user.match(/^([^:]+):(.+)$/);
        if (userMatch) {
          const [, userType, userId] = userMatch;
          if (!userIdsByType[userType]) userIdsByType[userType] = new Set();
          userIdsByType[userType].add(userId);
        }
      }
      
      // Extract object (full value like "document:readme")
      if (key.object) {
        objects.add(key.object);
        const objMatch = key.object.match(/^([^:]+):(.+)$/);
        if (objMatch) {
          const [, objType, objId] = objMatch;
          if (!objectIdsByType[objType]) objectIdsByType[objType] = new Set();
          objectIdsByType[objType].add(objId);
        }
      }
      
      // Extract relation
      if (key.relation) {
        relations.add(key.relation);
      }
    }

    return {
      allUsers: Array.from(users),
      allObjects: Array.from(objects),
      relations: Array.from(relations),
      userIdsByType: Object.fromEntries(
        Object.entries(userIdsByType).map(([k, v]) => [k, Array.from(v)])
      ) as Record<string, string[]>,
      objectIdsByType: Object.fromEntries(
        Object.entries(objectIdsByType).map(([k, v]) => [k, Array.from(v)])
      ) as Record<string, string[]>,
    };
  }, [tuples]);
}

interface QueryPanelProps {
  darkMode?: boolean;
}

export function QueryPanel({ darkMode = false }: QueryPanelProps) {
  const { selectedStore, selectedModel, tuples } = useAppStore();
  const { getSavedQueries, importQueries, clearAllQueries } = useSavedQueriesStore();
  const [activeQuery, setActiveQuery] = useState<QueryType>('check');
  const [showSavedQueries, setShowSavedQueries] = useState(true);
  const [loadedQuery, setLoadedQuery] = useState<SavedQuery | null>(null);
  const [showGlobalImportExport, setShowGlobalImportExport] = useState(false);
  const [globalImportError, setGlobalImportError] = useState<string | null>(null);
  const globalFileInputRef = useRef<HTMLInputElement>(null);
  const { dialogProps: globalDialogProps, confirm: globalConfirm } = useConfirmDialog();

  if (!selectedStore) {
    return null;
  }

  const allSavedQueries = getSavedQueries(selectedStore.id);

  const handleLoadQuery = (query: SavedQuery) => {
    setActiveQuery(query.type);
    setLoadedQuery(query);
  };

  const clearLoadedQuery = () => {
    setLoadedQuery(null);
  };

  // Global Export - exports ALL queries
  const handleGlobalExport = () => {
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      storeId: selectedStore.id,
      queries: allSavedQueries.map(q => ({
        ...q,
        lastResult: undefined,
      })),
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openfga-all-queries-${selectedStore.id.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowGlobalImportExport(false);
  };

  // Global Import
  const handleGlobalImport = (mode: 'replace' | 'merge') => {
    globalFileInputRef.current?.setAttribute('data-import-mode', mode);
    globalFileInputRef.current?.click();
  };

  const handleGlobalFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const mode = (e.target.getAttribute('data-import-mode') || 'merge') as 'replace' | 'merge';
    setGlobalImportError(null);
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data.queries || !Array.isArray(data.queries)) {
        throw new Error('Invalid file format: missing queries array');
      }
      
      for (const q of data.queries) {
        if (!q.name || !q.type) {
          throw new Error('Invalid query format: missing name or type');
        }
        if (!['check', 'expand', 'list-objects', 'list-users'].includes(q.type)) {
          throw new Error(`Invalid query type: ${q.type}`);
        }
      }
      
      importQueries(selectedStore.id, data.queries, mode);
      setShowGlobalImportExport(false);
    } catch (err) {
      setGlobalImportError(err instanceof Error ? err.message : 'Failed to import file');
    }
    
    e.target.value = '';
  };

  const handleGlobalClearAll = async () => {
    const confirmed = await globalConfirm({
      title: 'Clear All Queries',
      message: `Are you sure you want to delete all ${allSavedQueries.length} saved queries (Check, Expand, Objects, Users)? This cannot be undone.`,
      confirmText: 'Clear All',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    
    if (confirmed) {
      clearAllQueries(selectedStore.id);
      setShowGlobalImportExport(false);
    }
  };

  // Count queries by type
  const queryCounts = {
    check: allSavedQueries.filter(q => q.type === 'check').length,
    expand: allSavedQueries.filter(q => q.type === 'expand').length,
    'list-objects': allSavedQueries.filter(q => q.type === 'list-objects').length,
    'list-users': allSavedQueries.filter(q => q.type === 'list-users').length,
  };

  return (
    <div className={`${darkMode ? 'bg-gray-800' : 'bg-white/95'} backdrop-blur-sm rounded-2xl shadow-xl border ${darkMode ? 'border-gray-700' : 'border-white/20'} overflow-hidden flex flex-col h-full`}>
      {/* Hidden file input for global import */}
      <input
        ref={globalFileInputRef}
        type="file"
        accept=".json"
        onChange={handleGlobalFileSelect}
        className="hidden"
      />
      
      <div className={`border-b ${darkMode ? 'border-gray-700 bg-gradient-to-r from-gray-800 to-gray-700' : 'border-gray-100 bg-gradient-to-r from-rose-50 to-orange-50'} p-2`}>
        <div className="flex items-center justify-between">
          <nav className="flex gap-1">
            {[
              { id: 'check', label: 'Check', icon: '✓', gradient: 'from-emerald-500 to-green-500' },
              { id: 'expand', label: 'Expand', icon: '⤢', gradient: 'from-emerald-500 to-green-500' },
              { id: 'list-objects', label: 'Objects', icon: '📋', gradient: 'from-emerald-500 to-green-500' },
              { id: 'list-users', label: 'Users', icon: '👥', gradient: 'from-emerald-500 to-green-500' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveQuery(tab.id as QueryType); clearLoadedQuery(); }}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                  activeQuery === tab.id
                    ? `bg-gradient-to-r ${tab.gradient} text-white shadow`
                    : darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-white/50'
                }`}
              >
                <span className="mr-1">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            {/* Global Import/Export Button */}
            <button
              onClick={() => setShowGlobalImportExport(!showGlobalImportExport)}
              className={`px-2 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1 ${
                showGlobalImportExport
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow'
                  : darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-white/50'
              }`}
              title="Import/Export all queries"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              {allSavedQueries.length > 0 && (
                <span className="text-[10px] opacity-75">({allSavedQueries.length})</span>
              )}
            </button>
            
            {/* Saved Queries Toggle */}
            <button
              onClick={() => setShowSavedQueries(!showSavedQueries)}
              className={`px-2 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1 ${
                showSavedQueries
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow'
                  : darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-white/50'
              }`}
              title="Toggle saved queries panel"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              Saved
            </button>
          </div>
        </div>
        
        {/* Global Import/Export Panel */}
        {showGlobalImportExport && (
          <div className={`mt-2 p-3 rounded-lg ${darkMode ? 'bg-gray-900' : 'bg-white'} border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <span className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  Import / Export All Queries
                </span>
              </div>
              <button
                onClick={() => setShowGlobalImportExport(false)}
                className={`p-1 rounded ${darkMode ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Query counts by type */}
            <div className="flex flex-wrap gap-2 mb-3">
              <span className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
                ✓ Check: {queryCounts.check}
              </span>
              <span className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-blue-900/50 text-blue-400' : 'bg-blue-100 text-blue-700'}`}>
                ⤢ Expand: {queryCounts.expand}
              </span>
              <span className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-purple-900/50 text-purple-400' : 'bg-purple-100 text-purple-700'}`}>
                📋 Objects: {queryCounts['list-objects']}
              </span>
              <span className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-orange-900/50 text-orange-400' : 'bg-orange-100 text-orange-700'}`}>
                👥 Users: {queryCounts['list-users']}
              </span>
              <span className={`text-xs px-2 py-1 rounded font-medium ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}>
                Total: {allSavedQueries.length}
              </span>
            </div>
            
            {globalImportError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {globalImportError}
              </div>
            )}
            
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={handleGlobalExport}
                disabled={allSavedQueries.length === 0}
                className={`px-3 py-2 text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                  darkMode 
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50'
                }`}
                title="Export all queries to JSON file"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export All
              </button>
              <button
                onClick={() => handleGlobalImport('merge')}
                className={`px-3 py-2 text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                  darkMode 
                    ? 'bg-cyan-900/50 text-cyan-400 hover:bg-cyan-900' 
                    : 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200'
                }`}
                title="Import and add to existing queries"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Import (Add)
              </button>
              <button
                onClick={() => handleGlobalImport('replace')}
                className={`px-3 py-2 text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                  darkMode 
                    ? 'bg-orange-900/50 text-orange-400 hover:bg-orange-900' 
                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                }`}
                title="Import and replace all existing queries"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Import (Replace)
              </button>
              <button
                onClick={handleGlobalClearAll}
                disabled={allSavedQueries.length === 0}
                className={`px-3 py-2 text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                  darkMode 
                    ? 'bg-red-900/50 text-red-400 hover:bg-red-900 disabled:opacity-50' 
                    : 'bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50'
                }`}
                title="Delete all saved queries"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear All
              </button>
            </div>
          </div>
        )}
      </div>
      
      <ConfirmDialog {...globalDialogProps} />

      <div className="flex-1 flex overflow-hidden">
        {/* Main Query Area */}
        <div className={`flex-1 overflow-auto p-3 ${showSavedQueries ? 'border-r' : ''} ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          {activeQuery === 'check' && (
            <CheckQuery 
              storeId={selectedStore.id} 
              model={selectedModel} 
              tuples={tuples} 
              loadedQuery={loadedQuery?.type === 'check' ? loadedQuery : null}
              onClearLoaded={clearLoadedQuery}
              darkMode={darkMode}
            />
          )}
          {activeQuery === 'expand' && (
            <ExpandQuery 
              storeId={selectedStore.id} 
              model={selectedModel} 
              tuples={tuples}
              loadedQuery={loadedQuery?.type === 'expand' ? loadedQuery : null}
              onClearLoaded={clearLoadedQuery}
              darkMode={darkMode}
            />
          )}
          {activeQuery === 'list-objects' && (
            <ListObjectsQuery 
              storeId={selectedStore.id} 
              model={selectedModel} 
              tuples={tuples}
              loadedQuery={loadedQuery?.type === 'list-objects' ? loadedQuery : null}
              onClearLoaded={clearLoadedQuery}
              darkMode={darkMode}
            />
          )}
          {activeQuery === 'list-users' && (
            <ListUsersQuery 
              storeId={selectedStore.id} 
              model={selectedModel} 
              tuples={tuples}
              loadedQuery={loadedQuery?.type === 'list-users' ? loadedQuery : null}
              onClearLoaded={clearLoadedQuery}
              darkMode={darkMode}
            />
          )}
        </div>

        {/* Saved Queries Panel */}
        {showSavedQueries && (
          <SavedQueriesPanel 
            storeId={selectedStore.id} 
            modelId={selectedModel?.id}
            onLoadQuery={handleLoadQuery}
            activeQueryId={loadedQuery?.id}
            activeQueryType={activeQuery}
            darkMode={darkMode}
          />
        )}
      </div>
    </div>
  );
}

// Saved Queries Panel Component
function SavedQueriesPanel({ 
  storeId, 
  modelId,
  onLoadQuery,
  activeQueryId,
  activeQueryType,
  darkMode = false
}: { 
  storeId: string; 
  modelId?: string;
  onLoadQuery: (query: SavedQuery) => void;
  activeQueryId?: string;
  activeQueryType: QueryType;
  darkMode?: boolean;
}) {
  const { getSavedQueries, deleteSavedQuery, updateLastResult, reorderQueries, importQueries, clearAllQueries } = useSavedQueriesStore();
  const allSavedQueries = getSavedQueries(storeId);
  // Filter queries by active tab type
  const savedQueries = allSavedQueries.filter(q => q.type === activeQueryType);
  const [runningAll, setRunningAll] = useState(false);
  const [runningQueryId, setRunningQueryId] = useState<string | null>(null);
  const { dialogProps, confirm } = useConfirmDialog();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [showImportExport, setShowImportExport] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export all queries as JSON
  const handleExport = () => {
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      storeId,
      queries: allSavedQueries.map(q => ({
        ...q,
        lastResult: undefined, // Don't export results
      })),
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openfga-queries-${storeId.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import queries from JSON file
  const handleImport = (mode: 'replace' | 'merge') => {
    fileInputRef.current?.click();
    // Store the mode for when file is selected
    fileInputRef.current?.setAttribute('data-import-mode', mode);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const mode = (e.target.getAttribute('data-import-mode') || 'merge') as 'replace' | 'merge';
    setImportError(null);
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      // Validate the import data
      if (!data.queries || !Array.isArray(data.queries)) {
        throw new Error('Invalid file format: missing queries array');
      }
      
      // Validate each query has required fields
      for (const q of data.queries) {
        if (!q.name || !q.type) {
          throw new Error('Invalid query format: missing name or type');
        }
        if (!['check', 'expand', 'list-objects', 'list-users'].includes(q.type)) {
          throw new Error(`Invalid query type: ${q.type}`);
        }
      }
      
      importQueries(storeId, data.queries, mode);
      setShowImportExport(false);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import file');
    }
    
    // Reset the file input
    e.target.value = '';
  };

  const handleClearAll = async () => {
    const confirmed = await confirm({
      title: 'Clear All Queries',
      message: `Are you sure you want to delete all ${allSavedQueries.length} saved queries? This cannot be undone.`,
      confirmText: 'Clear All',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    
    if (confirmed) {
      clearAllQueries(storeId);
      setShowImportExport(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Reorder only the filtered queries
    const newFilteredQueries = [...savedQueries];
    const [draggedItem] = newFilteredQueries.splice(draggedIndex, 1);
    newFilteredQueries.splice(dropIndex, 0, draggedItem);
    
    // Rebuild the full list: other types + reordered current type
    const otherQueries = allSavedQueries.filter(q => q.type !== activeQueryType);
    reorderQueries(storeId, [...otherQueries, ...newFilteredQueries]);
    
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const getQueryTypeIcon = (type: SavedQueryType) => {
    switch (type) {
      case 'check': return '✓';
      case 'expand': return '⤢';
      case 'list-objects': return '📋';
      case 'list-users': return '👥';
    }
  };

  const getQueryTypeLabel = (type: SavedQueryType) => {
    switch (type) {
      case 'check': return 'Check';
      case 'expand': return 'Expand';
      case 'list-objects': return 'Objects';
      case 'list-users': return 'Users';
    }
  };

  const getQueryTypeColor = (type: SavedQueryType) => {
    switch (type) {
      case 'check': return 'emerald';
      case 'expand': return 'blue';
      case 'list-objects': return 'purple';
      case 'list-users': return 'orange';
    }
  };

  const runSingleQuery = async (query: SavedQuery) => {
    setRunningQueryId(query.id);
    try {
      let result: SavedQuery['lastResult'];
      
      if (query.type === 'check') {
        let contextObj: Record<string, unknown> | undefined;
        if (query.context?.trim()) {
          try { contextObj = JSON.parse(query.context); } catch { /* ignore */ }
        }
        const response = await openfgaApi.check(storeId, {
          tuple_key: { user: query.user!, relation: query.relation!, object: query.object! },
          authorization_model_id: modelId,
          context: contextObj,
        });
        result = {
          success: true,
          allowed: response.allowed,
          timestamp: new Date().toISOString(),
        };
      } else if (query.type === 'expand') {
        await openfgaApi.expand(storeId, {
          tuple_key: { relation: query.relation!, object: query.object! },
          authorization_model_id: modelId,
        });
        result = {
          success: true,
          timestamp: new Date().toISOString(),
        };
      } else if (query.type === 'list-objects') {
        let contextObj: Record<string, unknown> | undefined;
        if (query.context?.trim()) {
          try { contextObj = JSON.parse(query.context); } catch { /* ignore */ }
        }
        const response = await openfgaApi.listObjects(storeId, {
          user: query.user!,
          relation: query.relation!,
          type: query.objectType!,
          authorization_model_id: modelId,
          context: contextObj,
        });
        result = {
          success: true,
          objects: response.objects,
          timestamp: new Date().toISOString(),
        };
      } else if (query.type === 'list-users') {
        let contextObj: Record<string, unknown> | undefined;
        if (query.context?.trim()) {
          try { contextObj = JSON.parse(query.context); } catch { /* ignore */ }
        }
        const response = await openfgaApi.listUsers(storeId, {
          object: { type: query.objectType!, id: query.objectId! },
          relation: query.relation!,
          user_filters: [{ type: query.userFilterType! }],
          authorization_model_id: modelId,
          context: contextObj,
        });
        result = {
          success: true,
          users: response.users.map(u => {
            if (u.object) return `${u.object.type}:${u.object.id}`;
            if (u.userset) return `${u.userset.type}:${u.userset.id}#${u.userset.relation}`;
            if (u.wildcard) return `${u.wildcard.type}:*`;
            return 'unknown';
          }),
          timestamp: new Date().toISOString(),
        };
      }
      
      updateLastResult(storeId, query.id, result!);
    } catch (err) {
      updateLastResult(storeId, query.id, {
        success: false,
        error: err instanceof Error ? err.message : 'Query failed',
        timestamp: new Date().toISOString(),
      });
    } finally {
      setRunningQueryId(null);
    }
  };

  const runAllQueries = async () => {
    setRunningAll(true);
    for (const query of savedQueries) {
      await runSingleQuery(query);
    }
    setRunningAll(false);
  };

  const handleDelete = async (query: SavedQuery) => {
    const confirmed = await confirm({
      title: 'Delete Saved Query',
      message: `Are you sure you want to delete "${query.name}"?`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (confirmed) {
      deleteSavedQuery(storeId, query.id);
    }
  };

  const getResultBadge = (query: SavedQuery) => {
    if (!query.lastResult) return null;
    
    const { success, allowed, objects, users, error } = query.lastResult;
    
    if (!success) {
      return (
        <span className="px-1.5 py-0.5 text-[10px] bg-red-100 text-red-700 rounded" title={error}>
          Error
        </span>
      );
    }
    
    if (query.type === 'check' && allowed !== undefined) {
      // Check against expected if set
      const matchesExpected = query.expectedResult === undefined || query.expectedResult === allowed;
      return (
        <span className={`px-1.5 py-0.5 text-[10px] rounded ${
          allowed 
            ? matchesExpected ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'
            : matchesExpected ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
        }`}>
          {allowed ? 'ALLOWED' : 'DENIED'}
          {!matchesExpected && ' (unexpected)'}
        </span>
      );
    }
    
    if (query.type === 'list-objects' && objects) {
      return (
        <span className="px-1.5 py-0.5 text-[10px] bg-purple-100 text-purple-700 rounded">
          {objects.length} objects
        </span>
      );
    }
    
    if (query.type === 'list-users' && users) {
      return (
        <span className="px-1.5 py-0.5 text-[10px] bg-orange-100 text-orange-700 rounded">
          {users.length} users
        </span>
      );
    }
    
    return (
      <span className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded">
        Done
      </span>
    );
  };

  const typeLabel = getQueryTypeLabel(activeQueryType);
  const typeIcon = getQueryTypeIcon(activeQueryType);

  // Get type-specific styles
  const getTypeStyles = () => {
    switch (activeQueryType) {
      case 'check':
        return {
          badge: darkMode ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-100 text-emerald-700',
          button: 'bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600',
        };
      case 'expand':
        return {
          badge: darkMode ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-100 text-emerald-700',
          button: 'bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600',
        };
      case 'list-objects':
        return {
          badge: darkMode ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-100 text-emerald-700',
          button: 'bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600',
        };
      case 'list-users':
        return {
          badge: darkMode ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-100 text-emerald-700',
          button: 'bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600',
        };
    }
  };

  const typeStyles = getTypeStyles();

  return (
    <div className={`w-80 flex flex-col ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      <div className={`p-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">{typeIcon}</span>
            <h3 className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wide`}>
              {typeLabel}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${typeStyles.badge}`}>
              {savedQueries.length} saved
            </span>
            <button
              onClick={() => setShowImportExport(!showImportExport)}
              className={`p-1 rounded transition-colors ${
                showImportExport 
                  ? darkMode ? 'bg-gray-700 text-cyan-400' : 'bg-cyan-100 text-cyan-700'
                  : darkMode ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'
              }`}
              title="Import/Export queries"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Import/Export Panel */}
        {showImportExport && (
          <div className={`mb-2 p-2 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[10px] font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Import / Export ({allSavedQueries.length} total)
              </span>
              <button
                onClick={() => setShowImportExport(false)}
                className={`p-0.5 rounded ${darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {importError && (
              <div className="mb-2 p-1.5 bg-red-50 border border-red-200 rounded text-[10px] text-red-700">
                {importError}
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              <button
                onClick={handleExport}
                disabled={allSavedQueries.length === 0}
                className={`px-2 py-1.5 text-[10px] rounded flex items-center justify-center gap-1 transition-colors ${
                  darkMode 
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50'
                }`}
                title="Export all queries to JSON file"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
              </button>
              <button
                onClick={() => handleImport('merge')}
                className={`px-2 py-1.5 text-[10px] rounded flex items-center justify-center gap-1 transition-colors ${
                  darkMode 
                    ? 'bg-cyan-900/50 text-cyan-400 hover:bg-cyan-900' 
                    : 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200'
                }`}
                title="Import and add to existing queries"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import (Add)
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => handleImport('replace')}
                className={`px-2 py-1.5 text-[10px] rounded flex items-center justify-center gap-1 transition-colors ${
                  darkMode 
                    ? 'bg-orange-900/50 text-orange-400 hover:bg-orange-900' 
                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                }`}
                title="Import and replace all existing queries"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Import (Replace)
              </button>
              <button
                onClick={handleClearAll}
                disabled={allSavedQueries.length === 0}
                className={`px-2 py-1.5 text-[10px] rounded flex items-center justify-center gap-1 transition-colors ${
                  darkMode 
                    ? 'bg-red-900/50 text-red-400 hover:bg-red-900 disabled:opacity-50' 
                    : 'bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50'
                }`}
                title="Delete all saved queries"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear All
              </button>
            </div>
          </div>
        )}
        
        {savedQueries.length > 0 && (
          <button
            onClick={runAllQueries}
            disabled={runningAll}
            className={`w-full px-2 py-1.5 text-[10px] ${typeStyles.button} text-white rounded disabled:opacity-50 flex items-center justify-center gap-1`}
            title={`Run all ${typeLabel} queries`}
          >
            {runningAll ? (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            Run All {typeLabel}
          </button>
        )}
      </div>
      
      <div className="flex-1 overflow-auto p-2 space-y-1.5">
        {savedQueries.length === 0 ? (
          <div className={`text-center py-6 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <p className="text-xs">No saved {typeLabel} queries</p>
            <p className="text-[10px] mt-1">Run a {typeLabel.toLowerCase()} query and click "Save"</p>
          </div>
        ) : (
          savedQueries.map((query, index) => {
            const color = getQueryTypeColor(query.type);
            const isActive = activeQueryId === query.id;
            const isRunning = runningQueryId === query.id;
            const isDragging = draggedIndex === index;
            const isDragOver = dragOverIndex === index;
            
            return (
              <div
                key={query.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`p-2 rounded-lg border transition-all cursor-pointer ${
                  isDragging ? 'opacity-50 scale-95' : ''
                } ${
                  isDragOver 
                    ? darkMode 
                      ? 'border-amber-500 border-dashed bg-amber-900/20' 
                      : 'border-amber-400 border-dashed bg-amber-50'
                    : ''
                } ${
                  isActive && !isDragOver
                    ? darkMode 
                      ? `bg-${color}-900/30 border-${color}-700` 
                      : `bg-${color}-50 border-${color}-300`
                    : !isDragOver
                      ? darkMode
                        ? 'bg-gray-800 border-gray-700 hover:border-gray-600'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                      : ''
                }`}
                onClick={() => onLoadQuery(query)}
              >
                <div className="flex items-start justify-between gap-2">
                  {/* Drag handle */}
                  <div 
                    className={`flex-shrink-0 cursor-grab active:cursor-grabbing p-0.5 -ml-1 ${darkMode ? 'text-gray-600 hover:text-gray-400' : 'text-gray-300 hover:text-gray-500'}`}
                    title="Drag to reorder"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {getQueryTypeIcon(query.type)}
                      </span>
                      <span className={`text-xs font-medium truncate ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                        {query.name}
                      </span>
                    </div>
                    <div className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'} mt-0.5 truncate`}>
                      {query.type === 'check' && `${query.user} → ${query.relation} → ${query.object}`}
                      {query.type === 'expand' && `${query.relation} on ${query.object}`}
                      {query.type === 'list-objects' && `${query.user} → ${query.relation} → ${query.objectType}:*`}
                      {query.type === 'list-users' && `* → ${query.relation} → ${query.objectType}:${query.objectId}`}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(query); }}
                    className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-red-900/50 text-gray-500 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'}`}
                    title="Delete query"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                {/* Result badge and Run button */}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {getResultBadge(query)}
                    {query.lastResult && (
                      <span className={`text-[9px] ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                        {new Date(query.lastResult.timestamp).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); runSingleQuery(query); }}
                    disabled={isRunning}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 transition-all ${
                      darkMode 
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50' 
                        : 'bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50'
                    }`}
                    title="Run query"
                  >
                    {isRunning ? (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                    {isRunning ? 'Running' : 'Run'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}

// Reusable Select with Input component - using custom dropdown
function SelectWithInput({ 
  label, 
  value, 
  onChange, 
  options, 
  placeholder,
  allowCustom = true,
  color = 'purple'
}: { 
  label: string; 
  value: string; 
  onChange: (v: string) => void; 
  options: string[]; 
  placeholder: string;
  allowCustom?: boolean;
  color?: 'purple' | 'blue' | 'green' | 'orange';
}) {
  const [isCustom, setIsCustom] = useState(false);

  const colorClasses = {
    purple: 'focus:ring-purple-500 focus:border-purple-500 bg-purple-50/30',
    blue: 'focus:ring-blue-500 focus:border-blue-500 bg-blue-50/30',
    green: 'focus:ring-green-500 focus:border-green-500 bg-green-50/30',
    orange: 'focus:ring-orange-500 focus:border-orange-500 bg-orange-50/30',
  };

  // Build options for custom select
  const selectOptions = [
    ...options.map(opt => ({ value: opt, label: opt })),
    ...(allowCustom ? [{ value: '__custom__', label: '+ Enter custom value...' }] : []),
  ];

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">{label}</label>
      {!isCustom && options.length > 0 ? (
        <CustomSelect
          value={value}
          onChange={(v) => {
            if (v === '__custom__') {
              setIsCustom(true);
              onChange('');
            } else {
              onChange(v);
            }
          }}
          options={selectOptions}
          placeholder={placeholder}
          color={color}
        />
      ) : (
        <div className="flex gap-1.5">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`flex-1 px-3 py-2.5 border border-gray-200 rounded-xl shadow-sm text-sm transition-all hover:border-gray-300 focus:ring-2 ${colorClasses[color]}`}
          />
          {options.length > 0 && (
            <button
              onClick={() => { setIsCustom(false); onChange(''); }}
              className="px-3 py-2 text-xs bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors flex items-center gap-1"
              title="Use dropdown"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// User input with type prefix suggestion and ID autocomplete from tuples
function UserInput({ 
  value, 
  onChange, 
  types,
  idSuggestionsByType = {},
  allSuggestions = []
}: { 
  value: string; 
  onChange: (v: string) => void; 
  types: string[];
  idSuggestionsByType?: Record<string, string[]>;
  allSuggestions?: string[];
}) {
  const [selectedType, setSelectedType] = useState('');
  const [userId, setUserId] = useState('');
  const [showIdSuggestions, setShowIdSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  // Update dropdown position when showing
  useEffect(() => {
    if (showIdSuggestions && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [showIdSuggestions]);

  // Parse existing value
  const parseValue = (val: string) => {
    const match = val.match(/^([^:]+):(.*)$/);
    if (match) {
      return { type: match[1], id: match[2] };
    }
    return { type: '', id: val };
  };

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    if (type && userId) {
      onChange(`${type}:${userId}`);
    } else if (type) {
      onChange(`${type}:`);
    }
  };

  const handleIdChange = (id: string) => {
    setUserId(id);
    if (selectedType) {
      onChange(`${selectedType}:${id}`);
    } else {
      onChange(id);
    }
  };

  const handleSelectSuggestion = (suggestion: string) => {
    // If suggestion contains ":", it's a full value like "user:anne"
    if (suggestion.includes(':')) {
      onChange(suggestion);
      const parsed = parseValue(suggestion);
      setSelectedType(parsed.type);
      setUserId(parsed.id);
    } else {
      handleIdChange(suggestion);
    }
    setShowIdSuggestions(false);
  };

  // Sync from parent value using useEffect to avoid render-time state updates
  useEffect(() => {
    const parsed = parseValue(value);
    setSelectedType(prev => {
      if (parsed.type !== prev && types.includes(parsed.type)) {
        return parsed.type;
      }
      return prev;
    });
    setUserId(prev => {
      if (parsed.id !== prev) {
        return parsed.id;
      }
      return prev;
    });
  }, [value, types]);

  // Get suggestions based on current input
  const getSuggestions = () => {
    const searchTerm = userId.toLowerCase();
    
    // If a type is selected, show IDs for that type
    if (selectedType && idSuggestionsByType[selectedType]) {
      return idSuggestionsByType[selectedType]
        .filter(id => !searchTerm || id.toLowerCase().includes(searchTerm))
        .slice(0, 10);
    }
    
    // If no type selected but we have input, search all suggestions
    if (allSuggestions.length > 0) {
      const fullValue = value.toLowerCase();
      return allSuggestions
        .filter(s => !fullValue || s.toLowerCase().includes(fullValue))
        .slice(0, 10);
    }
    
    return [];
  };
  
  const suggestions = getSuggestions();
  const showFullSuggestions = !selectedType && allSuggestions.length > 0;

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">User</label>
      <div className="flex rounded-xl overflow-hidden shadow-sm border border-gray-200 bg-white hover:border-gray-300 transition-all focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
        <InlineSelect
          value={selectedType}
          onChange={handleTypeChange}
          options={types}
          placeholder="type"
          color="blue"
        />
        <div className="flex items-center px-2 bg-gradient-to-r from-gray-100 to-gray-50 text-gray-400 font-mono text-sm">:</div>
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={userId}
            onChange={(e) => handleIdChange(e.target.value)}
            onFocus={() => setShowIdSuggestions(true)}
            onBlur={() => setTimeout(() => setShowIdSuggestions(false), 200)}
            placeholder="id (e.g., anne)"
            className="w-full px-3 py-2.5 border-0 text-sm focus:outline-none focus:ring-0 bg-transparent"
          />
        </div>
      </div>
      {showIdSuggestions && suggestions.length > 0 && createPortal(
        <div 
          className="bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-auto"
          style={{ 
            position: 'fixed',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: Math.max(dropdownPosition.width, 200),
            zIndex: 99999,
          }}
        >
          {showFullSuggestions && (
            <div className="px-3 py-1.5 text-[10px] text-gray-400 bg-gray-50 border-b border-gray-100 sticky top-0">
              Select a type or choose from existing values
            </div>
          )}
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(suggestion); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 text-gray-700 hover:text-blue-700 border-b border-gray-50 last:border-0"
            >
              {suggestion}
            </button>
          ))}
        </div>,
        document.body
      )}
      <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Format: type:id (e.g., user:anne) {(allSuggestions.length > 0 || Object.keys(idSuggestionsByType).length > 0) && '• Focus to see suggestions'}
      </p>
    </div>
  );
}

// Object input with type prefix suggestion and ID autocomplete from tuples
function ObjectInput({ 
  value, 
  onChange, 
  types,
  label = "Object",
  idSuggestionsByType = {},
  allSuggestions = []
}: { 
  value: string; 
  onChange: (v: string) => void; 
  types: string[];
  label?: string;
  idSuggestionsByType?: Record<string, string[]>;
  allSuggestions?: string[];
}) {
  const [selectedType, setSelectedType] = useState('');
  const [objectId, setObjectId] = useState('');
  const [showIdSuggestions, setShowIdSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  // Update dropdown position when showing
  useEffect(() => {
    if (showIdSuggestions && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [showIdSuggestions]);

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    if (type && objectId) {
      onChange(`${type}:${objectId}`);
    } else if (type) {
      onChange(`${type}:`);
    }
  };

  const handleIdChange = (id: string) => {
    setObjectId(id);
    if (selectedType) {
      onChange(`${selectedType}:${id}`);
    } else {
      onChange(id);
    }
  };

  const handleSelectSuggestion = (suggestion: string) => {
    // If suggestion contains ":", it's a full value like "document:readme"
    if (suggestion.includes(':')) {
      onChange(suggestion);
      const match = suggestion.match(/^([^:]+):(.*)$/);
      if (match) {
        setSelectedType(match[1]);
        setObjectId(match[2]);
      }
    } else {
      handleIdChange(suggestion);
    }
    setShowIdSuggestions(false);
  };

  // Parse and sync using useEffect to avoid render-time state updates
  useEffect(() => {
    const match = value.match(/^([^:]+):(.*)$/);
    const parsedType = match ? match[1] : '';
    const parsedId = match ? match[2] : value;
    
    setSelectedType(prev => {
      if (parsedType !== prev && types.includes(parsedType)) {
        return parsedType;
      }
      return prev;
    });
    setObjectId(prev => {
      if (parsedId !== prev) {
        return parsedId;
      }
      return prev;
    });
  }, [value, types]);

  // Get suggestions based on current input
  const getSuggestions = () => {
    const searchTerm = objectId.toLowerCase();
    
    // If a type is selected, show IDs for that type
    if (selectedType && idSuggestionsByType[selectedType]) {
      return idSuggestionsByType[selectedType]
        .filter(id => !searchTerm || id.toLowerCase().includes(searchTerm))
        .slice(0, 10);
    }
    
    // If no type selected but we have input, search all suggestions
    if (allSuggestions.length > 0) {
      const fullValue = value.toLowerCase();
      return allSuggestions
        .filter(s => !fullValue || s.toLowerCase().includes(fullValue))
        .slice(0, 10);
    }
    
    return [];
  };
  
  const suggestions = getSuggestions();
  const showFullSuggestions = !selectedType && allSuggestions.length > 0;

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">{label}</label>
      <div className="flex rounded-xl overflow-hidden shadow-sm border border-gray-200 bg-white hover:border-gray-300 transition-all focus-within:ring-2 focus-within:ring-purple-500 focus-within:border-purple-500">
        <InlineSelect
          value={selectedType}
          onChange={handleTypeChange}
          options={types}
          placeholder="type"
          color="purple"
        />
        <div className="flex items-center px-2 bg-gradient-to-r from-gray-100 to-gray-50 text-gray-400 font-mono text-sm">:</div>
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={objectId}
            onChange={(e) => handleIdChange(e.target.value)}
            onFocus={() => setShowIdSuggestions(true)}
            onBlur={() => setTimeout(() => setShowIdSuggestions(false), 200)}
            placeholder="id (e.g., readme)"
            className="w-full px-3 py-2.5 border-0 text-sm focus:outline-none focus:ring-0 bg-transparent"
          />
        </div>
      </div>
      {showIdSuggestions && suggestions.length > 0 && createPortal(
        <div 
          className="bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-auto"
          style={{ 
            position: 'fixed',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: Math.max(dropdownPosition.width, 200),
            zIndex: 99999,
          }}
        >
          {showFullSuggestions && (
            <div className="px-3 py-1.5 text-[10px] text-gray-400 bg-gray-50 border-b border-gray-100 sticky top-0">
              Select a type or choose from existing values
            </div>
          )}
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(suggestion); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-purple-50 text-gray-700 hover:text-purple-700 border-b border-gray-50 last:border-0"
            >
              {suggestion}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function CheckQuery({ 
  storeId, 
  model, 
  tuples,
  loadedQuery,
  onClearLoaded,
  darkMode = false
}: { 
  storeId: string; 
  model: AuthorizationModel | null; 
  tuples: Tuple[];
  loadedQuery?: SavedQuery | null;
  onClearLoaded?: () => void;
  darkMode?: boolean;
}) {
  const { types, relationsByType, allRelations } = useModelInfo(model);
  const { allUsers, allObjects, userIdsByType, objectIdsByType, relations: tupleRelations } = useTupleSuggestions(tuples);
  const { addSavedQuery } = useSavedQueriesStore();
  const [user, setUser] = useState('');
  const [relation, setRelation] = useState('');
  const [object, setObject] = useState('');
  const [context, setContext] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSaveOptions, setShowSaveOptions] = useState(false);
  const [expectedResult, setExpectedResult] = useState<boolean | undefined>(undefined);

  // Clear result when inputs change
  const clearResult = () => {
    setResult(null);
    setError(null);
  };

  const handleUserChange = (value: string) => {
    setUser(value);
    clearResult();
  };

  const handleRelationChange = (value: string) => {
    setRelation(value);
    clearResult();
  };

  const handleObjectChange = (value: string) => {
    setObject(value);
    clearResult();
  };

  const handleContextChange = (value: string) => {
    setContext(value);
    clearResult();
  };

  // Load query from saved
  useState(() => {
    if (loadedQuery) {
      setUser(loadedQuery.user || '');
      setRelation(loadedQuery.relation || '');
      setObject(loadedQuery.object || '');
      setContext(loadedQuery.context || '');
      setExpectedResult(loadedQuery.expectedResult as boolean | undefined);
    }
  });

  // Effect to load query when loadedQuery changes
  useMemo(() => {
    if (loadedQuery) {
      setUser(loadedQuery.user || '');
      setRelation(loadedQuery.relation || '');
      setObject(loadedQuery.object || '');
      setContext(loadedQuery.context || '');
      setExpectedResult(loadedQuery.expectedResult as boolean | undefined);
      setResult(null);
      setError(null);
    }
  }, [loadedQuery]);

  // Get object type from object value to filter relations
  const objectType = object.split(':')[0];
  // Combine model relations with tuple relations
  const modelRelations = objectType && relationsByType[objectType] 
    ? relationsByType[objectType] 
    : allRelations;
  const availableRelations = [...new Set([...modelRelations, ...tupleRelations])];

  const handleCheck = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      let contextObj: Record<string, unknown> | undefined;
      if (context.trim()) {
        try {
          contextObj = JSON.parse(context);
        } catch {
          throw new Error('Invalid JSON in context field');
        }
      }

      const response = await openfgaApi.check(storeId, {
        tuple_key: { user, relation, object },
        authorization_model_id: model?.id,
        context: contextObj,
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = () => {
    // Auto-generate name from query params
    const autoName = `${user.split(':')[1] || user} ${relation} ${object.split(':')[1] || object}`;
    addSavedQuery(storeId, {
      name: autoName,
      type: 'check',
      user,
      relation,
      object,
      context: context || undefined,
      expectedResult,
    });
    setShowSaveOptions(false);
    setExpectedResult(undefined);
  };

  const canSave = user && relation && object;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Check if a user has a specific relationship with an object.
        </p>
        {loadedQuery && (
          <button
            onClick={onClearLoaded}
            className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Clear loaded query
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <UserInput value={user} onChange={handleUserChange} types={types} idSuggestionsByType={userIdsByType} allSuggestions={allUsers} />
        
        <SelectWithInput
          label="Relation"
          value={relation}
          onChange={handleRelationChange}
          options={availableRelations}
          placeholder="Select relation..."
          color="green"
        />

        <ObjectInput value={object} onChange={handleObjectChange} types={types} idSuggestionsByType={objectIdsByType} allSuggestions={allObjects} />
      </div>

      <div>
        <label className={`block text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1.5 uppercase tracking-wide`}>
          Context (Optional)
        </label>
        <textarea
          value={context}
          onChange={(e) => handleContextChange(e.target.value)}
          placeholder='{"ip_address": "192.168.1.1"}'
          rows={2}
          className={`w-full px-3 py-2.5 border rounded-xl shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-mono text-sm transition-all ${
            darkMode 
              ? 'bg-gray-700 border-gray-600 text-gray-200 hover:border-gray-500' 
              : 'bg-gray-50/50 border-gray-200 hover:border-gray-300'
          }`}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleCheck}
          disabled={isLoading || !user || !relation || !object}
          className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-xl hover:from-emerald-600 hover:to-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium shadow-lg shadow-green-500/25 transition-all"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Checking...
            </>
          ) : (
            'Run Check'
          )}
        </button>
        
        {canSave && (
          <div className="relative">
            <button
              onClick={() => setShowSaveOptions(!showSaveOptions)}
              className={`px-4 py-2.5 rounded-xl flex items-center gap-2 font-medium transition-all ${
                darkMode 
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              Save
            </button>
            
            {/* Save Options Dropdown */}
            {showSaveOptions && (
              <div className={`absolute top-full left-0 mt-1 p-2 rounded-lg border shadow-lg z-50 min-w-[200px] ${
                darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'
              }`}>
                <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-2`}>Expected result (optional):</div>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => setExpectedResult(expectedResult === true ? undefined : true)}
                    className={`px-2 py-1 text-xs rounded flex-1 ${expectedResult === true ? 'bg-emerald-500 text-white' : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}
                  >
                    Allowed
                  </button>
                  <button
                    onClick={() => setExpectedResult(expectedResult === false ? undefined : false)}
                    className={`px-2 py-1 text-xs rounded flex-1 ${expectedResult === false ? 'bg-red-500 text-white' : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}
                  >
                    Denied
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    className="flex-1 px-3 py-1.5 bg-amber-500 text-white rounded text-xs hover:bg-amber-600"
                  >
                    Save Query
                  </button>
                  <button
                    onClick={() => setShowSaveOptions(false)}
                    className={`px-2 py-1.5 rounded text-xs ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className={`p-4 rounded-xl ${result.allowed ? 'bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200' : 'bg-gradient-to-r from-red-50 to-rose-50 border border-red-200'}`}>
          <div className="flex items-center gap-3">
            {result.allowed ? (
              <div className="p-2 bg-gradient-to-br from-emerald-500 to-green-500 rounded-full">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div className="p-2 bg-gradient-to-br from-red-500 to-rose-500 rounded-full">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
            <span className={`text-lg font-bold ${result.allowed ? 'text-emerald-700' : 'text-red-700'}`}>
              {result.allowed ? 'ALLOWED' : 'DENIED'}
            </span>
          </div>
          <p className="mt-3 text-sm text-gray-700">
            <code className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg font-medium">{user}</code>{' '}
            {result.allowed ? 'has' : 'does not have'}{' '}
            <code className="px-2 py-1 bg-green-100 text-green-700 rounded-lg font-medium">{relation}</code>{' '}
            access to{' '}
            <code className="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg font-medium">{object}</code>
          </p>
        </div>
      )}
    </div>
  );
}

function ExpandQuery({ 
  storeId, 
  model, 
  tuples,
  loadedQuery,
  onClearLoaded,
  darkMode = false
}: { 
  storeId: string; 
  model: AuthorizationModel | null; 
  tuples: Tuple[];
  loadedQuery?: SavedQuery | null;
  onClearLoaded?: () => void;
  darkMode?: boolean;
}) {
  const { types, relationsByType, allRelations } = useModelInfo(model);
  const { allObjects, objectIdsByType, relations: tupleRelations } = useTupleSuggestions(tuples);
  const { addSavedQuery } = useSavedQueriesStore();
  const [relation, setRelation] = useState('');
  const [object, setObject] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ExpandResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Clear result when inputs change
  const clearResult = () => {
    setResult(null);
    setError(null);
  };

  const handleRelationChange = (value: string) => {
    setRelation(value);
    clearResult();
  };

  const handleObjectChange = (value: string) => {
    setObject(value);
    clearResult();
  };

  // Effect to load query when loadedQuery changes
  useMemo(() => {
    if (loadedQuery) {
      setRelation(loadedQuery.relation || '');
      setObject(loadedQuery.object || '');
      setResult(null);
      setError(null);
    }
  }, [loadedQuery]);

  // Get object type from object value to filter relations
  const objectType = object.split(':')[0];
  const modelRelations = objectType && relationsByType[objectType] 
    ? relationsByType[objectType] 
    : allRelations;
  const availableRelations = [...new Set([...modelRelations, ...tupleRelations])];

  const handleExpand = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await openfgaApi.expand(storeId, {
        tuple_key: { relation, object },
        authorization_model_id: model?.id,
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Expand failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = () => {
    const autoName = `${relation} on ${object}`;
    addSavedQuery(storeId, {
      name: autoName,
      type: 'expand',
      relation,
      object,
    });
  };

  const canSave = relation && object;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Expand a relation to see all users who have access.
        </p>
        {loadedQuery && (
          <button
            onClick={onClearLoaded}
            className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Clear loaded query
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SelectWithInput
          label="Relation"
          value={relation}
          onChange={handleRelationChange}
          options={availableRelations}
          placeholder="Select relation..."
          color="blue"
        />

        <ObjectInput value={object} onChange={handleObjectChange} types={types} idSuggestionsByType={objectIdsByType} allSuggestions={allObjects} />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleExpand}
          disabled={isLoading || !relation || !object}
          className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-xl hover:from-emerald-600 hover:to-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium shadow-lg shadow-green-500/25 transition-all"
        >
          {isLoading ? 'Expanding...' : 'Run Expand'}
        </button>
        
        {canSave && (
          <button
            onClick={handleSave}
            className={`px-4 py-2.5 rounded-xl flex items-center gap-2 font-medium transition-all ${
              darkMode 
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            Save
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Result Tree</h4>
            <CopyButton text={JSON.stringify(result, null, 2)} />
          </div>
          <div className="relative overflow-auto max-h-96">
            <SyntaxHighlighter
              language="json"
              style={oneLight}
              customStyle={{ margin: 0, borderRadius: '0.75rem', fontSize: '12px' }}
            >
              {JSON.stringify(result, null, 2)}
            </SyntaxHighlighter>
          </div>
        </div>
      )}
    </div>
  );
}

function ListObjectsQuery({ 
  storeId, 
  model, 
  tuples,
  loadedQuery,
  onClearLoaded,
  darkMode = false
}: { 
  storeId: string; 
  model: AuthorizationModel | null; 
  tuples: Tuple[];
  loadedQuery?: SavedQuery | null;
  onClearLoaded?: () => void;
  darkMode?: boolean;
}) {
  const { types, relationsByType, allRelations } = useModelInfo(model);
  const { allUsers, userIdsByType, relations: tupleRelations } = useTupleSuggestions(tuples);
  const { addSavedQuery } = useSavedQueriesStore();
  const [user, setUser] = useState('');
  const [relation, setRelation] = useState('');
  const [type, setType] = useState('');
  const [context, setContext] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ListObjectsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Clear result when inputs change
  const clearResult = () => {
    setResult(null);
    setError(null);
  };

  const handleUserChange = (value: string) => {
    setUser(value);
    clearResult();
  };

  const handleRelationChange = (value: string) => {
    setRelation(value);
    clearResult();
  };

  const handleTypeChange = (value: string) => {
    setType(value);
    clearResult();
  };

  const handleContextChange = (value: string) => {
    setContext(value);
    clearResult();
  };

  // Effect to load query when loadedQuery changes
  useMemo(() => {
    if (loadedQuery) {
      setUser(loadedQuery.user || '');
      setRelation(loadedQuery.relation || '');
      setType(loadedQuery.objectType || '');
      setContext(loadedQuery.context || '');
      setResult(null);
      setError(null);
    }
  }, [loadedQuery]);

  // Get relations for selected type
  const modelRelations = type && relationsByType[type] 
    ? relationsByType[type] 
    : allRelations;
  const availableRelations = [...new Set([...modelRelations, ...tupleRelations])];

  const handleSave = () => {
    const autoName = `${user.split(':')[1] || user} ${relation} ${type}:*`;
    addSavedQuery(storeId, {
      name: autoName,
      type: 'list-objects',
      user,
      relation,
      objectType: type,
      context: context || undefined,
    });
  };

  const canSave = user && relation && type;

  const handleListObjects = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      let contextObj: Record<string, unknown> | undefined;
      if (context.trim()) {
        try {
          contextObj = JSON.parse(context);
        } catch {
          throw new Error('Invalid JSON in context field');
        }
      }

      const response = await openfgaApi.listObjects(storeId, {
        user,
        relation,
        type,
        authorization_model_id: model?.id,
        context: contextObj,
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'List objects failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          List all objects of a type that a user has a specific relationship with.
        </p>
        {loadedQuery && (
          <button
            onClick={onClearLoaded}
            className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Clear loaded query
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <UserInput value={user} onChange={handleUserChange} types={types} idSuggestionsByType={userIdsByType} allSuggestions={allUsers} />

        <SelectWithInput
          label="Relation"
          value={relation}
          onChange={handleRelationChange}
          options={availableRelations}
          placeholder="Select relation..."
          color="green"
        />

        <SelectWithInput
          label="Object Type"
          value={type}
          onChange={handleTypeChange}
          options={types}
          placeholder="Select type..."
          color="purple"
        />
      </div>

      <div>
        <label className={`block text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1.5 uppercase tracking-wide`}>
          Context (Optional)
        </label>
        <textarea
          value={context}
          onChange={(e) => handleContextChange(e.target.value)}
          placeholder='{"ip_address": "192.168.1.1"}'
          rows={2}
          className={`w-full px-3 py-2.5 border rounded-xl shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-mono text-sm transition-all ${
            darkMode 
              ? 'bg-gray-700 border-gray-600 text-gray-200 hover:border-gray-500' 
              : 'bg-gray-50/50 border-gray-200 hover:border-gray-300'
          }`}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleListObjects}
          disabled={isLoading || !user || !relation || !type}
          className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-xl hover:from-emerald-600 hover:to-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium shadow-lg shadow-green-500/25 transition-all"
        >
          {isLoading ? 'Loading...' : 'List Objects'}
        </button>
        
        {canSave && (
          <button
            onClick={handleSave}
            className={`px-4 py-2.5 rounded-xl flex items-center gap-2 font-medium transition-all ${
              darkMode 
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            Save
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-4">
          <h4 className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
            Objects ({result.objects.length})
          </h4>
          {result.objects.length === 0 ? (
            <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>No objects found.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {result.objects.map((obj, index) => (
                  <button
                    key={index}
                    onClick={() => navigator.clipboard.writeText(obj)}
                    className={`px-2 py-1 rounded text-sm transition-colors cursor-pointer ${
                      darkMode 
                        ? 'bg-purple-900/50 text-purple-300 hover:bg-purple-800/50' 
                        : 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                    }`}
                    title={`Click to copy: ${obj}`}
                  >
                    {obj}
                  </button>
                ))}
              </div>
              <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Click any item to copy</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ListUsersQuery({ 
  storeId, 
  model, 
  tuples,
  loadedQuery,
  onClearLoaded,
  darkMode = false
}: { 
  storeId: string; 
  model: AuthorizationModel | null; 
  tuples: Tuple[];
  loadedQuery?: SavedQuery | null;
  onClearLoaded?: () => void;
  darkMode?: boolean;
}) {
  const { types, relationsByType, allRelations } = useModelInfo(model);
  const { allObjects, objectIdsByType, relations: tupleRelations } = useTupleSuggestions(tuples);
  const { addSavedQuery } = useSavedQueriesStore();
  const [objectType, setObjectType] = useState('');
  const [objectId, setObjectId] = useState('');
  const [relation, setRelation] = useState('');
  const [userFilterType, setUserFilterType] = useState('');
  const [context, setContext] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ListUsersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showObjectIdSuggestions, setShowObjectIdSuggestions] = useState(false);

  // Clear result when inputs change
  const clearResult = () => {
    setResult(null);
    setError(null);
  };

  const handleObjectTypeChange = (value: string) => {
    setObjectType(value);
    clearResult();
  };

  const handleObjectIdChange = (value: string) => {
    setObjectId(value);
    clearResult();
  };

  const handleRelationChange = (value: string) => {
    setRelation(value);
    clearResult();
  };

  const handleUserFilterTypeChange = (value: string) => {
    setUserFilterType(value);
    clearResult();
  };

  const handleContextChange = (value: string) => {
    setContext(value);
    clearResult();
  };

  // Effect to load query when loadedQuery changes
  useMemo(() => {
    if (loadedQuery) {
      setObjectType(loadedQuery.objectType || '');
      setObjectId(loadedQuery.objectId || '');
      setRelation(loadedQuery.relation || '');
      setUserFilterType(loadedQuery.userFilterType || '');
      setContext(loadedQuery.context || '');
      setResult(null);
      setError(null);
    }
  }, [loadedQuery]);

  // Get relations for selected object type
  const modelRelations = objectType && relationsByType[objectType] 
    ? relationsByType[objectType] 
    : allRelations;
  const availableRelations = [...new Set([...modelRelations, ...tupleRelations])];
  
  // Get object ID suggestions for selected type, or all objects if no type selected
  const objectIdSuggestions = objectType && objectIdsByType[objectType]
    ? objectIdsByType[objectType].filter(id => !objectId || id.toLowerCase().includes(objectId.toLowerCase()))
    : allObjects.filter(obj => !objectId || obj.toLowerCase().includes(objectId.toLowerCase())).map(obj => {
        // If showing all objects, extract just the ID part for display
        const match = obj.match(/^([^:]+):(.+)$/);
        return match ? match[2] : obj;
      }).filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates

  const handleSave = () => {
    const autoName = `${userFilterType}:* ${relation} ${objectType}:${objectId}`;
    addSavedQuery(storeId, {
      name: autoName,
      type: 'list-users',
      objectType,
      objectId,
      relation,
      userFilterType,
      context: context || undefined,
    });
  };

  const canSave = objectType && objectId && relation && userFilterType;

  const handleListUsers = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      let contextObj: Record<string, unknown> | undefined;
      if (context.trim()) {
        try {
          contextObj = JSON.parse(context);
        } catch {
          throw new Error('Invalid JSON in context field');
        }
      }

      const response = await openfgaApi.listUsers(storeId, {
        object: { type: objectType, id: objectId },
        relation,
        user_filters: [{ type: userFilterType }],
        authorization_model_id: model?.id,
        context: contextObj,
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'List users failed');
    } finally {
      setIsLoading(false);
    }
  };

  const formatUser = (user: ListUsersResponse['users'][0]): string => {
    if (user.object) {
      return `${user.object.type}:${user.object.id}`;
    }
    if (user.userset) {
      return `${user.userset.type}:${user.userset.id}#${user.userset.relation}`;
    }
    if (user.wildcard) {
      return `${user.wildcard.type}:*`;
    }
    return 'unknown';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          List all users who have a specific relationship with an object.
        </p>
        {loadedQuery && (
          <button
            onClick={onClearLoaded}
            className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Clear loaded query
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SelectWithInput
          label="Object Type"
          value={objectType}
          onChange={handleObjectTypeChange}
          options={types}
          placeholder="Select type..."
          color="purple"
        />

        <div>
          <label className={`block text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1.5 uppercase tracking-wide`}>Object ID</label>
          <div className="relative">
            <input
              type="text"
              value={objectId}
              onChange={(e) => handleObjectIdChange(e.target.value)}
              onFocus={() => setShowObjectIdSuggestions(true)}
              onBlur={() => setTimeout(() => setShowObjectIdSuggestions(false), 200)}
              placeholder="e.g., readme"
              className={`w-full px-3 py-2.5 border rounded-xl shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm transition-all ${
                darkMode 
                  ? 'bg-gray-700 border-gray-600 text-gray-200 hover:border-gray-500' 
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            />
            {showObjectIdSuggestions && objectIdSuggestions.length > 0 && (
              <div className={`absolute top-full left-0 right-0 mt-1 border rounded-lg shadow-lg z-50 max-h-32 overflow-auto ${
                darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'
              }`}>
                {objectIdSuggestions.slice(0, 8).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleObjectIdChange(id); setShowObjectIdSuggestions(false); }}
                    className={`w-full px-3 py-1.5 text-left text-sm ${
                      darkMode 
                        ? 'hover:bg-gray-700 text-gray-300 hover:text-purple-400' 
                        : 'hover:bg-purple-50 text-gray-700 hover:text-purple-700'
                    }`}
                  >
                    {id}
                  </button>
                ))}
              </div>
            )}
          </div>
          {objectIdSuggestions.length > 0 && (
            <p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'} mt-1`}>Type to filter suggestions from tuples</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SelectWithInput
          label="Relation"
          value={relation}
          onChange={handleRelationChange}
          options={availableRelations}
          placeholder="Select relation..."
          color="green"
        />

        <SelectWithInput
          label="User Filter Type"
          value={userFilterType}
          onChange={handleUserFilterTypeChange}
          options={types}
          placeholder="Select user type..."
          color="orange"
        />
      </div>

      <div>
        <label className={`block text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1.5 uppercase tracking-wide`}>
          Context (Optional)
        </label>
        <textarea
          value={context}
          onChange={(e) => handleContextChange(e.target.value)}
          placeholder='{"ip_address": "192.168.1.1"}'
          rows={2}
          className={`w-full px-3 py-2.5 border rounded-xl shadow-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 font-mono text-sm transition-all ${
            darkMode 
              ? 'bg-gray-700 border-gray-600 text-gray-200 hover:border-gray-500' 
              : 'bg-gray-50/50 border-gray-200 hover:border-gray-300'
          }`}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleListUsers}
          disabled={isLoading || !objectType || !objectId || !relation || !userFilterType}
          className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-xl hover:from-emerald-600 hover:to-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium shadow-lg shadow-green-500/25 transition-all"
        >
          {isLoading ? 'Loading...' : 'List Users'}
        </button>
        
        {canSave && (
          <button
            onClick={handleSave}
            className={`px-4 py-2.5 rounded-xl flex items-center gap-2 font-medium transition-all ${
              darkMode 
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            Save
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-4">
          <h4 className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
            Users ({result.users.length})
          </h4>
          {result.users.length === 0 ? (
            <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>No users found.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {result.users.map((user, index) => (
                  <button
                    key={index}
                    onClick={() => navigator.clipboard.writeText(formatUser(user))}
                    className={`px-2 py-1 rounded text-sm transition-colors cursor-pointer ${
                      darkMode 
                        ? 'bg-blue-900/50 text-blue-300 hover:bg-blue-800/50' 
                        : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                    }`}
                    title={`Click to copy: ${formatUser(user)}`}
                  >
                    {formatUser(user)}
                  </button>
                ))}
              </div>
              <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Click any item to copy</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
