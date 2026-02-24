import { useState } from 'react';
import { useAppStore } from '../store/app-store';
import { extractTimestampFromULID, formatDateTime, formatRelativeTime } from '../utils/ulid';
import { CopyButton } from './CopyButton';
import { CustomSelect } from './CustomSelect';

interface ModelSelectorProps {
  compact?: boolean;
  darkMode?: boolean;
}

export function ModelSelector({ compact = false, darkMode = false }: ModelSelectorProps) {
  const {
    isConnected,
    selectedStore,
    authorizationModels,
    selectedModel,
    setSelectedModel,
    modelsLoading,
  } = useAppStore();
  
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  const toggleTypeExpanded = (typeName: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(typeName)) {
        next.delete(typeName);
      } else {
        next.add(typeName);
      }
      return next;
    });
  };

  const handleModelChange = (modelId: string) => {
    const model = authorizationModels.find((m) => m.id === modelId);
    if (model) {
      setSelectedModel(model);
    }
  };

  if (!isConnected || !selectedStore) {
    return null;
  }

  if (compact) {
    return (
      <div className="pt-2 space-y-3">
        {/* Model Selection */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-600">Authorization Model</label>
            {modelsLoading && (
              <svg className="w-3 h-3 animate-spin text-purple-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </div>
          
          {authorizationModels.length === 0 ? (
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-center">
              <p className="text-xs text-gray-500">No models found</p>
              <p className="text-[10px] text-gray-400 mt-1">Create a model in the Model tab</p>
            </div>
          ) : (
            <CustomSelect
              value={selectedModel?.id || ''}
              onChange={handleModelChange}
              options={authorizationModels.map((model) => ({
                value: model.id,
                label: model.id
              }))}
              placeholder="Select model..."
              color="purple"
              size="sm"
            />
          )}
        </div>

        {/* Model Info */}
        {selectedModel && (
          <div className={`p-3 ${darkMode ? 'bg-purple-900/30 border-purple-700' : 'bg-purple-50 border-purple-200'} rounded-lg border`}>
            {/* Latest Badge - show if this is the first (latest) model */}
            {authorizationModels.length > 0 && selectedModel.id === authorizationModels[0].id && (
              <div className={`flex items-center gap-1.5 mb-3 px-2 py-1.5 rounded-lg ${darkMode ? 'bg-green-900/40 border-green-700' : 'bg-green-50 border-green-200'} border`}>
                <svg className={`w-3.5 h-3.5 ${darkMode ? 'text-green-400' : 'text-green-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className={`text-xs font-semibold ${darkMode ? 'text-green-400' : 'text-green-700'}`}>Latest Model</span>
                <span className={`text-[10px] ${darkMode ? 'text-green-500' : 'text-green-600'}`}>(LTS)</span>
              </div>
            )}
            
            {/* Model ID with Copy */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0 flex-1">
                <div className={`text-[10px] ${darkMode ? 'text-purple-400' : 'text-purple-600'} font-medium uppercase tracking-wide mb-1`}>Model ID</div>
                <code className={`text-xs ${darkMode ? 'text-purple-300' : 'text-purple-700'} break-all block font-mono leading-relaxed`}>{selectedModel.id}</code>
              </div>
              <CopyButton text={selectedModel.id} label="Model ID" className="!p-1.5 flex-shrink-0 mt-3" />
            </div>

            {/* Schema & Stats Row */}
            <div className={`flex items-center justify-between py-2 border-t border-b ${darkMode ? 'border-purple-700/50' : 'border-purple-200/70'} mb-3`}>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] ${darkMode ? 'text-purple-400' : 'text-purple-500'} uppercase tracking-wide`}>Schema</span>
                <span className={`text-xs ${darkMode ? 'text-purple-300' : 'text-purple-700'} font-semibold`}>v{selectedModel.schema_version}</span>
              </div>
              <span className={`text-[10px] ${darkMode ? 'text-purple-300 bg-purple-800' : 'text-purple-600 bg-purple-100'} px-2 py-1 rounded font-medium`}>
                {selectedModel.type_definitions.length} types
              </span>
            </div>
            
            {/* Model creation time from ULID */}
            {(() => {
              const timestamp = extractTimestampFromULID(selectedModel.id);
              if (timestamp) {
                return (
                  <div className={`flex items-center gap-2 text-xs ${darkMode ? 'text-purple-400' : 'text-purple-500'} mb-3`} title={formatDateTime(timestamp.toISOString())}>
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span><span className={`${darkMode ? 'text-purple-300' : 'text-purple-600'} font-medium`}>Created:</span> {formatRelativeTime(timestamp.toISOString())}</span>
                  </div>
                );
              }
              return null;
            })()}

            {/* Types Section - Always visible */}
            <div>
              <div className={`text-[10px] ${darkMode ? 'text-purple-400' : 'text-purple-600'} font-medium uppercase tracking-wide mb-2`}>
                Types
              </div>
              <div className="space-y-1.5 max-h-48 overflow-auto">
                {selectedModel.type_definitions.map((td) => {
                  const relations = td.relations ? Object.keys(td.relations) : [];
                  const isExpanded = expandedTypes.has(td.type);
                  
                  return (
                    <div key={td.type} className={`${darkMode ? 'bg-gray-700/50' : 'bg-white'} rounded-lg border ${darkMode ? 'border-purple-700/50' : 'border-purple-200'} overflow-hidden`}>
                      <button
                        onClick={() => toggleTypeExpanded(td.type)}
                        className={`w-full px-2.5 py-2 flex items-center justify-between text-left ${darkMode ? 'hover:bg-gray-600/50' : 'hover:bg-purple-50'} transition-colors`}
                      >
                        <span className={`text-xs font-semibold ${darkMode ? 'text-purple-300' : 'text-purple-700'}`}>{td.type}</span>
                        <div className="flex items-center gap-1.5">
                          {relations.length > 0 && (
                            <span className={`text-[10px] ${darkMode ? 'text-purple-400' : 'text-purple-500'}`}>
                              {relations.length} rel
                            </span>
                          )}
                          {relations.length > 0 && (
                            <svg className={`w-3.5 h-3.5 ${darkMode ? 'text-purple-400' : 'text-purple-500'} transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </div>
                      </button>
                      
                      {isExpanded && relations.length > 0 && (
                        <div className={`px-2.5 pb-2.5 pt-2 border-t ${darkMode ? 'border-purple-700/50' : 'border-purple-100'}`}>
                          <div className="flex flex-wrap gap-1.5">
                            {relations.map((rel) => (
                              <span
                                key={rel}
                                className={`px-2 py-1 text-[10px] rounded-md ${darkMode ? 'bg-green-900/50 text-green-300 border-green-700' : 'bg-green-50 text-green-700 border-green-200'} border font-medium`}
                              >
                                {rel}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full layout (not used currently, but available)
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-white/20">
      <div className="flex items-center gap-3">
        <div className="p-1.5 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        
        <div className="flex-1">
          {authorizationModels.length === 0 ? (
            <span className="text-sm text-gray-500">No models found</span>
          ) : (
            <CustomSelect
              value={selectedModel?.id || ''}
              onChange={handleModelChange}
              options={authorizationModels.map((model, index) => ({
                value: model.id,
                label: `${model.id}${index === 0 ? ' (latest)' : ''}`
              }))}
              placeholder="Select a model..."
              color="purple"
            />
          )}
        </div>
      </div>
    </div>
  );
}
