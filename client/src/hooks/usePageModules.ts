import { useState, useEffect, useCallback, useRef } from 'react';
import { pageModulesApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import { usePageBuilderStore } from '@/store/pageBuilderStore';
import type { PageModule } from '@/types/pageModule';

/** 前台：已发布模块 */
export function usePublishedModules(pageKey = 'home') {
  const [modules, setModules] = useState<PageModule[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await pageModulesApi.getPublished(pageKey);
      if (mountedRef.current) setModules(unwrapResponse<PageModule[]>(res));
    } catch {
      if (mountedRef.current) setModules([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [pageKey]);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  return { modules, loading, refresh };
}

/** 后台：全部模块（含草稿） */
export function useAdminModules(pageKey = 'home') {
  const [modules, setModules] = useState<PageModule[]>([]);
  const [loading, setLoading] = useState(true);
  const storeSetModules = usePageBuilderStore(s => s.setModules);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await pageModulesApi.getAdminAll(pageKey);
      const data = unwrapResponse<PageModule[]>(res);
      setModules(data);
      storeSetModules(data);
    } catch {
      setModules([]);
    } finally {
      setLoading(false);
    }
  }, [pageKey, storeSetModules]);

  useEffect(() => { refresh(); }, [refresh]);

  return { modules, loading, refresh };
}
