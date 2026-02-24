import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  color?: 'purple' | 'blue' | 'green' | 'orange' | 'teal' | 'gray';
  size?: 'sm' | 'md';
  darkMode?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className = '',
  color = 'purple',
  size = 'md',
  darkMode = false,
  searchable = false,
  searchPlaceholder = 'Search...',
  onLoadMore,
  hasMore = false,
  loadingMore = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  const filteredOptions = useMemo(() => {
    if (!searchable || !searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase().trim();
    return options.filter(
      opt => opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q)
    );
  }, [options, searchQuery, searchable]);

  // Update dropdown position when opened
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchable) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen, searchable]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || !onLoadMore || !hasMore || loadingMore) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight < 40) {
      onLoadMore();
    }
  }, [onLoadMore, hasMore, loadingMore]);

  const colorClasses = {
    purple: {
      selected: 'bg-purple-100 text-purple-700 border-purple-300',
      hover: 'hover:bg-purple-50',
      ring: 'ring-purple-500',
      highlight: 'bg-purple-100 text-purple-700',
    },
    blue: {
      selected: 'bg-blue-100 text-blue-700 border-blue-300',
      hover: 'hover:bg-blue-50',
      ring: 'ring-blue-500',
      highlight: 'bg-blue-100 text-blue-700',
    },
    green: {
      selected: 'bg-green-100 text-green-700 border-green-300',
      hover: 'hover:bg-green-50',
      ring: 'ring-green-500',
      highlight: 'bg-green-100 text-green-700',
    },
    orange: {
      selected: 'bg-orange-100 text-orange-700 border-orange-300',
      hover: 'hover:bg-orange-50',
      ring: 'ring-orange-500',
      highlight: 'bg-orange-100 text-orange-700',
    },
    teal: {
      selected: 'bg-teal-100 text-teal-700 border-teal-300',
      hover: 'hover:bg-teal-50',
      ring: 'ring-teal-500',
      highlight: 'bg-teal-100 text-teal-700',
    },
    gray: {
      selected: 'bg-gray-100 text-gray-700 border-gray-300',
      hover: 'hover:bg-gray-50',
      ring: 'ring-gray-500',
      highlight: 'bg-gray-100 text-gray-700',
    },
  };

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-2.5 text-sm',
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        if (dropdownRef.current && dropdownRef.current.contains(target)) {
          return;
        }
        setIsOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        setIsOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          onChange(filteredOptions[highlightedIndex].value);
          setIsOpen(false);
        }
        break;
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={`w-full ${sizeClasses[size]} border rounded-xl shadow-sm font-medium text-left cursor-pointer transition-all flex items-center justify-between gap-2 ${
          selectedOption
            ? colorClasses[color].selected
            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
        } ${isOpen ? `ring-2 ${colorClasses[color].ring} border-transparent` : ''}`}
        title={selectedOption?.label || placeholder}
      >
        <span className={`truncate min-w-0 flex-1 ${selectedOption ? '' : 'text-gray-400'}`}>
          {selectedOption?.label || placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            minWidth: Math.max(dropdownPosition.width, 280),
            width: 'auto',
            maxWidth: '90vw',
          }}
          className="z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg flex flex-col"
        >
          {searchable && (
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={searchPlaceholder}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                />
              </div>
            </div>
          )}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="max-h-60 overflow-auto"
          >
            <ul ref={listRef} className="py-1">
              {filteredOptions.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-400 italic whitespace-nowrap">
                  {searchQuery ? 'No matches found' : 'No options available'}
                </li>
              ) : (
                filteredOptions.map((option, index) => (
                  <li
                    key={option.value}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`${sizeClasses[size]} cursor-pointer transition-colors whitespace-nowrap ${
                      option.value === value
                        ? colorClasses[color].highlight
                        : highlightedIndex === index
                        ? 'bg-gray-100'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{option.label}</span>
                      {option.value === value && (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </li>
                ))
              )}
              {loadingMore && (
                <li className="px-3 py-2 text-center">
                  <svg className="animate-spin h-4 w-4 text-gray-400 mx-auto" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </li>
              )}
              {hasMore && !loadingMore && !searchQuery && (
                <li className="px-3 py-1.5 text-center text-[10px] text-gray-400">
                  Scroll for more
                </li>
              )}
            </ul>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Inline select for type:id inputs
export function InlineSelect({
  value,
  onChange,
  options,
  placeholder = 'type',
  color = 'blue',
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  color?: 'purple' | 'blue' | 'green' | 'orange' | 'teal';
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const colorClasses = {
    purple: { bg: 'bg-purple-100 text-purple-700', hover: 'hover:bg-purple-50' },
    blue: { bg: 'bg-blue-100 text-blue-700', hover: 'hover:bg-blue-50' },
    green: { bg: 'bg-green-100 text-green-700', hover: 'hover:bg-green-50' },
    orange: { bg: 'bg-orange-100 text-orange-700', hover: 'hover:bg-orange-50' },
    teal: { bg: 'bg-teal-100 text-teal-700', hover: 'hover:bg-teal-50' },
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Check if click is outside both the container and the dropdown list
      const isOutsideContainer = containerRef.current && !containerRef.current.contains(target);
      const isOutsideList = !listRef.current || !listRef.current.contains(target);
      
      if (isOutsideContainer && isOutsideList) {
        setIsOpen(false);
      }
    };
    // Use click instead of mousedown to allow option selection
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  // Update dropdown position when opened
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
      });
    }
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-full px-3 py-2.5 text-sm font-medium cursor-pointer flex items-center gap-1 transition-colors ${
          value ? colorClasses[color].bg : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
        }`}
      >
        <span>{value || placeholder}</span>
        <svg className={`w-3 h-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && createPortal(
        <ul 
          ref={listRef}
          style={{
            position: 'absolute',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
          }}
          className="z-[9999] min-w-[140px] bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-auto py-1"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-xs text-gray-400 italic">No types available</li>
          ) : (
            options.map((opt) => (
              <li
                key={opt}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(opt);
                  setIsOpen(false);
                }}
                className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                  opt === value ? colorClasses[color].bg : colorClasses[color].hover
                }`}
              >
                {opt}
              </li>
            ))
          )}
        </ul>,
        document.body
      )}
    </div>
  );
}
