import { SetMetadata } from '@nestjs/common';

export const SKIP_GENERIC_AUDIT_KEY = 'skipGenericAudit';

/** 已在业务事务内写入规范审计日志时，避免全局拦截器重复写入泛化记录。 */
export const SkipGenericAudit = () => SetMetadata(SKIP_GENERIC_AUDIT_KEY, true);
