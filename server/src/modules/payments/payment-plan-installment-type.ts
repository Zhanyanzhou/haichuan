export type InstallmentPaymentType = 'DEPOSIT' | 'BALANCE' | 'FULL';

type InstallmentPaymentTypeInput = {
  finalCents: number;
  depositCents: number;
  balanceCents: number;
  installmentCount: number;
  sequence: number;
  label: string;
  amountCents: number;
};

/**
 * 付款角色只取决于转单时冻结的订单金额拆分与对应分期合同。
 * 返回 null 表示计划已漂移，调用方必须失败关闭，不能按分期数量猜测角色。
 */
export function resolveInstallmentPaymentType(
  input: InstallmentPaymentTypeInput,
): InstallmentPaymentType | null {
  const {
    finalCents,
    depositCents,
    balanceCents,
    installmentCount,
    sequence,
    label,
    amountCents,
  } = input;
  if (
    ![finalCents, depositCents, balanceCents, installmentCount, sequence, amountCents]
      .every(Number.isSafeInteger) ||
    finalCents <= 0 ||
    depositCents < 0 ||
    balanceCents < 0 ||
    depositCents + balanceCents !== finalCents
  ) {
    return null;
  }

  if (depositCents === 0) {
    return installmentCount === 1 &&
      sequence === 1 &&
      label === '全款' &&
      amountCents === balanceCents
      ? 'FULL'
      : null;
  }

  const expectedCount = balanceCents > 0 ? 2 : 1;
  if (installmentCount !== expectedCount) return null;
  if (sequence === 1 && label === '定金' && amountCents === depositCents) {
    return 'DEPOSIT';
  }
  if (
    balanceCents > 0 &&
    sequence === 2 &&
    label === '尾款' &&
    amountCents === balanceCents
  ) {
    return 'BALANCE';
  }
  return null;
}
