const base = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : import.meta.env.BASE_URL + "/";

export const homePath = base;
export const privacyPolicyPath = `${base}privacy-policy/`;
export const simulationPath = `${base}simulation/`;

export function assetPath(path: string): string {
  return `${base}${path.replace(/^\/+/, "")}`;
}

export function sectionPath(id: string): string {
  return `${base}#${id}`;
}
