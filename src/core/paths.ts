export function toPosixPath(p: string): string {
  return String(p).replace(/\\/g, '/');
}

export function splitPosixPath(p: string): string[] {
  return toPosixPath(p).split('/').filter(Boolean);
}

