import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'hc_search_history';
const MAX_ITEMS = 10;

export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

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
