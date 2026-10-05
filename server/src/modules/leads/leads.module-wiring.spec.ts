import assert from "node:assert/strict";
import test from "node:test";
import {
  MODULE_METADATA,
  OPTIONAL_DEPS_METADATA,
} from "@nestjs/common/constants";
import { ReliableNotificationsModule } from "../../common/notifications/reliable-notifications.module";
import { LeadsModule } from "./leads.module";
import { LeadsService } from "./leads.service";

test("线索模块显式要求可靠通知依赖", () => {
  const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, LeadsModule) ?? [];
  assert.ok(imports.includes(ReliableNotificationsModule));
  assert.deepEqual(
    Reflect.getMetadata(OPTIONAL_DEPS_METADATA, LeadsService) ?? [],
    [],
  );
});
