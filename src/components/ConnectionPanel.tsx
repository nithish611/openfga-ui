import { useEffect, useState } from 'react';
import openfgaApi from '../services/openfga-api';
import { useAppStore } from '../store/app-store';
import type { AuthMethod, OIDCConfig } from '../types/openfga';

// Official OpenFGA Logo SVG Component
const OpenFGALogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" rx="20" fill="url(#openfga-gradient)"/>
    <path d="M25 35C25 32.2386 27.2386 30 30 30H70C72.7614 30 75 32.2386 75 35V45C75 47.7614 72.7614 50 70 50H30C27.2386 50 25 47.7614 25 45V35Z" fill="white"/>
    <path d="M30 55C30 52.2386 32.2386 50 35 50H65C67.7614 50 70 52.2386 70 55V65C70 67.7614 67.7614 70 65 70H35C32.2386 70 30 67.7614 30 65V55Z" fill="white" fillOpacity="0.8"/>
    <circle cx="40" cy="40" r="5" fill="#6366F1"/>
    <circle cx="60" cy="40" r="5" fill="#8B5CF6"/>
    <path d="M45 60H55" stroke="#6366F1" strokeWidth="3" strokeLinecap="round"/>
    <defs>
      <linearGradient id="openfga-gradient" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
        <stop stopColor="#6366F1"/>
        <stop offset="1" stopColor="#8B5CF6"/>
      </linearGradient>
    </defs>
  </svg>
);

interface ConnectionPanelProps {
  compact?: boolean;
  darkMode?: boolean;
}

