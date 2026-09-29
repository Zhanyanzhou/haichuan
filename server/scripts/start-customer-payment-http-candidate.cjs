const path = require('node:path');

process.env.TS_NODE_PROJECT = path.resolve(__dirname, '../tsconfig.json');
require('../node_modules/ts-node/register/transpile-only');

const { JwtService } = require('@nestjs/jwt');
const {
  createPaymentSimulatorServer,
} = require('../src/common/payment-gateway/payment-simulator.server');
const {
  SIMULATOR_SECRET,
  startHttpCandidate,
} = require('../src/modules/payments/customer-payment-simulator.http-fixture');

let candidate;
let simulator;
let closing = false;

async function close() {
  if (closing) return;
  closing = true;
  if (candidate) await candidate.app.close();
  if (simulator) await simulator.close();
}

async function main() {
  process.env.RELEASE_PROFILE = 'commerce';
  process.env.CUSTOMER_COMMERCE_ENABLED = 'true';
  simulator = createPaymentSimulatorServer({ signingSecret: SIMULATOR_SECRET });
  const simulatorBaseUrl = await simulator.listen();
  candidate = await startHttpCandidate(simulatorBaseUrl, 'success');
  const token = await candidate.app.get(JwtService).signAsync({
    type: 'customer',
    tokenUse: 'access',
    sub: 7,
    authVersion: 2,
  });
  process.stdout.write(`PAYMENT_HTTP_CANDIDATE_READY ${JSON.stringify({
    type: 'ready',
    baseUrl: candidate.baseUrl,
    simulatorBaseUrl,
    token,
  })}\n`);
}

process.on('SIGINT', () => {
  void close().finally(() => process.exit(0));
});
process.on('SIGTERM', () => {
  void close().finally(() => process.exit(0));
});

main().catch(async (error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  await close();
  process.exitCode = 1;
});
