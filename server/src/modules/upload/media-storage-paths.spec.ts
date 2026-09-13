import assert from 'node:assert/strict';
import test from 'node:test';
import { join, resolve } from 'node:path';
import { mediaRootsOverlap, resolveMediaStorageRoots } from './media-storage-paths';

test('媒体根路径重叠判断只接受真正的父子或相同目录', () => {
  const base = resolve('synthetic-media-roots');
  assert.equal(mediaRootsOverlap(join(base, 'public'), join(base, 'public', 'private')), true);
  assert.equal(mediaRootsOverlap(join(base, 'public', 'private'), join(base, 'public')), true);
  assert.equal(mediaRootsOverlap(join(base, 'public'), join(base, 'public')), true);
  assert.equal(mediaRootsOverlap(join(base, 'public'), join(base, 'public-sibling')), false);
  assert.equal(mediaRootsOverlap(join(base, 'uploads'), join(base, 'private-media')), false);
});

test('公开根与付款凭证等私有根重叠时在启动解析阶段失败关闭', () => {
  const previous = {
    publicRoot: process.env.PUBLIC_MEDIA_ROOT,
    archiveRoot: process.env.PAGE_MEDIA_ARCHIVE_ROOT,
    paymentRoot: process.env.PAYMENT_PROOF_MEDIA_ROOT,
    productRoot: process.env.PRODUCT_MEDIA_ROOT,
  };
  const base = resolve('synthetic-overlap-roots');
  try {
    process.env.PUBLIC_MEDIA_ROOT = base;
    process.env.PAGE_MEDIA_ARCHIVE_ROOT = join(base, 'archive');
    process.env.PAYMENT_PROOF_MEDIA_ROOT = resolve('synthetic-private-payment');
    process.env.PRODUCT_MEDIA_ROOT = resolve('synthetic-private-products');
    assert.throws(resolveMediaStorageRoots, /PUBLIC_MEDIA_ROOT 不能与页面素材归档目录重叠/);
  } finally {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('PUBLIC_MEDIA_ROOT', previous.publicRoot);
    restore('PAGE_MEDIA_ARCHIVE_ROOT', previous.archiveRoot);
    restore('PAYMENT_PROOF_MEDIA_ROOT', previous.paymentRoot);
    restore('PRODUCT_MEDIA_ROOT', previous.productRoot);
  }
});
