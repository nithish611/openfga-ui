import { useEffect, useState } from 'react';
import { ConnectionPanel } from './components/ConnectionPanel';
import { CopyButton } from './components/CopyButton';
import { ModelSelector } from './components/ModelSelector';
import { ModelViewer } from './components/ModelViewer';
import { QueryPanel } from './components/QueryPanel';
import { RelationshipTree } from './components/RelationshipTree';
import { StoreSelector } from './components/StoreSelector';
import { TupleManager } from './components/TupleManager';
import { useAppStore } from './store/app-store';

// Official OpenFGA Logo SVG Component
const OpenFGALogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" rx="20" fill="url(#openfga-gradient-header)"/>
    <path d="M25 35C25 32.2386 27.2386 30 30 30H70C72.7614 30 75 32.2386 75 35V45C75 47.7614 72.7614 50 70 50H30C27.2386 50 25 47.7614 25 45V35Z" fill="white"/>
    <path d="M30 55C30 52.2386 32.2386 50 35 50H65C67.7614 50 70 52.2386 70 55V65C70 67.7614 67.7614 70 65 70H35C32.2386 70 30 67.7614 30 65V55Z" fill="white" fillOpacity="0.8"/>
    <circle cx="40" cy="40" r="5" fill="#6366F1"/>
    <circle cx="60" cy="40" r="5" fill="#8B5CF6"/>
    <path d="M45 60H55" stroke="#6366F1" strokeWidth="3" strokeLinecap="round"/>
    <defs>
      <linearGradient id="openfga-gradient-header" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
        <stop stopColor="#6366F1"/>
        <stop offset="1" stopColor="#8B5CF6"/>
      </linearGradient>
    </defs>
  </svg>
);

type Tab = 'model' | 'tuples' | 'queries' | 'tree';

