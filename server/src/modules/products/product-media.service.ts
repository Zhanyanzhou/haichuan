import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { join, relative, resolve, sep } from 'path';

interface CacheEntry {
  available: boolean;
  expiresAt: number;
}

@Injectable()
export class ProductMediaService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs = 10_000;
  private readonly productImageRoot = resolve(
    process.env.PRODUCT_MEDIA_ROOT || join(process.cwd(), '..', 'client', 'public', 'images', 'products'),
  );
  private readonly uploadsRoot = resolve(process.cwd(), 'uploads');

  isAvailable(url?: string | null): boolean {
    if (!url) return false;
    if (/^(https?:|data:image\/)/i.test(url)) return true;

    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.available;

    const filePath = this.resolveLocalPath(url);
    const available = filePath ? existsSync(filePath) : false;
    this.cache.set(url, { available, expiresAt: Date.now() + this.cacheTtlMs });
    return available;
  }

  invalidate(): void {
    this.cache.clear();
  }

  private resolveLocalPath(url: string): string | null {
    if (url.startsWith('/images/products/')) {
      return this.resolveWithin(this.productImageRoot, url.slice('/images/products/'.length));
    }

    if (url.startsWith('/uploads/')) {
      return this.resolveWithin(this.uploadsRoot, url.slice('/uploads/'.length));
    }

    return null;
  }

  private resolveWithin(root: string, requestedPath: string): string | null {
    const target = resolve(root, requestedPath);
    const relativePath = relative(root, target);
    if (relativePath.startsWith('..') || relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
      return null;
    }
    return target;
  }
}
