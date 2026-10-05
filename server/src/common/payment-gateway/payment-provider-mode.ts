export const PAYMENT_PROVIDER_MODES = [
  'disabled',
  'simulator',
  'live',
] as const;

export type PaymentProviderMode = (typeof PAYMENT_PROVIDER_MODES)[number];

export const DEFAULT_PAYMENT_PROVIDER_MODE: PaymentProviderMode = 'disabled';

export function parsePaymentProviderMode(
  value: unknown,
): PaymentProviderMode {
  const normalized =
    typeof value === 'string' && value.trim()
      ? value.trim().toLowerCase()
      : DEFAULT_PAYMENT_PROVIDER_MODE;
  if (!PAYMENT_PROVIDER_MODES.includes(normalized as PaymentProviderMode)) {
    throw new Error('unsupported payment provider mode');
  }
  return normalized as PaymentProviderMode;
}

export const PAYMENT_SIMULATOR_SCENARIOS = [
  'success',
  'pending',
  'closed',
  'amount-mismatch',
  'timeout',
] as const;

export type PaymentSimulatorScenario =
  (typeof PAYMENT_SIMULATOR_SCENARIOS)[number];

export function parsePaymentSimulatorScenario(
  value: unknown,
): PaymentSimulatorScenario {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (
    !PAYMENT_SIMULATOR_SCENARIOS.includes(
      normalized as PaymentSimulatorScenario,
    )
  ) {
    throw new Error('unsupported payment simulator scenario');
  }
  return normalized as PaymentSimulatorScenario;
}
