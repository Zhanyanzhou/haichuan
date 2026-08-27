import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'hc_search_history';
const MAX_ITEMS = 10;

function readSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>(readSearchHistory);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  const addToHistory = useCallback((term: string) => {
    const clean = term.trim();
    if (!clean) return;
    setHistory(prev => {
      const filtered = prev.filter(t => t !== clean);
      return [clean, ...filtered].slice(0, MAX_ITEMS);
    });
  }, []);

  const removeOne = useCallback((term: string) => {
    setHistory(prev => prev.filter(t => t !== term));
  }, []);

  const clearAll = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { history, addToHistory, removeOne, clearAll };
}
