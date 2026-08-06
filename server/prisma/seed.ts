import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始初始化数据...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: adminPassword,
      realName: '超级管理员',
      phone: '13800000000',
      email: 'admin@jewelryhub.com',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });
  console.log('✅ 管理员账号: admin / admin123');

  // Create default categories
  const mainCategories = [
    {
      name: '手镯',
      slug: 'bracelet',
      level: 1,
      sortOrder: 1,
      children: [
        { name: '卡家手镯', slug: 'cartier-style', level: 2, sortOrder: 1 },
        { name: '传承手镯', slug: 'heritage', level: 2, sortOrder: 2 },
        { name: '抽拉手镯', slug: 'adjustable', level: 2, sortOrder: 3 },
        { name: '开口手镯', slug: 'open-bangle', level: 2, sortOrder: 4 },
        { name: '闭口手镯', slug: 'closed-bangle', level: 2, sortOrder: 5 },
        { name: '镂空手镯', slug: 'hollow-bangle', level: 2, sortOrder: 6 },
      ],
    },
    {
      name: '吊坠',
      slug: 'pendant',
      level: 1,
      sortOrder: 2,
      children: [
        {
          name: '平安扣',
          slug: 'pingan-kou',
          level: 2,
          sortOrder: 1,
          children: [
            { name: '素面平安扣', slug: 'plain-pingan', level: 3, sortOrder: 1 },
            { name: '雕花平安扣', slug: 'carved-pingan', level: 3, sortOrder: 2 },
            { name: '镶钻平安扣', slug: 'diamond-pingan', level: 3, sortOrder: 3 },
          ],
        },
        {
          name: '葫芦',
          slug: 'gourd',
          level: 2,
          sortOrder: 2,
          children: [
            { name: '素面葫芦', slug: 'plain-gourd', level: 3, sortOrder: 1 },
            { name: '镂空葫芦', slug: 'hollow-gourd', level: 3, sortOrder: 2 },
          ],
        },
        { name: '锁包', slug: 'lock-pendant', level: 2, sortOrder: 3 },
        { name: '佛公', slug: 'buddha', level: 2, sortOrder: 4 },
        { name: '叶子', slug: 'leaf', level: 2, sortOrder: 5 },
        { name: '如意', slug: 'ruyi', level: 2, sortOrder: 6 },
        { name: '生肖', slug: 'zodiac', level: 2, sortOrder: 7 },
        { name: '福牌', slug: 'fu-plaque', level: 2, sortOrder: 8 },
      ],
    },
    {
      name: '戒指',
      slug: 'ring',
      level: 1,
      sortOrder: 3,
      children: [
        { name: '花戒', slug: 'flower-ring', level: 2, sortOrder: 1 },
        { name: '光圈戒', slug: 'plain-band', level: 2, sortOrder: 2 },
        { name: '镶钻戒', slug: 'diamond-ring', level: 2, sortOrder: 3 },
        { name: '情侣对戒', slug: 'couple-ring', level: 2, sortOrder: 4 },
        { name: '男戒', slug: 'mens-ring', level: 2, sortOrder: 5 },
      ],
    },
    {
      name: '耳饰',
      slug: 'earring',
      level: 1,
      sortOrder: 4,
      children: [
        { name: '耳钉', slug: 'stud', level: 2, sortOrder: 1 },
        { name: '耳环', slug: 'hoop', level: 2, sortOrder: 2 },
        { name: '耳坠', slug: 'dangle', level: 2, sortOrder: 3 },
        { name: '耳线', slug: 'threader', level: 2, sortOrder: 4 },
      ],
    },
  ];

  for (const cat of mainCategories) {
    const { children, ...catData } = cat;
    const created = await prisma.category.upsert({
      where: { slug: catData.slug },
      update: catData,
      create: catData,
    });

    if (children && children.length > 0) {
      for (const child of children) {
        const { children: grandchildren, ...childData } = child as any;
        const createdChild = await prisma.category.upsert({
          where: { slug: childData.slug },
          update: { ...childData, parentId: created.id },
          create: { ...childData, parentId: created.id },
        });

        if (grandchildren && grandchildren.length > 0) {
          for (const gc of grandchildren) {
            await prisma.category.upsert({
              where: { slug: gc.slug },
              update: { ...gc, parentId: createdChild.id },
              create: { ...gc, parentId: createdChild.id },
            });
          }
        }
      }
    }
  }
  console.log('✅ 分类数据初始化完成');

  // Create default warehouses
  const warehouses = [
    { name: '深圳展厅', type: 'SHOWROOM' as const, address: '深圳市罗湖区水贝珠宝园' },
    { name: '广州工厂', type: 'FACTORY' as const, address: '广州市番禺区珠宝产业园' },
    { name: '北京门店', type: 'STORE' as const, address: '北京市朝阳区国贸商城' },
  ];

  for (const wh of warehouses) {
    await prisma.warehouse.upsert({
      where: { name: wh.name },
      update: wh,
      create: wh,
    });
  }
  console.log('✅ 仓库数据初始化完成');

  // Lookup category IDs by slug
  const pinganKou = await prisma.category.findUnique({ where: { slug: 'pingan-kou' } });
  const diamondRing = await prisma.category.findUnique({ where: { slug: 'diamond-ring' } });
  const heritage = await prisma.category.findUnique({ where: { slug: 'heritage' } });
  const dangle = await prisma.category.findUnique({ where: { slug: 'dangle' } });
  const gourd = await prisma.category.findUnique({ where: { slug: 'gourd' } });

  // Create sample products
  const sampleProducts = [
    {
      code: 'HC-ZD-001', name: '星云系列 · 足金平安扣吊坠',
      description: '精选足金999材质，匠心雕刻星云纹理，平安扣造型圆润饱满，寓意平安吉祥。',
      categoryId: pinganKou!.id,
      materialType: 'GOLD_999', goldWeight: 8.88, craftFee: 380, price: 5280,
      weight: 9.20, size: '直径2.5cm',
      status: 'APPROVED', isHot: true, isNew: false, isRecommended: true, isLimited: false, isCustom: false,
      viewCount: 3280, salesCount: 156,
    },
    {
      code: 'HC-JZ-001', name: '银河之眼 · 18K金镶钻戒指',
      description: '18K金戒托，镶嵌0.5克拉高品质钻石，经典六爪镶嵌工艺，璀璨夺目。',
      categoryId: diamondRing!.id,
      materialType: 'DIAMOND', goldWeight: 5.20, craftFee: 580, price: 8999,
      weight: 5.80, size: '圈号14',
      status: 'APPROVED', isHot: true, isNew: true, isRecommended: false, isLimited: false, isCustom: false,
      viewCount: 4560, salesCount: 89,
    },
    {
      code: 'HC-SZ-001', name: '流光溢彩 · 古法金花丝手镯',
      description: '传承古法金工艺，纯手工花丝编织，呈现流光溢彩的视觉效果。',
      categoryId: heritage!.id,
      materialType: 'GOLD_9999', goldWeight: 28.50, craftFee: 1200, price: 16800,
      weight: 30.20, size: '内径5.8cm',
      status: 'APPROVED', isHot: false, isNew: false, isRecommended: true, isLimited: true, isCustom: false,
      viewCount: 2100, salesCount: 32,
    },
    {
      code: 'HC-ES-001', name: '星辰之泪 · 铂金钻石耳坠',
      description: 'Pt950铂金镶嵌钻石耳坠，流线型设计，佩戴摇曳生姿。',
      categoryId: dangle!.id,
      materialType: 'PT950', goldWeight: 3.60, craftFee: 680, price: 12600,
      weight: 4.10, size: '长度4.5cm',
      status: 'APPROVED', isHot: true, isNew: false, isRecommended: false, isLimited: false, isCustom: true,
      viewCount: 1890, salesCount: 45,
    },
    {
      code: 'HC-ZD-002', name: '浩瀚宇宙 · 3D硬金葫芦吊坠',
      description: '3D硬金工艺打造立体葫芦造型，寓意福禄双全。',
      categoryId: gourd!.id,
      materialType: 'GOLD_999', goldWeight: 6.20, craftFee: 280, price: 3980,
      weight: 6.50, size: '2.0cm×1.2cm',
      status: 'APPROVED', isHot: false, isNew: true, isRecommended: true, isLimited: false, isCustom: false,
      viewCount: 1560, salesCount: 78,
    },
  ];

  for (const p of sampleProducts) {
    await prisma.product.upsert({
      where: { code: p.code },
      update: p,
      create: p,
    });
  }
  console.log('✅ 产品种子数据初始化完成（5条）');

  console.log('🎉 初始化完成!');
}

main()
  .catch((e) => {
    console.error('❌ 初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
