/**
 * Observabilidad ligera. Sustituible por Sentry cuando configures DSN en EAS.
 * No añade dependencias nativas (evita romper builds).
 */
type ReportContext = Record<string, unknown>;

const recent: { at: string; message: string; context?: ReportContext }[] = [];

export function reportError(error: unknown, context?: ReportContext) {
  const message = error instanceof Error ? error.message : String(error);
  const entry = { at: new Date().toISOString(), message, context };
  recent.push(entry);
  if (recent.length > 50) recent.shift();
  if (__DEV__) {
    console.warn("[reportError]", message, context ?? "");
  } else {
    console.warn("[reportError]", message);
  }
}

export function reportInfo(message: string, context?: ReportContext) {
  if (__DEV__) console.log("[reportInfo]", message, context ?? "");
}

export function getRecentReports() {
  return [...recent];
}
