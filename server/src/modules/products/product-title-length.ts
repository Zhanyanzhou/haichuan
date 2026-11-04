import {
  ValidateBy,
  ValidationOptions,
  buildMessage,
} from 'class-validator';

/** 与淘宝、天猫宝贝标题一致：汉字等非 ASCII 计 2，字母、数字、半角符号与空格计 1。 */
export const PRODUCT_TITLE_MAX_UNITS = 60;

export function productTitleUnits(value: string): number {
  let units = 0;
  for (const char of value) {
    units += (char.codePointAt(0) ?? 0) <= 0x7f ? 1 : 2;
  }
  return units;
}

export function MaxProductTitleUnits(
  maxUnits = PRODUCT_TITLE_MAX_UNITS,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'maxProductTitleUnits',
      constraints: [maxUnits],
      validator: {
        validate: (value) =>
          typeof value === 'string' && productTitleUnits(value) <= maxUnits,
        defaultMessage: buildMessage(
          () => '商品名称不能超过60个字符（一个汉字计2个字符，字母与数字计1个字符）',
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
