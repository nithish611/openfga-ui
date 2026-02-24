import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import openfgaApi from '../services/openfga-api';
import { useAppStore } from '../store/app-store';
import type { Tuple, TupleKey } from '../types/openfga';
import { ConfirmDialog } from './ConfirmDialog';
import { CopyButton } from './CopyButton';

interface TupleManagerProps {
  darkMode?: boolean;
}

export function TupleManager({ darkMode = false }: TupleManagerProps) {
  const {
    selectedStore,
    selectedModel,
    tuples,
    setTuples,
    appendTuples,
    tuplesLoading,
    setTuplesLoading,
    tuplesContinuationToken,
    setTuplesContinuationToken,
  } = useAppStore();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newTuple, setNewTuple] = useState<TupleKey>({ user: '', relation: '', object: '' });
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterUser, setFilterUser] = useState('');
  const [filterRelation, setFilterRelation] = useState('');
  const [filterObject, setFilterObject] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTupleIndex, setSelectedTupleIndex] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; tuple: TupleKey | null }>({
    isOpen: false,
    tuple: null,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  const handleTableScroll = useCallback(() => {
    const el = tableScrollRef.current;
    if (!el || !tuplesContinuationToken || loadingMore || tuplesLoading) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight < 60) {
      setLoadingMore(true);
      openfgaApi.readTuples(
        selectedStore!.id,
        100,
        tuplesContinuationToken
      ).then((response) => {
        appendTuples(response.tuples);
        setTuplesContinuationToken(response.continuation_token || null);
      }).catch((err) => {
        console.error('Failed to load more tuples:', err);
      }).finally(() => {
        setLoadingMore(false);
      });
    }
  }, [tuplesContinuationToken, loadingMore, tuplesLoading, selectedStore, appendTuples, setTuplesContinuationToken]);

  // Client-side filtered tuples
  const filteredTuples = useMemo(() => {
    const userFilter = filterUser.toLowerCase().trim();
    const relationFilter = filterRelation.toLowerCase().trim();
    const objectFilter = filterObject.toLowerCase().trim();
    
    // If no filters, return all tuples
    if (!userFilter && !relationFilter && !objectFilter) {
      return tuples;
    }
    
    return tuples.filter(tuple => {
      const matchesUser = !userFilter || tuple.key.user.toLowerCase().includes(userFilter);
      const matchesRelation = !relationFilter || tuple.key.relation.toLowerCase().includes(relationFilter);
      const matchesObject = !objectFilter || tuple.key.object.toLowerCase().includes(objectFilter);
      return matchesUser && matchesRelation && matchesObject;
    });
  }, [tuples, filterUser, filterRelation, filterObject]);
  
  // Get selected tuple from filtered list
  const selectedTuple = selectedTupleIndex !== null ? filteredTuples[selectedTupleIndex] : null;

  const loadTuples = useCallback(async (reset = true) => {
    if (!selectedStore) return;

    setTuplesLoading(true);
    setError(null);

    try {
      const response = await openfgaApi.readTuples(
        selectedStore.id,
        100,
        reset ? undefined : tuplesContinuationToken || undefined
      );

      if (reset) {
        setTuples(response.tuples);
        setSelectedTupleIndex(null); // Reset selection when tuples are reloaded
      } else {
        appendTuples(response.tuples);
      }
      setTuplesContinuationToken(response.continuation_token || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tuples');
    } finally {
      setTuplesLoading(false);
    }
  }, [selectedStore, tuplesContinuationToken, setTuples, appendTuples, setTuplesLoading, setTuplesContinuationToken]);

  useEffect(() => {
    if (selectedStore) {
      loadTuples(true);
    }
  }, [selectedStore]);

  const handleAddTuple = async () => {
    if (!selectedStore || !newTuple.user || !newTuple.relation || !newTuple.object) return;

    setIsAdding(true);
    setError(null);

    try {
      await openfgaApi.addTuples(selectedStore.id, [newTuple], selectedModel?.id);
      setNewTuple({ user: '', relation: '', object: '' });
      setShowAddForm(false);
      loadTuples(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add tuple');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteTuple = async (tuple: TupleKey) => {
    if (!selectedStore) return;

    setError(null);

    try {
      await openfgaApi.deleteTuples(selectedStore.id, [tuple], selectedModel?.id);
      loadTuples(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tuple');
    }
  };

  const confirmDeleteTuple = (tuple: TupleKey) => {
    setDeleteConfirm({ isOpen: true, tuple });
  };

  const handleClearFilter = () => {
    setFilterUser('');
    setFilterRelation('');
    setFilterObject('');
    setSelectedTupleIndex(null);
  };

  const tuplesToJson = () => {
    return JSON.stringify(filteredTuples.map(t => t.key), null, 2);
  };
  
  const hasActiveFilter = filterUser || filterRelation || filterObject;

  if (!selectedStore) {
    return null;
  }

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden flex flex-col h-full">
      {/* Compact Header */}
      <div className="p-3 border-b border-gray-100 bg-gradient-to-r from-cyan-50 to-blue-50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700">{tuples.length} tuples</span>
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-1.5 rounded-lg transition-colors ${showFilters ? 'bg-cyan-100 text-cyan-600' : 'text-gray-500 hover:bg-gray-100'}`}
              title="Toggle filters"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>
            <CopyButton text={tuplesToJson()} />
            <button
              onClick={() => loadTuples(true)}
              disabled={tuplesLoading}
              className="p-1.5 text-gray-500 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg disabled:opacity-50 transition-colors"
              title="Refresh"
            >
              <svg className={`w-4 h-4 ${tuplesLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3 py-1.5 text-xs bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:from-cyan-600 hover:to-blue-600 flex items-center gap-1 font-medium shadow transition-all"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add
            </button>
          </div>
        </div>

        {/* Collapsible Filter Section */}
        {showFilters && (
          <div className="mt-3 p-3 bg-white/80 rounded-lg border border-cyan-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <span className="text-xs font-semibold text-gray-700">Filter Tuples</span>
                <span className="text-[10px] text-gray-400">(instant filter as you type)</span>
              </div>
              {hasActiveFilter && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded">
                    {filteredTuples.length} of {tuples.length}
                  </span>
                  <button 
                    onClick={handleClearFilter} 
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    title="Clear all filters"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">User</label>
                <input
                  type="text"
                  value={filterUser}
                  onChange={(e) => { setFilterUser(e.target.value); setSelectedTupleIndex(null); }}
                  placeholder="e.g. user:anne"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all ${filterUser ? 'border-cyan-300 bg-cyan-50/50' : 'border-gray-200'}`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Relation</label>
                <input
                  type="text"
                  value={filterRelation}
                  onChange={(e) => { setFilterRelation(e.target.value); setSelectedTupleIndex(null); }}
                  placeholder="e.g. viewer"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all ${filterRelation ? 'border-cyan-300 bg-cyan-50/50' : 'border-gray-200'}`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Object</label>
                <input
                  type="text"
                  value={filterObject}
                  onChange={(e) => { setFilterObject(e.target.value); setSelectedTupleIndex(null); }}
                  placeholder="e.g. document:readme"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all ${filterObject ? 'border-cyan-300 bg-cyan-50/50' : 'border-gray-200'}`}
                />
              </div>
            </div>
          </div>
        )}

        {/* Inline Add Form */}
        {showAddForm && (
          <div className="mt-3 p-3 bg-white/80 rounded-lg border border-green-100">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-xs font-semibold text-gray-700">Add New Tuple</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">User</label>
                <input
                  type="text"
                  value={newTuple.user}
                  onChange={(e) => setNewTuple({ ...newTuple, user: e.target.value })}
                  placeholder="e.g. user:anne"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Relation</label>
                <input
                  type="text"
                  value={newTuple.relation}
                  onChange={(e) => setNewTuple({ ...newTuple, relation: e.target.value })}
                  placeholder="e.g. viewer"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Object</label>
                <input
                  type="text"
                  value={newTuple.object}
                  onChange={(e) => setNewTuple({ ...newTuple, object: e.target.value })}
                  placeholder="e.g. document:readme"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-3">
              <button
                onClick={() => { setShowAddForm(false); setNewTuple({ user: '', relation: '', object: '' }); }}
                className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTuple}
                disabled={isAdding || !newTuple.user || !newTuple.relation || !newTuple.object}
                className="px-4 py-1.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium shadow-sm transition-all flex items-center gap-1.5"
              >
                {isAdding ? (
                  <>
                    <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Adding...
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Tuple
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}
      </div>

      {/* Main Content Area with Side Panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Scrollable Table */}
        <div
          ref={tableScrollRef}
          onScroll={handleTableScroll}
          className={`flex-1 overflow-auto ${selectedTuple ? 'border-r border-gray-200' : ''}`}
        >
          {tuplesLoading && tuples.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin h-6 w-6 text-cyan-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : tuples.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-sm">No tuples found.</p>
            </div>
          ) : filteredTuples.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm">No tuples match your filter.</p>
              <button 
                onClick={handleClearFilter}
                className="mt-2 text-xs text-cyan-600 hover:text-cyan-700 underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Relation</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Object</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredTuples.map((tuple, index) => (
                    <tr 
                      key={index} 
                      className={`hover:bg-cyan-50 cursor-pointer transition-colors ${selectedTupleIndex === index ? 'bg-cyan-100' : ''}`}
                      onClick={() => setSelectedTupleIndex(selectedTupleIndex === index ? null : index)}
                    >
                      <td className="px-3 py-2">
                        <code className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{tuple.key.user}</code>
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 bg-gradient-to-r from-emerald-100 to-green-100 text-green-700 rounded text-xs font-medium">
                          {tuple.key.relation}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <code className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">{tuple.key.object}</code>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); confirmDeleteTuple(tuple.key); }}
                          className="text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {loadingMore && (
                <div className="p-3 text-center border-t border-gray-100">
                  <div className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-cyan-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-xs text-gray-500">Loading more tuples...</span>
                  </div>
                </div>
              )}
              {tuplesContinuationToken && !loadingMore && (
                <div className="p-1.5 text-center border-t border-gray-100">
                  <span className="text-[10px] text-gray-400">Scroll for more</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Side Panel for Selected Tuple */}
        {selectedTuple && (
          <div className="w-72 bg-gray-50 overflow-auto flex-shrink-0">
            <div className="p-3">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Tuple Details
                </h4>
                <button
                  onClick={() => setSelectedTupleIndex(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors"
                  title="Close"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* Simple Tuple JSON */}
              <div className="p-2 bg-white rounded-lg border border-gray-200">
                <div className="text-xs text-gray-500 mb-1 flex items-center justify-between">
                  <span>Tuple</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(JSON.stringify({
                      user: selectedTuple.key.user,
                      relation: selectedTuple.key.relation,
                      object: selectedTuple.key.object
                    }, null, 2))}
                    className="p-1 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded transition-colors"
                    title="Copy JSON"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
                <SyntaxHighlighter
                  language="json"
                  style={oneLight}
                  customStyle={{ margin: 0, borderRadius: '0.375rem', fontSize: '10px', padding: '0.5rem', background: '#f9fafb' }}
                >
                  {JSON.stringify({
                    user: selectedTuple.key.user,
                    relation: selectedTuple.key.relation,
                    object: selectedTuple.key.object
                  }, null, 2)}
                </SyntaxHighlighter>
              </div>

              {/* Individual Field Copy */}
              <div className="mt-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between px-2 py-1.5 bg-blue-50 rounded border border-blue-200">
                  <span className="text-xs text-blue-700 truncate flex-1" title={selectedTuple.key.user}>
                    <span className="text-blue-400 text-[10px]">user:</span> {selectedTuple.key.user}
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(selectedTuple.key.user)}
                    className="p-1 text-blue-400 hover:text-blue-600 hover:bg-blue-100 rounded transition-colors ml-1 flex-shrink-0"
                    title="Copy"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center justify-between px-2 py-1.5 bg-green-50 rounded border border-green-200">
                  <span className="text-xs text-green-700">
                    <span className="text-green-400 text-[10px]">relation:</span> {selectedTuple.key.relation}
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(selectedTuple.key.relation)}
                    className="p-1 text-green-400 hover:text-green-600 hover:bg-green-100 rounded transition-colors ml-1 flex-shrink-0"
                    title="Copy"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center justify-between px-2 py-1.5 bg-purple-50 rounded border border-purple-200">
                  <span className="text-xs text-purple-700 truncate flex-1" title={selectedTuple.key.object}>
                    <span className="text-purple-400 text-[10px]">object:</span> {selectedTuple.key.object}
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(selectedTuple.key.object)}
                    className="p-1 text-purple-400 hover:text-purple-600 hover:bg-purple-100 rounded transition-colors ml-1 flex-shrink-0"
                    title="Copy"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, tuple: null })}
        onConfirm={() => {
          if (deleteConfirm.tuple) {
            handleDeleteTuple(deleteConfirm.tuple);
          }
        }}
        title="Delete Tuple"
        message={deleteConfirm.tuple 
          ? `Are you sure you want to delete this relationship?\n\n${deleteConfirm.tuple.user} → ${deleteConfirm.tuple.relation} → ${deleteConfirm.tuple.object}`
          : 'Are you sure you want to delete this tuple?'
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
