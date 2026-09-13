import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const { validateTarget } = require("../../../scripts/run-real-mysql-tests.cjs");
const databaseUrl = process.env.REAL_MYSQL_TEST_DATABASE_URL;

type TriggerRow = {
  TRIGGER_NAME: string;
  EVENT_MANIPULATION: string;
  ACTION_TIMING: string;
  EVENT_OBJECT_TABLE: string;
  ACTION_STATEMENT: string;
};

const immutableTriggers = [{
  name: "media_auth_events_immutable_update",
  operation: "UPDATE",
  table: "media_asset_authorization_events",
  message: "media authorization events are immutable",
}, {
  name: "media_auth_events_immutable_delete",
  operation: "DELETE",
  table: "media_asset_authorization_events",
  message: "media authorization events are immutable",
}, {
  name: "dtv_media_assets_immutable_update",
  operation: "UPDATE",
  table: "dynamic_template_version_media_assets",
  message: "template publication media manifests are immutable",
}, {
  name: "dtv_media_assets_immutable_delete",
  operation: "DELETE",
  table: "dynamic_template_version_media_assets",
  message: "template publication media manifests are immutable",
}, {
  name: "pdr_media_assets_immutable_update",
  operation: "UPDATE",
  table: "page_document_revision_media_assets",
  message: "page publication media manifests are immutable",
}, {
  name: "pdr_media_assets_immutable_delete",
  operation: "DELETE",
  table: "page_document_revision_media_assets",
  message: "page publication media manifests are immutable",
}] as const;

const assertImmutableRejection = async (
  action: () => Promise<unknown>,
  message: string,
) => {
  await assert.rejects(action, (error: unknown) => {
    const rendered = error instanceof Error ? error.message : String(error);
    assert.match(rendered, new RegExp(message));
    return true;
  });
};

