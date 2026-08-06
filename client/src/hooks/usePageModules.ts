import { useState, useEffect, useCallback } from 'react';
import { pageModulesApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import type { PageModule } from '@/types/pageModule';

/** 前台：已发布模块 */
export function usePublishedModules(pageKey = 'home') {
  const [modules, setModules] = useState<PageModule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await pageModulesApi.getPublished(pageKey);
        if (cancelled) return;
        setModules(unwrapResponse<PageModule[]>(res));
      } catch {
        if (!cancelled) setModules([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pageKey]);

  return { modules, loading };
}

/** 后台：全部模块（含草稿） */
export function useAdminModules(pageKey = 'home') {
  const [modules, setModules] = useState<PageModule[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await pageModulesApi.getAdminAll(pageKey);
      setModules(unwrapResponse<PageModule[]>(res));
    } catch {
      setModules([]);
    } finally {
      setLoading(false);
    }
  }, [pageKey]);

  useEffect(() => { refresh(); }, [refresh]);

  return { modules, loading, refresh };
}
