import { APP_NAME } from "@musicpro/shared";

export type AppBuildInfo = {
  name: string;
  version: string;
  buildId: string;
  builtAtIso: string;
  environment: string;
};

export function getAppBuildInfo(): AppBuildInfo {
  return {
    name: APP_NAME,
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0",
    buildId: process.env.NEXT_PUBLIC_APP_BUILD_ID ?? "dev",
    builtAtIso: process.env.NEXT_PUBLIC_APP_BUILD_TIME ?? "",
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
  };
}

export function formatBuiltAtRome(iso: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function environmentLabel(env: string): string {
  switch (env) {
    case "production":
      return "Produzione";
    case "preview":
      return "Anteprima";
    case "development":
      return "Sviluppo";
    default:
      return env;
  }
}