test(
  "真实 MySQL：D29 允许发布事实 INSERT，并由数据库拒绝 UPDATE 与 DELETE",
  { skip: databaseUrl ? false : "需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL" },
  async () => {
    assert.equal(databaseUrl, validateTarget(process.env), "媒体不可变测试必须使用显式隔离库");
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    const marker = randomUUID().replaceAll("-", "").slice(0, 16);
    await prisma.$connect();
    try {
      const triggerRows = await prisma.$queryRaw<TriggerRow[]>`
        SELECT TRIGGER_NAME, EVENT_MANIPULATION, ACTION_TIMING,
               EVENT_OBJECT_TABLE, ACTION_STATEMENT
        FROM information_schema.TRIGGERS
        WHERE TRIGGER_SCHEMA = DATABASE()
          AND TRIGGER_NAME IN (
            'media_auth_events_immutable_update',
            'media_auth_events_immutable_delete',
            'dtv_media_assets_immutable_update',
            'dtv_media_assets_immutable_delete',
            'pdr_media_assets_immutable_update',
            'pdr_media_assets_immutable_delete'
          )
      `;
      assert.equal(triggerRows.length, immutableTriggers.length);
      for (const expected of immutableTriggers) {
        const actual = triggerRows.find((row) => row.TRIGGER_NAME === expected.name);
        assert.ok(actual, `缺少真实 MySQL 触发器 ${expected.name}`);
        assert.equal(actual.ACTION_TIMING, "BEFORE");
        assert.equal(actual.EVENT_MANIPULATION, expected.operation);
        assert.equal(actual.EVENT_OBJECT_TABLE, expected.table);
        assert.match(actual.ACTION_STATEMENT, /SIGNAL SQLSTATE(?: VALUE)? '45000'/);
        assert.match(actual.ACTION_STATEMENT, new RegExp(expected.message));
      }

      const asset = await prisma.mediaAsset.create({
        data: {
          storageKey: `page-assets/immutability-${marker}.png`,
          mimeType: "image/png",
          byteSize: 1,
          checksumSha256: marker.padEnd(64, "a"),
        },
      });
      const submitter = await prisma.user.create({
        data: {
          username: `media-submitter-${marker}`,
          password: "not-used-by-isolated-test",
          realName: "素材提交人",
          role: "EDITOR",
        },
      });
      const reviewer = await prisma.user.create({
        data: {
          username: `media-reviewer-${marker}`,
          password: "not-used-by-isolated-test",
          realName: "素材审核人",
          role: "ADMIN",
        },
      });
      const approvedAuthorization = {
        assetId: asset.id,
        sourceType: "BRAND_OWNED" as const,
        authorizationBasis: "隔离测试中的品牌自有素材",
        evidenceReference: `isolated-test://${marker}`,
        publicWebUseAllowed: true,
        reviewStatus: "APPROVED" as const,
        submittedAt: new Date(),
        reviewedAt: new Date(),
      };
      await assertImmutableRejection(
        () => prisma.mediaAssetAuthorization.create({
          data: {
            ...approvedAuthorization,
            reviewedById: reviewer.id,
          },
        }),
        "media_asset_authorizations_review_check",
      );
      await assertImmutableRejection(
        () => prisma.mediaAssetAuthorization.create({
          data: {
            ...approvedAuthorization,
            submittedById: reviewer.id,
            reviewedById: reviewer.id,
          },
        }),
        "media_asset_authorizations_review_check",
      );
      await prisma.mediaAssetAuthorization.create({
        data: {
          ...approvedAuthorization,
          submittedById: submitter.id,
          reviewedById: reviewer.id,
        },
      });
      const event = await prisma.mediaAssetAuthorizationEvent.create({
        data: {
          assetId: asset.id,
          authorizationRevision: 1,
          publicUseEpoch: 0,
          eventType: "CREATED",
          snapshot: { schemaVersion: 1, marker },
          eventHash: marker.padEnd(64, "b"),
        },
      });

      const template = await prisma.dynamicTemplate.create({
        data: {
          templateId: `immutability-${marker}`,
          name: `不可变清单 ${marker}`,
          category: "TEST",
          purpose: "D29_DATABASE_INVARIANT",
          layoutType: "TEST",
          slotSummary: "test",
          recommendedFor: [],
          tags: [],
          definitionSchemaVersion: 3,
        },
      });
      const templateVersion = await prisma.dynamicTemplateVersion.create({
        data: {
          dynamicTemplateId: template.id,
          version: 1,
          schemaVersion: 3,
          definition: { schemaVersion: 3, marker },
          definitionChecksum: marker.padEnd(64, "c"),
        },
      });
      const templateManifest = await prisma.dynamicTemplateVersionMediaAsset.create({
        data: {
          dynamicTemplateVersionId: templateVersion.id,
          assetId: asset.id,
          referenceKey: marker.padEnd(64, "d"),
          referencePath: "nodes.hero.image",
          origin: "TEMPLATE_BACKGROUND",
          assetLifecycleRevision: 1,
          authorizationRevision: 1,
          publicUseEpoch: 0,
        },
      });

      const pageDocument = await prisma.pageDocument.create({
        data: {
          pageKey: `immutability-${marker}`,
          puckData: { content: [], root: {}, zones: {} },
        },
      });
      const pageRevision = await prisma.pageDocumentRevision.create({
        data: {
          documentId: pageDocument.id,
          version: 1,
          puckData: { content: [], root: {}, zones: {} },
        },
      });
      const pageManifest = await prisma.pageDocumentRevisionMediaAsset.create({
        data: {
          pageDocumentRevisionId: pageRevision.id,
          dynamicTemplateVersionId: templateVersion.id,
          assetId: asset.id,
          referenceKey: marker.padEnd(64, "e"),
          referencePath: "content[0].props.image",
          origin: "PAGE_INSTANCE",
          assetLifecycleRevision: 1,
          authorizationRevision: 1,
          publicUseEpoch: 0,
        },
      });

      await assertImmutableRejection(
        () => prisma.$executeRawUnsafe(
          `UPDATE media_asset_authorization_events SET public_use_epoch = 1 WHERE id = ${event.id}`,
        ),
        "media authorization events are immutable",
      );
      await assertImmutableRejection(
        () => prisma.$executeRawUnsafe(
          `DELETE FROM media_asset_authorization_events WHERE id = ${event.id}`,
        ),
        "media authorization events are immutable",
      );
      await assertImmutableRejection(
        () => prisma.$executeRawUnsafe(
          `UPDATE dynamic_template_version_media_assets SET public_use_epoch = 1 WHERE id = ${templateManifest.id}`,
        ),
        "template publication media manifests are immutable",
      );
      await assertImmutableRejection(
        () => prisma.$executeRawUnsafe(
          `DELETE FROM dynamic_template_version_media_assets WHERE id = ${templateManifest.id}`,
        ),
        "template publication media manifests are immutable",
      );
      await assertImmutableRejection(
        () => prisma.$executeRawUnsafe(
          `UPDATE page_document_revision_media_assets SET public_use_epoch = 1 WHERE id = ${pageManifest.id}`,
        ),
        "page publication media manifests are immutable",
      );
      await assertImmutableRejection(
        () => prisma.$executeRawUnsafe(
          `DELETE FROM page_document_revision_media_assets WHERE id = ${pageManifest.id}`,
        ),
        "page publication media manifests are immutable",
      );

      assert.equal(
        await prisma.mediaAssetAuthorizationEvent.count({ where: { id: event.id } }),
        1,
      );
      assert.equal(
        await prisma.dynamicTemplateVersionMediaAsset.count({ where: { id: templateManifest.id } }),
        1,
      );
      assert.equal(
        await prisma.pageDocumentRevisionMediaAsset.count({ where: { id: pageManifest.id } }),
        1,
      );
    } finally {
      await prisma.$disconnect();
    }
  },
);
