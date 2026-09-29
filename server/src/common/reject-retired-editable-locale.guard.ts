import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { requireEditablePublicContentLocale } from "./content-locale";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

@Injectable()
export class RejectRetiredEditableLocaleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      body?: { locale?: unknown };
      query?: { locale?: unknown };
    }>();
    if (!MUTATING_METHODS.has(String(request.method || "").toUpperCase())) {
      return true;
    }
    const locale = request.body?.locale ?? request.query?.locale;
    if (locale === undefined || locale === null || locale === "") {
      return true;
    }
    requireEditablePublicContentLocale(locale);
    return true;
  }
}
