import { DialogFrame } from '../ui/DialogFrame';
import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, Package, Truck, Building2, Tags, X, Loader2 } from 'lucide-react';
import { catalogApi } from '../../api/catalogApi';
import { searchKeys } from '../../lib/queryKeys';
import { cn } from '../../lib/cn';

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

type ResultType = 'item' | 'supplier' | 'broker' | 'category';

interface FlatResult {
  id: string;
  type: ResultType;
  primary: string;
  secondary: string;
  path: string;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ open, onClose }) => {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debouncedQuery = useDebounce(query, 300);

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: searchKeys.global(debouncedQuery),
    queryFn: () => catalogApi.search(debouncedQuery),
    enabled: open && debouncedQuery.trim().length >= 2,
    staleTime: 30_000,
  });

  // Flatten results
  const results: FlatResult[] = [];
  if (data) {
    data.items.forEach((i) =>
      results.push({ id: i.id, type: 'item', primary: i.name, secondary: i.itemCode, path: `/catalog/items/${i.id}` })
    );
    data.suppliers.forEach((s) =>
      results.push({ id: s.id, type: 'supplier', primary: s.name, secondary: s.phone ?? 'Supplier', path: `/suppliers/${s.id}` })
    );
    data.brokers.forEach((b) =>
      results.push({ id: b.id, type: 'broker', primary: b.name, secondary: 'Broker', path: `/brokers/${b.id}` })
    );
    data.categories.forEach((c) =>
      results.push({ id: c.id, type: 'category', primary: c.name, secondary: 'Category', path: `/catalog/categories` })
    );
  }

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const navigate_to = (path: string) => {
    navigate(path);
    onClose();
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.max(0, Math.min(c + 1, results.length - 1))); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === 'Enter' && results[cursor]) { e.preventDefault(); navigate_to(results[cursor].path); }
  };

  const iconFor = (type: ResultType) => {
    if (type === 'item') return <Package className="h-4 w-4 text-[#159A8A]" />;
    if (type === 'supplier') return <Truck className="h-4 w-4 text-blue-500" />;
    if (type === 'broker') return <Building2 className="h-4 w-4 text-purple-500" />;
    return <Tags className="h-4 w-4 text-orange-500" />;
  };

  if (!open) return null;

  return (
    <DialogFrame open={open} title="Global search" onClose={onClose} className="max-w-xl">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E2E8E6]">
          {isFetching ? (
            <Loader2 className="h-4 w-4 text-[#159A8A] animate-spin shrink-0" />
          ) : (
            <Search className="h-4 w-4 text-gray-400 shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search items, suppliers, brokers, categories…"
            className="min-w-0 flex-1 text-sm text-[#0F172A] placeholder-gray-400 outline-none bg-transparent"
            role="combobox" aria-label="Search records" aria-expanded={results.length > 0} aria-activedescendant={results[cursor] ? `search-option-${cursor}` : undefined}
            aria-autocomplete="list"
            aria-controls="search-results"
          />
          <button type="button" className="ui-icon-button" aria-label="Close search" onClick={onClose}><X className="h-5 w-5" /></button>
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search">
              <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>

        {/* Results */}
        <ul id="search-results" role="listbox" className="max-h-80 overflow-y-auto">
          {debouncedQuery.trim().length < 2 ? (
            <li className="py-10 text-center text-sm text-gray-400">
              Type at least 2 characters to search
            </li>
          ) : isError ? (<li role="alert" className="p-4">Search could not be loaded. <button className="underline py-2" onClick={() => void refetch()}>Retry search</button></li>) : results.length === 0 && !isFetching ? (
            <li className="py-10 text-center text-sm text-gray-400">
              No matching records for "{debouncedQuery}"
            </li>
          ) : (
            results.map((r, i) => (
              <li
                key={`${r.type}-${r.id}`}
                id={`search-option-${i}`} role="option"
                aria-selected={i === cursor}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
                  i === cursor ? 'bg-[#F0FAF8]' : 'hover:bg-gray-50'
                )}
                onClick={() => navigate_to(r.path)}
                onMouseEnter={() => setCursor(i)}
              >
                {iconFor(r.type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0F172A] truncate">{r.primary}</p>
                  <p className="text-xs text-gray-400 truncate">{r.secondary}</p>
                </div>
                <span className="text-xs text-gray-300 capitalize">{r.type}</span>
              </li>
            ))
          )}
        </ul>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-[#E2E8E6] flex gap-4 text-xs text-gray-400">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </DialogFrame>
  );
};
