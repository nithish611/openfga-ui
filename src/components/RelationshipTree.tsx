import dagre from 'dagre';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
    Background,
    ConnectionLineType,
    Controls,
    Edge,
    Handle,
    MarkerType,
    Node,
    Panel,
    Position,
    useEdgesState,
    useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useAppStore } from '../store/app-store';
import { CustomSelect } from './CustomSelect';

interface RelationshipTreeProps {
  darkMode?: boolean;
}

// Node dimensions
const NODE_WIDTH = 180;
const NODE_HEIGHT = 70;

// Custom node component with handles
const CustomNode = ({ data }: { data: { label: string; type: string; darkMode: boolean } }) => {
  const getTypeColor = (type: string, darkMode: boolean) => {
    const colors: Record<string, { bg: string; border: string; text: string }> = {
      user: { bg: darkMode ? '#1e3a5f' : '#dbeafe', border: '#3b82f6', text: darkMode ? '#93c5fd' : '#1d4ed8' },
      group: { bg: darkMode ? '#3b1f5e' : '#f3e8ff', border: '#a855f7', text: darkMode ? '#c4b5fd' : '#7c3aed' },
      organization: { bg: darkMode ? '#4a2c17' : '#ffedd5', border: '#f97316', text: darkMode ? '#fdba74' : '#c2410c' },
      org: { bg: darkMode ? '#4a2c17' : '#ffedd5', border: '#f97316', text: darkMode ? '#fdba74' : '#c2410c' },
      folder: { bg: darkMode ? '#3d3314' : '#fef9c3', border: '#eab308', text: darkMode ? '#fde047' : '#a16207' },
      document: { bg: darkMode ? '#14392b' : '#dcfce7', border: '#22c55e', text: darkMode ? '#86efac' : '#15803d' },
      doc: { bg: darkMode ? '#14392b' : '#dcfce7', border: '#22c55e', text: darkMode ? '#86efac' : '#15803d' },
      team: { bg: darkMode ? '#4a1d3d' : '#fce7f3', border: '#ec4899', text: darkMode ? '#f9a8d4' : '#be185d' },
      project: { bg: darkMode ? '#133e4a' : '#cffafe', border: '#06b6d4', text: darkMode ? '#67e8f9' : '#0891b2' },
      role: { bg: darkMode ? '#4a1d1d' : '#fee2e2', border: '#ef4444', text: darkMode ? '#fca5a5' : '#dc2626' },
    };
    return colors[type.toLowerCase()] || { 
      bg: darkMode ? '#374151' : '#f3f4f6', 
      border: '#6b7280', 
      text: darkMode ? '#d1d5db' : '#374151' 
    };
  };

  const colors = getTypeColor(data.type, data.darkMode);

  return (
    <div
      style={{
        padding: '10px 16px',
        borderRadius: '10px',
        border: `2px solid ${colors.border}`,
        backgroundColor: colors.bg,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        width: NODE_WIDTH,
        textAlign: 'center',
        position: 'relative',
      }}
    >
      {/* Top handle for incoming connections */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: colors.border,
          width: 8,
          height: 8,
          border: '2px solid #fff',
        }}
      />
      
      <div
        style={{
          fontSize: '9px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: colors.text,
          opacity: 0.8,
          marginBottom: '2px',
        }}
      >
        {data.type}
      </div>
      <div
        style={{
          fontSize: '12px',
          fontWeight: 700,
          color: data.darkMode ? '#fff' : '#1f2937',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={data.label}
      >
        {data.label}
      </div>

      {/* Bottom handle for outgoing connections */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: colors.border,
          width: 8,
          height: 8,
          border: '2px solid #fff',
        }}
      />
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

// Function to apply dagre layout
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ 
    rankdir: direction,
    nodesep: 80,  // Horizontal spacing between nodes
    ranksep: 100, // Vertical spacing between ranks/levels
    edgesep: 50,  // Spacing between edges
    marginx: 50,
    marginy: 50,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

export function RelationshipTree({ darkMode = false }: RelationshipTreeProps) {
  const { selectedStore, selectedModel, tuples: storeTuples } = useAppStore();
  const tuples = storeTuples || [];
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedRelation, setSelectedRelation] = useState<string>('');
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('TB');

  // Get all unique types from tuples
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    for (const tuple of tuples) {
      if (tuple.key?.object) {
        const match = tuple.key.object.match(/^([^:]+):/);
        if (match) types.add(match[1]);
      }
      if (tuple.key?.user) {
        const match = tuple.key.user.match(/^([^:]+):/);
        if (match) types.add(match[1]);
      }
    }
    return Array.from(types).sort();
  }, [tuples]);

  // Get all unique relations from tuples
  const availableRelations = useMemo(() => {
    const relations = new Set<string>();
    for (const tuple of tuples) {
      if (tuple.key?.relation) {
        relations.add(tuple.key.relation);
      }
    }
    return Array.from(relations).sort();
  }, [tuples]);

  // Build nodes and edges for React Flow
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!tuples || tuples.length === 0) return { initialNodes: [], initialEdges: [] };

    // Filter tuples based on selected type and relation
    const filteredTuples = tuples.filter(tuple => {
      const parent = tuple.key?.object;
      const child = tuple.key?.user;
      const relation = tuple.key?.relation;

      if (!parent || !child || !relation) return false;

      // Filter by relation
      if (selectedRelation && relation !== selectedRelation) return false;

      // Filter by type (check if parent or child matches the type)
      if (selectedType) {
        const parentType = parent.match(/^([^:]+):/)?.[1];
        const childType = child.match(/^([^:]+):/)?.[1];
        if (parentType !== selectedType && childType !== selectedType) return false;
      }

      return true;
    });

    const nodesMap = new Map<string, { type: string; name: string }>();
    const edgesArray: Edge[] = [];
    const addedEdges = new Set<string>();

    // Build nodes and edges from filtered tuples
    for (const tuple of filteredTuples) {
      const parent = tuple.key?.object;
      const child = tuple.key?.user;
      const relation = tuple.key?.relation;

      if (!parent || !child || !relation) continue;

      // Parse parent
      const parentMatch = parent.match(/^([^:]+):(.+)$/);
      if (parentMatch) {
        nodesMap.set(parent, { type: parentMatch[1], name: parentMatch[2] });
      }

      // Parse child
      const childUsersetMatch = child.match(/^([^:]+):([^#]+)#(.+)$/);
      const childRegularMatch = child.match(/^([^:]+):(.+)$/);
      
      if (childUsersetMatch) {
        nodesMap.set(child, { type: childUsersetMatch[1], name: `${childUsersetMatch[2]}#${childUsersetMatch[3]}` });
      } else if (childRegularMatch) {
        nodesMap.set(child, { type: childRegularMatch[1], name: childRegularMatch[2] });
      }

      // Create edge with unique ID (prevent duplicates)
      const edgeKey = `${parent}-${relation}-${child}`;
      if (!addedEdges.has(edgeKey)) {
        addedEdges.add(edgeKey);
        edgesArray.push({
          id: `e-${edgeKey}`,
          source: parent,
          target: child,
          label: relation,
          type: 'smoothstep',
          animated: false,
          style: { 
            stroke: darkMode ? '#9ca3af' : '#6b7280', 
            strokeWidth: 2,
          },
          labelStyle: { 
            fill: darkMode ? '#e5e7eb' : '#374151', 
            fontWeight: 600, 
            fontSize: 10,
          },
          labelBgStyle: { 
            fill: darkMode ? '#4b5563' : '#e5e7eb', 
            fillOpacity: 1,
          },
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 4,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: darkMode ? '#9ca3af' : '#6b7280',
          },
        });
      }
    }

    // Create nodes (without positions - dagre will handle that)
    const nodes: Node[] = Array.from(nodesMap.entries()).map(([id, data]) => ({
      id,
      type: 'custom',
      position: { x: 0, y: 0 },
      data: { label: data.name, type: data.type, darkMode },
    }));

    // Apply dagre layout
    if (nodes.length === 0) {
      return { initialNodes: [], initialEdges: [] };
    }

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      nodes,
      edgesArray,
      layoutDirection
    );

    return { initialNodes: layoutedNodes, initialEdges: layoutedEdges };
  }, [tuples, selectedType, selectedRelation, darkMode, layoutDirection]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes and edges when data changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Re-layout function
  const onLayout = useCallback((direction: 'TB' | 'LR') => {
    setLayoutDirection(direction);
  }, []);

  if (!selectedStore || !selectedModel) {
    return (
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white/95'} backdrop-blur-sm rounded-2xl shadow-xl border ${darkMode ? 'border-gray-700' : 'border-white/20'} p-8 text-center h-full flex flex-col items-center justify-center`}>
        <div className={`w-16 h-16 mb-4 ${darkMode ? 'bg-teal-900' : 'bg-teal-100'} rounded-xl flex items-center justify-center`}>
          <svg className={`w-8 h-8 ${darkMode ? 'text-teal-400' : 'text-teal-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
        </div>
        <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-2`}>Select a Store & Model</h2>
        <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Choose a store and model from the sidebar to view the relationship tree.</p>
      </div>
    );
  }

  if (tuples.length === 0) {
    return (
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white/95'} backdrop-blur-sm rounded-2xl shadow-xl border ${darkMode ? 'border-gray-700' : 'border-white/20'} p-8 text-center h-full flex flex-col items-center justify-center`}>
        <svg className={`w-16 h-16 mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p className={`text-base font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No tuples found</p>
        <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'} mt-1`}>Add tuples in the Tuples tab to see the relationship tree.</p>
      </div>
    );
  }

  // Show message when filters result in no data
  const hasFilters = selectedType || selectedRelation;
  const noFilteredResults = hasFilters && nodes.length === 0;

  return (
    <div className={`${darkMode ? 'bg-gray-800' : 'bg-white/95'} backdrop-blur-sm rounded-2xl shadow-xl border ${darkMode ? 'border-gray-700' : 'border-white/20'} overflow-hidden flex flex-col h-full`}>
      <div style={{ width: '100%', height: '100%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          connectionLineType={ConnectionLineType.SmoothStep}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: false,
            style: { strokeWidth: 2 },
          }}
          style={{ background: darkMode ? '#1f2937' : '#f9fafb' }}
        >
          <Background color={darkMode ? '#374151' : '#e5e7eb'} gap={20} size={1} />
          <Controls 
            showInteractive={false}
            position="bottom-right"
            style={{ 
              background: darkMode ? '#374151' : '#fff',
              borderRadius: '8px',
              border: darkMode ? '1px solid #4b5563' : '1px solid #e5e7eb',
            }}
          />
          
          {/* Title Panel */}
          <Panel position="top-left" className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-white'} shadow-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
              <div className={`p-1.5 ${darkMode ? 'bg-teal-600' : 'bg-gradient-to-br from-teal-500 to-cyan-500'} rounded-lg`}>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
              </div>
              <span className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>Relationship Tree</span>
            </div>
          </Panel>
          
          {/* Controls Panel */}
          <Panel position="top-right" className="flex items-center gap-2">
            <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-white'} shadow-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
              {/* Type Filter */}
              <div className="flex items-center gap-2">
                <label className={`text-xs font-semibold whitespace-nowrap ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Type:</label>
                <div style={{ minWidth: '140px', width: 'auto' }}>
                  <CustomSelect
                    value={selectedType}
                    onChange={setSelectedType}
                    options={[
                      { value: '', label: 'All Types' },
                      ...availableTypes.map(type => ({ value: type, label: type }))
                    ]}
                    placeholder="All Types"
                    color="teal"
                    size="sm"
                    darkMode={darkMode}
                  />
                </div>
              </div>
              
              {/* Divider */}
              <div className={`w-px h-6 ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`} />
              
              {/* Relation Filter */}
              <div className="flex items-center gap-2">
                <label className={`text-xs font-semibold whitespace-nowrap ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Relation:</label>
                <div style={{ minWidth: '140px', width: 'auto' }}>
                  <CustomSelect
                    value={selectedRelation}
                    onChange={setSelectedRelation}
                    options={[
                      { value: '', label: 'All Relations' },
                      ...availableRelations.map(relation => ({ value: relation, label: relation }))
                    ]}
                    placeholder="All Relations"
                    color="teal"
                    size="sm"
                    darkMode={darkMode}
                  />
                </div>
              </div>
              
              {/* Divider */}
              <div className={`w-px h-6 ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`} />
              
              {/* Layout Direction */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onLayout('TB')}
                  className={`px-2.5 py-1.5 text-xs rounded-md font-medium transition-colors ${layoutDirection === 'TB' 
                    ? (darkMode ? 'bg-teal-600 text-white' : 'bg-teal-500 text-white') 
                    : (darkMode ? 'bg-gray-600 text-gray-300 hover:bg-gray-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')
                  }`}
                  title="Top to Bottom"
                >
                  ↓ Vertical
                </button>
                <button
                  onClick={() => onLayout('LR')}
                  className={`px-2.5 py-1.5 text-xs rounded-md font-medium transition-colors ${layoutDirection === 'LR' 
                    ? (darkMode ? 'bg-teal-600 text-white' : 'bg-teal-500 text-white') 
                    : (darkMode ? 'bg-gray-600 text-gray-300 hover:bg-gray-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')
                  }`}
                  title="Left to Right"
                >
                  → Horizontal
                </button>
              </div>
              
              {/* Clear Filters */}
              {(selectedType || selectedRelation) && (
                <>
                  <div className={`w-px h-6 ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`} />
                  <button
                    onClick={() => {
                      setSelectedType('');
                      setSelectedRelation('');
                    }}
                    className={`px-2.5 py-1.5 text-xs rounded-md font-medium transition-colors ${darkMode ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          </Panel>
          
          {/* Stats Panel */}
          <Panel position="bottom-left">
            <div className={`px-3 py-2 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-white'} shadow-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
              <span className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                <span className="font-semibold">{nodes.length}</span> nodes • <span className="font-semibold">{edges.length}</span> relationships
                {hasFilters && (
                  <span className={`ml-2 ${darkMode ? 'text-teal-400' : 'text-teal-600'}`}>
                    (filtered)
                  </span>
                )}
              </span>
            </div>
          </Panel>
          
          {/* No Results Message */}
          {noFilteredResults && (
            <Panel position="bottom-center">
              <div className={`px-4 py-3 rounded-lg ${darkMode ? 'bg-yellow-900/50 border-yellow-700' : 'bg-yellow-50 border-yellow-200'} shadow-lg border`}>
                <div className="flex items-center gap-2">
                  <svg className={`w-4 h-4 ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className={`text-sm font-medium ${darkMode ? 'text-yellow-300' : 'text-yellow-700'}`}>
                    No relationships match the selected filters
                  </span>
                </div>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>
    </div>
  );
}