export function ConnectionPanel({ compact = false, darkMode = false }: ConnectionPanelProps) {
  const {
    connection,
    setConnection,
    isConnected,
    setIsConnected,
    connectionError,
    setConnectionError,
    setStores,
    setSelectedStore,
    setStoresLoading,
    setStoresContinuationToken,
  } = useAppStore();

  const [serverUrl, setServerUrl] = useState(connection.serverUrl);
  const [authMethod, setAuthMethod] = useState<AuthMethod>(connection.authMethod || 'none');
  const [apiToken, setApiToken] = useState(connection.apiToken || '');
  const [oidcConfig, setOidcConfig] = useState<OIDCConfig>(connection.oidcConfig || {
    clientId: '',
    clientSecret: '',
    tokenEndpoint: '',
    audience: '',
    scopes: '',
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [showOidcAdvanced, setShowOidcAdvanced] = useState(false);

  useEffect(() => {
    setServerUrl(connection.serverUrl);
    setAuthMethod(connection.authMethod || 'none');
    setApiToken(connection.apiToken || '');
    if (connection.oidcConfig) {
      setOidcConfig(connection.oidcConfig);
    }
  }, [connection]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setConnectionError(null);

    const config = {
      serverUrl: serverUrl.replace(/\/$/, ''),
      authMethod,
      apiToken: authMethod === 'preshared' ? apiToken : undefined,
      oidcConfig: authMethod === 'oidc' ? oidcConfig : undefined,
    };

    openfgaApi.setConfig(config);

    try {
      setStoresLoading(true);
      const response = await openfgaApi.listStores();
      
      setConnection(config);
      setIsConnected(true);
      setStores(response.stores);
      setStoresContinuationToken(response.continuation_token || null);
      
      if (response.stores.length > 0) {
        setSelectedStore(response.stores[0]);
      }
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : 'Failed to connect to OpenFGA server'
      );
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
      setStoresLoading(false);
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setStores([]);
    setSelectedStore(null);
    setStoresContinuationToken(null);
    setConnectionError(null);
  };

  if (compact) {
    return (
      <div className="pt-2 space-y-3">
        {!isConnected ? (
          <>
            {/* Server URL */}
            <div>
              <label className={`block text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Server URL</label>
              <input
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://localhost:8080"
                className={`w-full px-2.5 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                  darkMode ? 'bg-gray-600 border-gray-500 text-white placeholder-gray-400' : 'border-gray-200 bg-white'
                }`}
              />
            </div>

            {/* Authentication Method */}
            <div>
              <label className={`block text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Authentication</label>
              <div className="flex gap-1">
                {[
                  { id: 'none', label: 'None', icon: '🔓' },
                  { id: 'preshared', label: 'Pre-shared', icon: '🔑' },
                  { id: 'oidc', label: 'OIDC', icon: '🔐' },
                ].map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setAuthMethod(method.id as AuthMethod)}
                    className={`flex-1 px-2 py-1.5 text-xs rounded-lg transition-all flex items-center justify-center gap-1 ${
                      authMethod === method.id
                        ? darkMode
                          ? 'bg-purple-600 text-white'
                          : 'bg-purple-100 text-purple-700 border-purple-300 border'
                        : darkMode
                          ? 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>{method.icon}</span>
                    <span className="font-medium">{method.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Pre-shared Key Input */}
            {authMethod === 'preshared' && (
              <div>
                <label className={`block text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1`}>
                  Pre-shared Key
                </label>
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="Enter pre-shared key"
                  className={`w-full px-2.5 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                    darkMode ? 'bg-gray-600 border-gray-500 text-white placeholder-gray-400' : 'border-gray-200 bg-white'
                  }`}
                />
                <p className={`text-[10px] mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Token set via OPENFGA_AUTHN_PRESHARED_KEYS
                </p>
              </div>
            )}

            {/* OIDC Configuration */}
            {authMethod === 'oidc' && (
              <div className={`space-y-2 p-2.5 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'} border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                <div>
                  <label className={`block text-[10px] font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-0.5`}>
                    Token Endpoint *
                  </label>
                  <input
                    type="url"
                    value={oidcConfig.tokenEndpoint}
                    onChange={(e) => setOidcConfig({ ...oidcConfig, tokenEndpoint: e.target.value })}
                    placeholder="https://auth.example.com/oauth/token"
                    className={`w-full px-2 py-1.5 text-xs border rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                      darkMode ? 'bg-gray-600 border-gray-500 text-white placeholder-gray-400' : 'border-gray-200 bg-white'
                    }`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={`block text-[10px] font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-0.5`}>
                      Client ID *
                    </label>
                    <input
                      type="text"
                      value={oidcConfig.clientId}
                      onChange={(e) => setOidcConfig({ ...oidcConfig, clientId: e.target.value })}
                      placeholder="client_id"
                      className={`w-full px-2 py-1.5 text-xs border rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                        darkMode ? 'bg-gray-600 border-gray-500 text-white placeholder-gray-400' : 'border-gray-200 bg-white'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-[10px] font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-0.5`}>
                      Client Secret *
                    </label>
                    <input
                      type="password"
                      value={oidcConfig.clientSecret}
                      onChange={(e) => setOidcConfig({ ...oidcConfig, clientSecret: e.target.value })}
                      placeholder="••••••••"
                      className={`w-full px-2 py-1.5 text-xs border rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                        darkMode ? 'bg-gray-600 border-gray-500 text-white placeholder-gray-400' : 'border-gray-200 bg-white'
                      }`}
                    />
                  </div>
                </div>
                
                {/* Advanced OIDC Options */}
                <button
                  onClick={() => setShowOidcAdvanced(!showOidcAdvanced)}
                  className={`text-[10px] ${darkMode ? 'text-purple-400' : 'text-purple-600'} hover:underline flex items-center gap-1`}
                >
                  <svg className={`w-3 h-3 transition-transform ${showOidcAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Advanced Options
                </button>
                
                {showOidcAdvanced && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className={`block text-[10px] font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-0.5`}>
                        Audience
                      </label>
                      <input
                        type="text"
                        value={oidcConfig.audience || ''}
                        onChange={(e) => setOidcConfig({ ...oidcConfig, audience: e.target.value })}
                        placeholder="Optional"
                        className={`w-full px-2 py-1.5 text-xs border rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                          darkMode ? 'bg-gray-600 border-gray-500 text-white placeholder-gray-400' : 'border-gray-200 bg-white'
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block text-[10px] font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-0.5`}>
                        Scopes
                      </label>
                      <input
                        type="text"
                        value={oidcConfig.scopes || ''}
                        onChange={(e) => setOidcConfig({ ...oidcConfig, scopes: e.target.value })}
                        placeholder="openid profile"
                        className={`w-full px-2 py-1.5 text-xs border rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                          darkMode ? 'bg-gray-600 border-gray-500 text-white placeholder-gray-400' : 'border-gray-200 bg-white'
                        }`}
                      />
                    </div>
                  </div>
                )}
                
                <p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Uses client_credentials grant flow
                </p>
              </div>
            )}

            {connectionError && (
              <div className={`p-2 ${darkMode ? 'bg-red-900/50 border-red-700' : 'bg-red-50 border-red-200'} border rounded-lg`}>
                <p className={`text-xs ${darkMode ? 'text-red-400' : 'text-red-600'}`}>{connectionError}</p>
              </div>
            )}
            
            <button
              onClick={handleConnect}
              disabled={isConnecting || !serverUrl || (authMethod === 'oidc' && (!oidcConfig.clientId || !oidcConfig.clientSecret || !oidcConfig.tokenEndpoint))}
              className="w-full py-2 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-lg hover:from-purple-700 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium shadow transition-all"
            >
              {isConnecting ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Connecting...
                </>
              ) : (
                <>
                  <OpenFGALogo className="w-4 h-4" />
                  Connect
                </>
              )}
            </button>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className={`text-sm font-medium ${darkMode ? 'text-green-400' : 'text-green-700'}`}>Connected</span>
            </div>
            <button
              onClick={handleDisconnect}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                darkMode ? 'bg-gray-600 text-gray-300 hover:bg-gray-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  // Original full layout (kept for backwards compatibility)
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-white/20">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-1.5 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-gray-900">Server Connection</h2>
      </div>

      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label htmlFor="serverUrl" className="block text-xs font-medium text-gray-600 mb-1">
            Server URL
          </label>
          <input
            type="url"
            id="serverUrl"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://localhost:8080"
            disabled={isConnected}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
          />
        </div>

        <div className="flex-1">
          <label htmlFor="apiToken" className="block text-xs font-medium text-gray-600 mb-1">
            API Token (Optional)
          </label>
          <input
            type="password"
            id="apiToken"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder="Bearer token"
            disabled={isConnected}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
          />
        </div>

        <div className="flex items-center gap-2">
          {!isConnected ? (
            <button
              onClick={handleConnect}
              disabled={isConnecting || !serverUrl}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-lg hover:from-purple-700 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium shadow-lg shadow-purple-500/25 transition-all"
            >
              {isConnecting ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  ...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Connect
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2 text-sm font-medium transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Disconnect
            </button>
          )}

          {isConnected && (
            <span className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 bg-green-100 text-green-700 rounded-full">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Connected
            </span>
          )}
        </div>
      </div>

      {connectionError && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-700">{connectionError}</p>
        </div>
      )}
    </div>
  );
}
