let previousPath: string | null = null;

export function setPreviousPath(path: string | null) {
  previousPath = path;
}

export function getPreviousPath(): string | null {
  return previousPath;
}
