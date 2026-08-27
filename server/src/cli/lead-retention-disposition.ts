import { OutboxService } from "../common/outbox/outbox.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { LeadsService } from "../modules/leads/leads.service";

export const LEAD_RETENTION_CONFIRMATION = "ANONYMIZE_DUE_LEADS";

export type LeadRetentionDispositionArguments = {
  execute: boolean;
  limit: number;
  confirmation: string | null;
};

type LeadRetentionDispositionPort = Pick<
  LeadsService,
  "previewRetentionDisposition" | "dispositionDueLeads"
>;

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export function parseLeadRetentionDispositionArgs(
  argv: string[],
): LeadRetentionDispositionArguments {
  let execute = false;
  let limit = 50;
  let confirmation: string | null = null;
  for (const argument of argv) {
    if (argument === "--execute") {
      execute = true;
      continue;
    }
    if (argument.startsWith("--limit=")) {
      const parsed = Number(argument.slice("--limit=".length));
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
        throw new Error("LEAD_RETENTION_LIMIT_INVALID");
      }
      limit = parsed;
      continue;
    }
    if (argument.startsWith("--confirm=")) {
      confirmation = argument.slice("--confirm=".length);
      continue;
    }
    throw new Error("LEAD_RETENTION_ARGUMENT_UNKNOWN");
  }
  return { execute, limit, confirmation };
}

export async function runLeadRetentionDisposition(
  service: LeadRetentionDispositionPort,
  argv: string[],
  environment: NodeJS.ProcessEnv,
) {
  const args = parseLeadRetentionDispositionArgs(argv);
  if (!args.execute) {
    return service.previewRetentionDisposition({ limit: args.limit });
  }
  if (!enabled(environment.LEAD_RETENTION_DISPOSITION_ENABLED)) {
    throw new Error("LEAD_RETENTION_DISPOSITION_DISABLED");
  }
  if (args.confirmation !== LEAD_RETENTION_CONFIRMATION) {
    throw new Error("LEAD_RETENTION_CONFIRMATION_REQUIRED");
  }
  const actorId = Number(environment.LEAD_RETENTION_DISPOSITION_ACTOR_ID);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new Error("LEAD_RETENTION_ACTOR_REQUIRED");
  }
  return service.dispositionDueLeads({ limit: args.limit, actorId });
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const service = new LeadsService(prisma, new OutboxService());
    const result = await runLeadRetentionDisposition(
      service,
      process.argv.slice(2),
      {
        LEAD_RETENTION_DISPOSITION_ENABLED:
          process.env.LEAD_RETENTION_DISPOSITION_ENABLED,
        LEAD_RETENTION_DISPOSITION_ACTOR_ID:
          process.env.LEAD_RETENTION_DISPOSITION_ACTOR_ID,
      },
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "LEAD_RETENTION_DISPOSITION_FAILED";
    console.error(JSON.stringify({ ok: false, code }));
    process.exitCode = 1;
  });
}
