import { useState, useEffect, useCallback } from 'react';
import { contentSlotsApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import type { ContentSlot, PublishedSlots } from '@/types/contentSlot';

/** 前台：获取已发布的内容插槽 */
export function usePublishedSlots(pageKey = 'home') {
  const [slots, setSlots] = useState<PublishedSlots>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await contentSlotsApi.getPublished(pageKey);
        const list = unwrapResponse<ContentSlot[]>(res);
        if (cancelled) return;
        const map: PublishedSlots = {};
        list.forEach(s => { map[s.slotKey] = s; });
        setSlots(map);
      } catch {
        if (!cancelled) setSlots({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pageKey]);

  return { slots, loading };
}

/** 预览：获取草稿插槽（含已发布，用于 iframe 预览路由） */
export function useDraftSlots(pageKey = 'home') {
  const [slots, setSlots] = useState<PublishedSlots>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await contentSlotsApi.getAdminAll(pageKey);
      const list = unwrapResponse<ContentSlot[]>(res);
      const map: PublishedSlots = {};
      list.forEach(s => { map[s.slotKey] = s; });
      setSlots(map);
    } catch {
      setSlots({});
    } finally {
      setLoading(false);
    }
  }, [pageKey]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { slots, loading, refresh };
}

/** 后台：获取全部插槽列表（含草稿，数组格式） */
export function useAdminSlots(pageKey = 'home') {
  const [slots, setSlots] = useState<ContentSlot[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await contentSlotsApi.getAdminAll(pageKey);
      setSlots(unwrapResponse<ContentSlot[]>(res));
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [pageKey]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { slots, loading, refresh };
}
