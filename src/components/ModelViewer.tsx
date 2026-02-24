import { useEffect, useMemo, useRef, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import openfgaApi from '../services/openfga-api';
import { useAppStore } from '../store/app-store';
import type { AuthorizationModel, TypeDefinition, Userset } from '../types/openfga';
import { modelToDSLForEdit, parseDSL } from '../utils/dsl-parser';
import { extractTimestampFromULID, formatDateTime, formatRelativeTime } from '../utils/ulid';
import { CopyButton } from './CopyButton';
import { CustomSelect } from './CustomSelect';

interface ModelViewerProps {
  darkMode?: boolean;
}

export function ModelViewer({ darkMode = false }: ModelViewerProps) {
  const { 
    selectedStore, 
    authorizationModels, 
    selectedModel, 
    setSelectedModel, 
    modelsLoading,
    setAuthorizationModels 
  } = useAppStore();
  const [viewMode, setViewMode] = useState<'visual' | 'json' | 'dsl' | 'edit'>('visual');
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isNewModel, setIsNewModel] = useState(false);
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [showSyntaxRef, setShowSyntaxRef] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Live DSL validation
  const dslErrors = useMemo(() => {
    if (!editContent.trim()) return [];
    
    const errors: { line: number; message: string }[] = [];
    const lines = editContent.split('\n');
    
    let hasModel = false;
    let hasSchema = false;
    let currentType: string | null = null;
    let inRelations = false;
    
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const lineNum = index + 1;
      
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return;
      
      // Check for model declaration
      if (trimmed === 'model') {
        if (hasModel) {
          errors.push({ line: lineNum, message: 'Duplicate "model" declaration' });
        }
        hasModel = true;
        return;
      }
      
      // Check for schema version
      if (trimmed.startsWith('schema ')) {
        if (!hasModel) {
          errors.push({ line: lineNum, message: '"schema" must come after "model"' });
        }
        if (hasSchema) {
          errors.push({ line: lineNum, message: 'Duplicate "schema" declaration' });
        }
        const version = trimmed.replace('schema ', '').trim();
        if (version !== '1.1' && version !== '1.0') {
          errors.push({ line: lineNum, message: `Invalid schema version "${version}". Use "1.1"` });
        }
        hasSchema = true;
        return;
      }
      
      // Check for type declaration
      if (trimmed.startsWith('type ')) {
        if (!hasModel) {
          errors.push({ line: lineNum, message: '"type" must come after "model" declaration' });
        }
        const typeName = trimmed.replace('type ', '').trim();
        if (!typeName) {
          errors.push({ line: lineNum, message: 'Type name is required' });
        } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(typeName)) {
          errors.push({ line: lineNum, message: `Invalid type name "${typeName}"` });
        }
        currentType = typeName;
        inRelations = false;
        return;
      }
      
      // Check for relations block
      if (trimmed === 'relations') {
        if (!currentType) {
          errors.push({ line: lineNum, message: '"relations" must be inside a type definition' });
        }
        inRelations = true;
        return;
      }
      
      // Check for define statement
      if (trimmed.startsWith('define ')) {
        if (!inRelations) {
          errors.push({ line: lineNum, message: '"define" must be inside a "relations" block' });
        }
        const defineContent = trimmed.replace('define ', '');
        if (!defineContent.includes(':')) {
          errors.push({ line: lineNum, message: 'Invalid define syntax. Expected "define name: expression"' });
        } else {
          const [name] = defineContent.split(':');
          if (!name.trim()) {
            errors.push({ line: lineNum, message: 'Relation name is required' });
          } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name.trim())) {
            errors.push({ line: lineNum, message: `Invalid relation name "${name.trim()}"` });
          }
        }
        return;
      }
      
      // Check for condition
      if (trimmed.startsWith('condition ')) {
        inRelations = false;
        currentType = null;
        return;
      }
      
      // Unknown line (not indentation or known keyword)
      if (trimmed && !line.startsWith(' ') && !line.startsWith('\t')) {
        errors.push({ line: lineNum, message: `Unknown keyword or invalid syntax: "${trimmed.substring(0, 20)}..."` });
      }
    });
    
    // Global validations
    if (editContent.trim() && !hasModel) {
      errors.unshift({ line: 1, message: 'Model must start with "model" declaration' });
    }
    if (hasModel && !hasSchema) {
      errors.push({ line: 2, message: 'Missing "schema 1.1" after model declaration' });
    }
    
    return errors;
  }, [editContent]);

  // Initialize edit content when model changes or entering edit mode
  useEffect(() => {
    if (selectedModel && viewMode === 'edit' && !isNewModel) {
      setEditContent(modelToDSLForEdit(selectedModel));
      setSaveError(null);
      setSaveSuccess(null);
    }
  }, [selectedModel, viewMode, isNewModel]);

  // Close save menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowSaveMenu(false);
    if (showSaveMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showSaveMenu]);

  if (!selectedStore) {
    return null;
  }

  const handleModelChange = (modelId: string) => {
    const model = authorizationModels.find((m) => m.id === modelId);
    if (model) {
      setSelectedModel(model);
    }
  };

  // Handle save model - creates a new version
  const handleSaveModel = async (setAsLatest: boolean = true) => {
    if (!selectedStore) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    setShowSaveMenu(false);

    try {
      // Parse DSL to JSON
      const modelData = parseDSL(editContent);
      
      // Validate required fields
      if (!modelData.schema_version) {
        throw new Error('schema_version is required (add "schema 1.1" after "model")');
      }
      if (!modelData.type_definitions || modelData.type_definitions.length === 0) {
        throw new Error('At least one type definition is required');
      }

      const result = await openfgaApi.writeAuthorizationModel(selectedStore.id, modelData);
      
      // Refresh the models list
      const response = await openfgaApi.listAuthorizationModels(selectedStore.id);
      setAuthorizationModels(response.authorization_models);
      
      // Select the newly created model if setAsLatest is true
      const newModel = response.authorization_models.find(m => m.id === result.authorization_model_id);
      if (newModel && setAsLatest) {
        setSelectedModel(newModel);
        setSaveSuccess('Model saved and set as active!');
      } else {
        setSaveSuccess('Model saved as new version!');
      }
      
      setIsNewModel(false);
      setTimeout(() => setSaveSuccess(null), 3000);
      
      // Switch to visual view after successful save
      setTimeout(() => setViewMode('visual'), 1500);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save model');
    } finally {
      setIsSaving(false);
    }
  };

  // Create new model template in DSL format
  const handleNewModel = () => {
    const template = `model
  schema 1.1

type user

type document
  relations
    define owner: [user]
    define viewer: [user] or owner
`;
    setEditContent(template);
    setIsNewModel(true);
    setViewMode('edit');
    setSaveError(null);
    setSaveSuccess(null);
  };

  // Edit existing model
  const handleEditModel = () => {
    if (selectedModel) {
      setEditContent(modelToDSLForEdit(selectedModel));
      setIsNewModel(false);
      setViewMode('edit');
      setSaveError(null);
      setSaveSuccess(null);
    }
  };

  // Convert model to DSL-like format for display (read-only)
  const modelToDSL = (model: AuthorizationModel): string => {
    const lines: string[] = [];
    lines.push(`model`);
    lines.push(`  schema ${model.schema_version}`);
    lines.push('');

    for (const typeDef of model.type_definitions) {
      lines.push(`type ${typeDef.type}`);
      if (typeDef.relations) {
        lines.push('  relations');
        for (const [relationName, userset] of Object.entries(typeDef.relations)) {
          const usersetStr = usersetToString(userset, typeDef, relationName);
          lines.push(`    define ${relationName}: ${usersetStr}`);
        }
      }
      lines.push('');
    }

    if (model.conditions) {
      for (const [condName, condition] of Object.entries(model.conditions)) {
        lines.push(`condition ${condName}(${formatConditionParams(condition.parameters)}) {`);
        lines.push(`  ${condition.expression}`);
        lines.push('}');
        lines.push('');
      }
    }

    return lines.join('\n');
  };

  const formatConditionParams = (params?: Record<string, { type_name: string }>): string => {
    if (!params) return '';
    return Object.entries(params)
      .map(([name, type]) => `${name}: ${type.type_name}`)
      .join(', ');
  };

  const usersetToString = (userset: Userset, _typeDef: TypeDefinition, _relationName: string): string => {
    if (userset.this) {
      return '[direct]';
    }
    if (userset.computedUserset) {
      return userset.computedUserset.relation || '';
    }
    if (userset.tupleToUserset) {
      const tupleset = userset.tupleToUserset.tupleset?.relation || '';
      const computed = userset.tupleToUserset.computedUserset?.relation || '';
      return `${tupleset}->${computed}`;
    }
    if (userset.union) {
      const children = userset.union.child || [];
      return children.map((c) => usersetToString(c, _typeDef, _relationName)).join(' or ');
    }
    if (userset.intersection) {
      const children = userset.intersection.child || [];
      return children.map((c) => usersetToString(c, _typeDef, _relationName)).join(' and ');
    }
    if (userset.difference) {
      const base = usersetToString(userset.difference.base || {}, _typeDef, _relationName);
      const subtract = usersetToString(userset.difference.subtract || {}, _typeDef, _relationName);
      return `${base} but not ${subtract}`;
    }
    return '[unknown]';
  };

  const dslContent = selectedModel ? modelToDSL(selectedModel) : '';
  const jsonContent = selectedModel ? JSON.stringify(selectedModel, null, 2) : '';

  // Extract timestamp from model ID (ULID)
  const modelCreatedAt = selectedModel ? extractTimestampFromULID(selectedModel.id) : null;

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden flex flex-col h-full">
      {/* Compact Header */}
      <div className="p-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            {authorizationModels.length > 0 && (
              <>
                <div className="min-w-[280px]">
                  <CustomSelect
                    value={selectedModel?.id || ''}
                    onChange={handleModelChange}
                    options={authorizationModels.map((model, index) => ({
                      value: model.id,
                      label: `${model.id}${index === 0 ? ' (latest)' : ''}`
                    }))}
                    placeholder="Select model..."
                    color="purple"
                    size="sm"
                  />
                </div>
                {selectedModel && (
                  <CopyButton text={selectedModel.id} label="Model ID" className="!p-1" />
                )}
                {/* Model Timestamp */}
                {modelCreatedAt && (
                  <div 
                    className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-white/80 rounded-lg text-xs text-gray-500 border border-gray-200"
                    title={`Created: ${formatDateTime(modelCreatedAt)}`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{formatRelativeTime(modelCreatedAt)}</span>
                  </div>
                )}
              </>
            )}
            {/* New Model Button */}
            <button
              onClick={handleNewModel}
              className="px-2 py-1 text-xs bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 flex items-center gap-1 font-medium shadow transition-all"
              title="Create new model"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New
            </button>
          </div>
          
          <div className="flex items-center gap-1 p-1 bg-white rounded-lg shadow-sm flex-shrink-0">
            <button
              onClick={() => setViewMode('visual')}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
                viewMode === 'visual'
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Visual
            </button>
            <button
              onClick={() => setViewMode('dsl')}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
                viewMode === 'dsl'
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              DSL
            </button>
            <button
              onClick={() => setViewMode('json')}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
                viewMode === 'json'
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              JSON
            </button>
            <button
              onClick={handleEditModel}
              disabled={!selectedModel}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
                viewMode === 'edit'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow'
                  : 'text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Content Area - Scrollable */}
      <div className="flex-1 overflow-auto p-3">
        {modelsLoading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-purple-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : viewMode === 'edit' ? (
          /* Edit Mode - DSL Format */
          <div className="h-full flex flex-col">
            {/* Editor Toolbar */}
            <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm text-amber-800">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {isNewModel ? (
                    <span>Creating a <strong>new model</strong>. It will be saved as a new version.</span>
                  ) : (
                    <span>Editing model. OpenFGA models are <strong>immutable</strong> - saves create new versions.</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {saveSuccess && (
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {saveSuccess}
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setViewMode('visual');
                      setIsNewModel(false);
                      setSaveError(null);
                    }}
                    className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                
                {/* Save Button with Dropdown */}
                <div className="relative">
                  <div className="flex">
                    <button
                      onClick={() => handleSaveModel(true)}
                      disabled={isSaving}
                      className="px-3 py-1.5 text-xs bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-l-lg hover:from-green-600 hover:to-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 font-medium shadow transition-all"
                    >
                      {isSaving ? (
                        <>
                          <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Saving...
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                          </svg>
                          Save & Use
                        </>
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowSaveMenu(!showSaveMenu);
                      }}
                      disabled={isSaving}
                      className="px-2 py-1.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-r-lg border-l border-green-400 hover:from-emerald-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Dropdown Menu */}
                  {showSaveMenu && (
                    <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                      <button
                        onClick={() => handleSaveModel(true)}
                        className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50 flex items-start gap-2"
                      >
                        <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <div className="font-medium text-gray-900">Save & Use as Active</div>
                          <div className="text-gray-500">Save and switch to this new version</div>
                        </div>
                      </button>
                      <button
                        onClick={() => handleSaveModel(false)}
                        className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50 flex items-start gap-2"
                      >
                        <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        <div>
                          <div className="font-medium text-gray-900">Save as New Version Only</div>
                          <div className="text-gray-500">Save but keep current model selected</div>
                        </div>
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      <div className="px-3 py-2 text-xs text-gray-400">
                        <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        OpenFGA models are immutable. Each save creates a new version.
                      </div>
                    </div>
                  )}
                </div>
                </div>
              </div>
              
              {/* Save Error - Full Width */}
              {saveError && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-red-700">Save Error</div>
                    <div className="text-sm text-red-600 mt-0.5">{saveError}</div>
                  </div>
                  <button 
                    onClick={() => setSaveError(null)}
                    className="p-1 text-red-400 hover:text-red-600 hover:bg-red-100 rounded transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            
            {/* DSL Editor with Syntax Highlighting */}
            <div className={`flex-1 relative rounded-xl overflow-hidden border-2 ${dslErrors.length > 0 ? 'border-red-500' : 'border-gray-700'} focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 bg-gray-900`}>
              <div className="flex h-full">
                {/* Line Numbers */}
                <div className="flex-shrink-0 bg-gray-800 text-gray-500 text-right select-none font-mono text-sm py-4 px-2 border-r border-gray-700" style={{ lineHeight: '1.6', fontSize: '14px' }}>
                  {editContent.split('\n').map((_, i) => {
                    const lineNum = i + 1;
                    const hasError = dslErrors.some(e => e.line === lineNum);
                    return (
                      <div 
                        key={i} 
                        className={`px-1 ${hasError ? 'bg-red-500/30 text-red-400' : ''}`}
                        title={hasError ? dslErrors.find(e => e.line === lineNum)?.message : undefined}
                      >
                        {lineNum}
                      </div>
                    );
                  })}
                  {!editContent && <div className="px-1">1</div>}
                </div>
                
                {/* Editor Area */}
                <div className="flex-1 relative overflow-hidden">
                  {/* Syntax Highlighted Layer */}
                  <div 
                    ref={highlightRef}
                    className="absolute inset-0 overflow-auto pointer-events-none p-4"
                    style={{ lineHeight: '1.6', fontSize: '14px' }}
                  >
                    <pre className="font-mono text-sm m-0" style={{ lineHeight: '1.6', fontSize: '14px', fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace' }}>
                      {editContent.split('\n').map((line, i) => {
                        const hasError = dslErrors.some(e => e.line === i + 1);
                        return (
                          <div key={i} className={hasError ? 'bg-red-500/20' : ''}>
                            {highlightDSLLine(line)}
                          </div>
                        );
                      })}
                      {!editContent && <div className="text-gray-600">Start typing your model...</div>}
                    </pre>
                  </div>
                  
                  {/* Actual Textarea (transparent text) */}
                  <textarea
                    ref={textareaRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onScroll={(e) => {
                      if (highlightRef.current) {
                        highlightRef.current.scrollTop = e.currentTarget.scrollTop;
                        highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
                      }
                    }}
                    className="relative w-full h-full p-4 font-mono text-sm bg-transparent text-transparent caret-amber-400 resize-none focus:outline-none z-10"
                    style={{ 
                      fontSize: '14px',
                      lineHeight: '1.6',
                      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                      tabSize: 2,
                    }}
                    placeholder=""
                    spellCheck={false}
                  />
                </div>
              </div>
              
              {/* Editor Toolbar */}
              <div className="absolute top-2 right-2 flex items-center gap-1 z-20">
                <button
                  onClick={() => {
                    const lines = editContent.split('\n');
                    const formatted = lines.map(line => line.trimEnd()).join('\n');
                    setEditContent(formatted);
                  }}
                  className="p-1.5 bg-gray-700/90 text-gray-300 hover:bg-gray-600 rounded-lg transition-colors"
                  title="Format Code (trim whitespace)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                  </svg>
                </button>
                <CopyButton text={editContent} className="!bg-gray-700/90 !text-gray-300 hover:!bg-gray-600" />
              </div>
            </div>
            
            {/* Error Panel */}
            {dslErrors.length > 0 && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg max-h-32 overflow-auto">
                <div className="flex items-center gap-2 text-red-700 text-xs font-semibold mb-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {dslErrors.length} {dslErrors.length === 1 ? 'Error' : 'Errors'} Found
                </div>
                <div className="space-y-1">
                  {dslErrors.map((error, i) => (
                    <div key={i} className="text-xs text-red-600 flex items-start gap-2">
                      <span className="font-mono bg-red-100 px-1.5 py-0.5 rounded text-red-700">Line {error.line}</span>
                      <span>{error.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Collapsible DSL Syntax Reference */}
            <div className="mt-3">
              <button
                onClick={() => setShowSyntaxRef(!showSyntaxRef)}
                className="flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                <svg 
                  className={`w-4 h-4 transition-transform ${showSyntaxRef ? 'rotate-90' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                DSL Syntax Reference
              </button>
              
              {showSyntaxRef && (
                <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200 animate-in slide-in-from-top-2 duration-200">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-gray-600 font-mono">
                    <div><span className="text-purple-600 font-semibold">model</span> - Start of model</div>
                    <div><span className="text-purple-600 font-semibold">schema 1.1</span> - Schema version</div>
                    <div><span className="text-purple-600 font-semibold">type user</span> - Define a type</div>
                    <div><span className="text-purple-600 font-semibold">relations</span> - Start relations block</div>
                    <div><span className="text-purple-600 font-semibold">define owner: [user]</span> - Direct relation</div>
                    <div><span className="text-purple-600 font-semibold">[user, group#member]</span> - Multiple types</div>
                    <div><span className="text-purple-600 font-semibold">viewer or owner</span> - Union (OR)</div>
                    <div><span className="text-purple-600 font-semibold">viewer and owner</span> - Intersection (AND)</div>
                    <div><span className="text-purple-600 font-semibold">parent-&gt;viewer</span> - Tuple to userset</div>
                    <div><span className="text-purple-600 font-semibold">viewer but not blocked</span> - Exclusion</div>
                  </div>
                  <a 
                    href="https://openfga.dev/docs/configuration-language" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-3 text-xs text-purple-600 hover:text-purple-700 font-medium"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Full DSL Documentation
                  </a>
                </div>
              )}
            </div>
          </div>
        ) : authorizationModels.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500 mb-4">No authorization models found.</p>
            <button
              onClick={handleNewModel}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 flex items-center gap-2 mx-auto font-medium shadow transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Your First Model
            </button>
          </div>
        ) : selectedModel ? (
          <>
            {viewMode === 'visual' && <VisualModelView model={selectedModel} />}
            {viewMode === 'dsl' && (
              <div className="relative">
                <div className="absolute top-2 right-2 z-10">
                  <CopyButton text={dslContent} />
                </div>
                <SyntaxHighlighter
                  language="yaml"
                  style={oneLight}
                  customStyle={{ margin: 0, borderRadius: '0.75rem', fontSize: '13px' }}
                >
                  {dslContent}
                </SyntaxHighlighter>
              </div>
            )}
            {viewMode === 'json' && (
              <div className="relative">
                <div className="absolute top-2 right-2 z-10">
                  <CopyButton text={jsonContent} />
                </div>
                <SyntaxHighlighter
                  language="json"
                  style={oneLight}
                  customStyle={{ margin: 0, borderRadius: '0.75rem', fontSize: '13px' }}
                >
                  {jsonContent}
                </SyntaxHighlighter>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function VisualModelView({ model }: { model: AuthorizationModel }) {
  const modelCreatedAt = extractTimestampFromULID(model.id);
  
  return (
    <div className="space-y-3">
      {/* Model Info Bar */}
      <div className="flex flex-wrap items-center gap-3 p-2 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-100">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="text-gray-500">Schema:</span>
          <code className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">{model.schema_version}</code>
        </div>
        <div className="w-px h-4 bg-gray-300 hidden sm:block" />
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="text-gray-500">Types:</span>
          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded font-medium">{model.type_definitions.length}</span>
        </div>
        {modelCreatedAt && (
          <>
            <div className="w-px h-4 bg-gray-300 hidden sm:block" />
            <div className="flex items-center gap-1.5 text-xs text-gray-600" title={formatDateTime(modelCreatedAt)}>
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-gray-500">Created:</span>
              <span className="font-medium">{formatDateTime(modelCreatedAt)}</span>
            </div>
          </>
        )}
      </div>

      <div className="grid gap-3">
        {model.type_definitions.map((typeDef) => (
          <TypeDefinitionCard key={typeDef.type} typeDef={typeDef} />
        ))}
      </div>

      {model.conditions && Object.keys(model.conditions).length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-gray-700 mb-2">Conditions</h4>
          <div className="space-y-2">
            {Object.entries(model.conditions).map(([name, condition]) => (
              <div key={name} className="p-2 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="font-medium text-purple-800 text-sm">{name}</div>
                <code className="text-xs text-purple-600">{condition.expression}</code>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TypeDefinitionCard({ typeDef }: { typeDef: TypeDefinition }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasRelations = typeDef.relations && Object.keys(typeDef.relations).length > 0;

  // If no relations, show simple type card without expand button
  if (!hasRelations) {
    return (
      <div className="border border-purple-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        <div className="px-3 py-2 bg-gradient-to-r from-purple-50 to-pink-50 flex items-center gap-2">
          <span className="px-2 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded text-xs font-medium">
            type
          </span>
          <span className="font-semibold text-gray-900 text-sm">{typeDef.type}</span>
          <span className="text-xs text-gray-400 italic ml-auto">no relations</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-purple-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 bg-gradient-to-r from-purple-50 to-pink-50 flex items-center justify-between hover:from-purple-100 hover:to-pink-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded text-xs font-medium">
            type
          </span>
          <span className="font-semibold text-gray-900 text-sm">{typeDef.type}</span>
          <span className="text-xs text-gray-400">({Object.keys(typeDef.relations).length} relations)</span>
        </div>
        <svg
          className={`w-4 h-4 text-purple-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="bg-white">
          {/* Table Header */}
          <div className="grid grid-cols-[140px_100px_1fr] gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <div>Relation</div>
            <div>Type</div>
            <div>Allowed Types</div>
          </div>
          {/* Table Body */}
          <div className="divide-y divide-gray-50">
            {Object.entries(typeDef.relations).map(([relationName, userset]) => (
              <RelationRow
                key={relationName}
                relationName={relationName}
                userset={userset}
                metadata={typeDef.metadata?.relations?.[relationName]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RelationRow({
  relationName,
  userset,
  metadata,
}: {
  relationName: string;
  userset: Userset;
  metadata?: { directly_related_user_types?: Array<{ type: string; relation?: string; wildcard?: Record<string, never>; condition?: string }> };
}) {
  const getRelationType = (us: Userset): { label: string; color: string } => {
    if (us.this) return { label: 'direct', color: 'bg-emerald-100 text-emerald-700' };
    if (us.computedUserset) return { label: 'computed', color: 'bg-blue-100 text-blue-700' };
    if (us.tupleToUserset) return { label: 'ttu', color: 'bg-purple-100 text-purple-700' };
    if (us.union) return { label: 'union', color: 'bg-amber-100 text-amber-700' };
    if (us.intersection) return { label: 'intersect', color: 'bg-pink-100 text-pink-700' };
    if (us.difference) return { label: 'exclude', color: 'bg-red-100 text-red-700' };
    return { label: 'complex', color: 'bg-gray-100 text-gray-700' };
  };

  const getRelationExpression = (us: Userset): string => {
    if (us.computedUserset) return `→ ${us.computedUserset.relation}`;
    if (us.tupleToUserset) {
      return `${us.tupleToUserset.tupleset?.relation} → ${us.tupleToUserset.computedUserset?.relation}`;
    }
    if (us.union) {
      const children = us.union.child || [];
      return children.map(c => {
        if (c.this) return '[direct]';
        if (c.computedUserset) return c.computedUserset.relation;
        if (c.tupleToUserset) return `${c.tupleToUserset.tupleset?.relation}→${c.tupleToUserset.computedUserset?.relation}`;
        return '...';
      }).join(' or ');
    }
    if (us.intersection) {
      const children = us.intersection.child || [];
      return children.map(c => {
        if (c.this) return '[direct]';
        if (c.computedUserset) return c.computedUserset.relation;
        return '...';
      }).join(' and ');
    }
    if (us.difference) {
      const base = us.difference.base;
      const subtract = us.difference.subtract;
      const baseStr = base?.computedUserset?.relation || '[direct]';
      const subStr = subtract?.computedUserset?.relation || '...';
      return `${baseStr} but not ${subStr}`;
    }
    return '';
  };

  const relationType = getRelationType(userset);
  const expression = getRelationExpression(userset);

  return (
    <div className="grid grid-cols-[140px_100px_1fr] gap-2 px-3 py-2.5 hover:bg-gradient-to-r hover:from-green-50/50 hover:to-emerald-50/50 transition-colors items-center">
      {/* Relation Name Column */}
      <div>
        <span className="px-2 py-1 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded text-xs font-semibold">
          {relationName}
        </span>
      </div>
      
      {/* Type Column */}
      <div>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${relationType.color}`}>
          {relationType.label}
        </span>
      </div>
      
      {/* Allowed Types / Expression Column */}
      <div className="flex flex-wrap items-center gap-1.5">
        {metadata?.directly_related_user_types && metadata.directly_related_user_types.length > 0 ? (
          <>
            {metadata.directly_related_user_types.map((ref, idx) => (
              <span
                key={idx}
                className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-mono"
              >
                {ref.wildcard ? `${ref.type}:*` : ref.relation ? `${ref.type}#${ref.relation}` : ref.type}
              </span>
            ))}
          </>
        ) : expression ? (
          <span className="text-xs text-gray-600 font-mono">{expression}</span>
        ) : (
          <span className="text-xs text-gray-400 italic">—</span>
        )}
      </div>
    </div>
  );
}

// DSL Syntax Highlighting Helper
function highlightDSLLine(line: string): React.ReactNode {
  if (!line.trim()) return '\u00A0'; // Non-breaking space for empty lines
  
  const trimmed = line.trim();
  const indent = line.match(/^(\s*)/)?.[1] || '';
  
  // Comments
  if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return <span className="text-gray-500 italic">{line}</span>;
  }
  
  // Model keyword
  if (trimmed === 'model') {
    return <><span className="text-gray-600">{indent}</span><span className="text-purple-400 font-bold">model</span></>;
  }
  
  // Schema declaration
  if (trimmed.startsWith('schema ')) {
    const version = trimmed.replace('schema ', '');
    return (
      <>
        <span className="text-gray-600">{indent}</span>
        <span className="text-purple-400 font-bold">schema</span>
        <span className="text-gray-400"> </span>
        <span className="text-amber-400">{version}</span>
      </>
    );
  }
  
  // Type declaration
  if (trimmed.startsWith('type ')) {
    const typeName = trimmed.replace('type ', '');
    return (
      <>
        <span className="text-gray-600">{indent}</span>
        <span className="text-blue-400 font-bold">type</span>
        <span className="text-gray-400"> </span>
        <span className="text-cyan-300 font-semibold">{typeName}</span>
      </>
    );
  }
  
  // Relations keyword
  if (trimmed === 'relations') {
    return <><span className="text-gray-600">{indent}</span><span className="text-pink-400 font-bold">relations</span></>;
  }
  
  // Define statement
  if (trimmed.startsWith('define ')) {
    const content = trimmed.replace('define ', '');
    const colonIndex = content.indexOf(':');
    if (colonIndex > -1) {
      const relationName = content.substring(0, colonIndex);
      const expression = content.substring(colonIndex + 1);
      return (
        <>
          <span className="text-gray-600">{indent}</span>
          <span className="text-green-400 font-bold">define</span>
          <span className="text-gray-400"> </span>
          <span className="text-emerald-300 font-semibold">{relationName}</span>
          <span className="text-gray-400">:</span>
          {highlightExpression(expression)}
        </>
      );
    }
  }
  
  // Condition declaration
  if (trimmed.startsWith('condition ')) {
    return <><span className="text-gray-600">{indent}</span><span className="text-orange-400 font-bold">{trimmed}</span></>;
  }
  
  // Default - show as plain text
  return <span className="text-gray-300">{line}</span>;
}

// Highlight relation expressions
function highlightExpression(expr: string): React.ReactNode {
  if (!expr.trim()) return null;
  
  const parts: React.ReactNode[] = [];
  let remaining = expr;
  let key = 0;
  
  // Keywords to highlight
  const keywords = ['or', 'and', 'but not', 'from'];
  
  while (remaining.length > 0) {
    let matched = false;
    
    // Check for type references [user] or [user, group#member]
    const bracketMatch = remaining.match(/^\s*\[([^\]]+)\]/);
    if (bracketMatch) {
      parts.push(<span key={key++} className="text-gray-400">{remaining.match(/^\s*/)?.[0]}</span>);
      parts.push(<span key={key++} className="text-yellow-400">[</span>);
      parts.push(<span key={key++} className="text-yellow-300">{bracketMatch[1]}</span>);
      parts.push(<span key={key++} className="text-yellow-400">]</span>);
      remaining = remaining.substring(bracketMatch[0].length);
      matched = true;
      continue;
    }
    
    // Check for keywords
    for (const kw of keywords) {
      const kwRegex = new RegExp(`^(\\s*)(${kw})(\\s|$)`, 'i');
      const kwMatch = remaining.match(kwRegex);
      if (kwMatch) {
        parts.push(<span key={key++} className="text-gray-400">{kwMatch[1]}</span>);
        parts.push(<span key={key++} className="text-pink-400 font-semibold">{kwMatch[2]}</span>);
        remaining = remaining.substring(kwMatch[1].length + kwMatch[2].length);
        matched = true;
        break;
      }
    }
    if (matched) continue;
    
    // Check for tuple to userset (parent->viewer)
    const ttuMatch = remaining.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)->([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (ttuMatch) {
      parts.push(<span key={key++} className="text-gray-400">{remaining.match(/^\s*/)?.[0]}</span>);
      parts.push(<span key={key++} className="text-cyan-300">{ttuMatch[1]}</span>);
      parts.push(<span key={key++} className="text-gray-400">-&gt;</span>);
      parts.push(<span key={key++} className="text-cyan-300">{ttuMatch[2]}</span>);
      remaining = remaining.substring(ttuMatch[0].length);
      continue;
    }
    
    // Check for relation reference
    const relMatch = remaining.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (relMatch) {
      parts.push(<span key={key++} className="text-gray-400">{remaining.match(/^\s*/)?.[0]}</span>);
      parts.push(<span key={key++} className="text-sky-300">{relMatch[1]}</span>);
      remaining = remaining.substring(relMatch[0].length);
      continue;
    }
    
    // Default: take one character
    parts.push(<span key={key++} className="text-gray-400">{remaining[0]}</span>);
    remaining = remaining.substring(1);
  }
  
  return <>{parts}</>;
}
