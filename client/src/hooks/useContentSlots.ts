import { useState, useEffect } from 'react';
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