function App() {
  const { isConnected, selectedStore, selectedModel, connection, darkMode, toggleDarkMode } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>('model');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Auto-collapse sidebar on smaller screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Apply dark mode class to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <div className={`h-screen flex flex-col overflow-hidden ${darkMode ? 'dark bg-gray-900' : ''}`}>
      {/* Compact Header */}
      <header className={`${darkMode ? 'bg-gradient-to-r from-gray-800 via-gray-900 to-gray-800' : 'bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400'} shadow-lg flex-shrink-0`}>
        <div className="px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <OpenFGALogo className="w-8 h-8" />
            <h1 className="text-lg font-bold text-white">OpenFGA UI</h1>
          </div>

          {/* Connection Status - Always visible when connected */}
          {isConnected && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/15 rounded-lg backdrop-blur-sm">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-white/90 text-xs font-medium">Connected to:</span>
                <code className="text-white text-xs font-mono bg-white/10 px-2 py-0.5 rounded">
                  {connection.serverUrl}
                </code>
              </div>
              {selectedStore && (
                <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-lg text-white/90 text-xs">
                  <span className="text-white/60">Store:</span>
                  <span className="font-medium">{selectedStore.name}</span>
                  {selectedModel && (
                    <>
                      <span className="text-white/40">•</span>
                      <span className="text-white/60">Model:</span>
                      <span className="font-mono text-white/80">{selectedModel.id.slice(0, 8)}...</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? (
                <svg className="w-4 h-4 text-yellow-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              )}
            </button>
            <a href="https://openfga.dev/docs" target="_blank" rel="noopener noreferrer" className="text-xs text-white/80 hover:text-white px-2 py-1 rounded hover:bg-white/10">
              Docs
            </a>
            <a href="https://github.com/openfga/openfga" target="_blank" rel="noopener noreferrer" className="text-xs text-white/80 hover:text-white px-2 py-1 rounded hover:bg-white/10">
              GitHub
            </a>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className={`${sidebarCollapsed ? 'w-12' : 'w-80'} flex-shrink-0 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'} border-r flex flex-col transition-all duration-300`}>
          {/* Sidebar Toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`p-2 m-2 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'} rounded-lg transition-colors self-end`}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'} transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>

          {!sidebarCollapsed && (
            <div className="flex-1 overflow-auto p-3 space-y-3">
              {/* Server Connection Section */}
              <SidebarSection title="Server Connection" icon="⚡" defaultOpen={!isConnected} darkMode={darkMode}>
                <ConnectionPanel compact darkMode={darkMode} />
              </SidebarSection>

              {/* Store Selection */}
              {isConnected && (
                <SidebarSection title="Store" icon="📦" defaultOpen={true} darkMode={darkMode}>
                  <StoreSelector compact darkMode={darkMode} />
                </SidebarSection>
              )}

              {/* Model Selection */}
              {isConnected && selectedStore && (
                <SidebarSection title="Model" icon="📄" defaultOpen={true} darkMode={darkMode}>
                  <ModelSelector compact darkMode={darkMode} />
                </SidebarSection>
              )}
            </div>
          )}

          {/* Collapsed Sidebar Icons */}
          {sidebarCollapsed && (
            <div className="flex-1 flex flex-col items-center py-2 space-y-2">
              <button
                onClick={() => setSidebarCollapsed(false)}
                className={`p-2 rounded-lg transition-colors ${isConnected ? (darkMode ? 'bg-green-900 text-green-400' : 'bg-green-100 text-green-600') : (darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500')}`}
                title="Server Connection"
              >
                ⚡
              </button>
              {isConnected && (
                <>
                  <button
                    onClick={() => setSidebarCollapsed(false)}
                    className={`p-2 rounded-lg ${darkMode ? 'bg-orange-900 text-orange-400' : 'bg-orange-100 text-orange-600'}`}
                    title="Store"
                  >
                    📦
                  </button>
                  {selectedStore && (
                    <button
                      onClick={() => setSidebarCollapsed(false)}
                      className={`p-2 rounded-lg ${darkMode ? 'bg-purple-900 text-purple-400' : 'bg-purple-100 text-purple-600'}`}
                      title="Model"
                    >
                      📄
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </aside>

        {/* Main Content Area */}
        <main className={`flex-1 flex flex-col overflow-hidden ${darkMode ? 'bg-gradient-to-br from-gray-900 to-gray-800' : 'bg-gradient-to-br from-gray-100 to-gray-200'}`}>
          {!isConnected ? (
            /* Welcome Screen */
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="max-w-md text-center">
                <div className={`w-20 h-20 mx-auto mb-6 ${darkMode ? 'bg-gradient-to-br from-purple-600 to-pink-600' : 'bg-gradient-to-br from-purple-500 to-pink-500'} rounded-2xl flex items-center justify-center shadow-lg`}>
                  <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-2`}>Welcome to OpenFGA UI</h2>
                <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-6`}>Connect to your OpenFGA server to explore authorization models, manage tuples, and test queries.</p>
                <div className={`text-left ${darkMode ? 'bg-gray-800/80' : 'bg-white/80'} backdrop-blur rounded-xl p-4 shadow-lg`}>
                  <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-800'} mb-2`}>Quick Start</h3>
                  <ol className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} space-y-2`}>
                    <li className="flex items-start gap-2">
                      <span className={`w-5 h-5 rounded-full ${darkMode ? 'bg-purple-900 text-purple-400' : 'bg-purple-100 text-purple-600'} flex items-center justify-center text-xs font-bold flex-shrink-0`}>1</span>
                      <span>Enter your OpenFGA server URL in the sidebar</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className={`w-5 h-5 rounded-full ${darkMode ? 'bg-purple-900 text-purple-400' : 'bg-purple-100 text-purple-600'} flex items-center justify-center text-xs font-bold flex-shrink-0`}>2</span>
                      <span>Add API token if authentication is enabled</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className={`w-5 h-5 rounded-full ${darkMode ? 'bg-purple-900 text-purple-400' : 'bg-purple-100 text-purple-600'} flex items-center justify-center text-xs font-bold flex-shrink-0`}>3</span>
                      <span>Click Connect and select a store</span>
                    </li>
                  </ol>
                  <div className={`mt-4 p-2 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg`}>
                    <code className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>docker run -p 8080:8080 openfga/openfga run</code>
                  </div>
                </div>
              </div>
            </div>
          ) : !selectedStore ? (
            /* No Store Selected */
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <div className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'bg-orange-900' : 'bg-orange-100'} rounded-xl flex items-center justify-center`}>
                  <span className="text-3xl">📦</span>
                </div>
                <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-2`}>Select a Store</h2>
                <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Choose a store from the sidebar to view its authorization model.</p>
              </div>
            </div>
          ) : (
            /* Main Tabs Content */
            <>
              {/* Tab Navigation */}
              <div className="flex-shrink-0 p-3 pb-0">
                <nav className={`flex gap-1 p-1 ${darkMode ? 'bg-gray-800/80' : 'bg-white/80'} backdrop-blur rounded-xl shadow`}>
                  <TabButton active={activeTab === 'model'} onClick={() => setActiveTab('model')} gradient="from-indigo-500 to-purple-500" darkMode={darkMode}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Model
                  </TabButton>
                  <TabButton active={activeTab === 'tuples'} onClick={() => setActiveTab('tuples')} gradient="from-cyan-500 to-blue-500" darkMode={darkMode}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                    Tuples
                  </TabButton>
                  <TabButton active={activeTab === 'queries'} onClick={() => setActiveTab('queries')} gradient="from-rose-500 to-orange-500" darkMode={darkMode}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Query
                  </TabButton>
                  <TabButton active={activeTab === 'tree'} onClick={() => setActiveTab('tree')} gradient="from-teal-500 to-cyan-500" darkMode={darkMode}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                    </svg>
                    Tree
                  </TabButton>
                </nav>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-hidden p-3">
                <div className="h-full">
                  {activeTab === 'model' && <ModelViewer darkMode={darkMode} />}
                  {activeTab === 'tuples' && <TupleManager darkMode={darkMode} />}
                  {activeTab === 'queries' && <QueryPanel darkMode={darkMode} />}
                  {activeTab === 'tree' && <RelationshipTree darkMode={darkMode} />}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  ); 
}

// Sidebar Section Component
function SidebarSection({ title, icon, defaultOpen, children, darkMode = false }: { title: string; icon: string; defaultOpen: boolean; children: React.ReactNode; darkMode?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} rounded-xl shadow-sm border overflow-hidden`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 flex items-center justify-between ${darkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-50'} transition-colors`}
      >
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{title}</span>
        </div>
        <svg className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-400'} transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className={`px-3 pb-3 border-t ${darkMode ? 'border-gray-600' : 'border-gray-100'}`}>
          {children}
        </div>
      )}
    </div>
  );
}

// Tab Button Component
function TabButton({ active, onClick, gradient, children, darkMode = false }: { active: boolean; onClick: () => void; gradient: string; children: React.ReactNode; darkMode?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 px-3 font-medium text-sm transition-all rounded-lg flex items-center justify-center gap-2 ${
        active
          ? `bg-gradient-to-r ${gradient} text-white shadow`
          : darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

export default App;
