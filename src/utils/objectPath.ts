export type PathPart = string | number;

export function setAtPath(target: unknown, path: PathPart[], value: unknown): unknown {
  if (path.length === 0) {
    return value;
  }
  const [head, ...rest] = path;
  if (Array.isArray(target)) {
    const index = typeof head === "number" ? head : Number(head);
    const next = [...target];
    next[index] = setAtPath(next[index], rest, value);
    return next;
  }
  if (target && typeof target === "object") {
    const next = { ...(target as Record<string, unknown>) };
    next[String(head)] = setAtPath(next[String(head)], rest, value);
    return next;
  }
  const container = typeof head === "number" ? [] : {};
  return setAtPath(container, path, value);
}

export function getAtPath(target: unknown, path: PathPart[]): unknown {
  return path.reduce((acc, part) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc)) {
      const index = typeof part === "number" ? part : Number(part);
      return acc[index];
    }
    if (typeof acc === "object") {
      return (acc as Record<string, unknown>)[String(part)];
    }
    return undefined;
  }, target);
}

export function renameKeyAtPath(
  target: unknown,
  path: PathPart[],
  newKey: string,
): unknown {
  if (path.length === 0 || !newKey) return target;
  const parentPath = path.slice(0, -1);
  const oldKey = path[path.length - 1];
  const parent = getAtPath(target, parentPath);
  if (!parent || typeof parent !== "object" || Array.isArray(parent)) {
    return target;
  }
  const parentRecord = parent as Record<string, unknown>;
  if (!(String(oldKey) in parentRecord)) return target;
  const nextParent: Record<string, unknown> = {};
  Object.entries(parentRecord).forEach(([key, value]) => {
    if (key === String(oldKey)) {
      nextParent[newKey] = value;
    } else {
      nextParent[key] = value;
    }
  });
  return setAtPath(target, parentPath, nextParent);
}

export function removeAtPath(target: unknown, path: PathPart[]): unknown {
  if (path.length === 0) return target;
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  const parent = getAtPath(target, parentPath);
  if (Array.isArray(parent)) {
    const index = typeof key === "number" ? key : Number(key);
    if (Number.isNaN(index)) return target;
    const next = parent.filter((_, idx) => idx !== index);
    return setAtPath(target, parentPath, next);
  }
  if (parent && typeof parent === "object") {
    const next = { ...(parent as Record<string, unknown>) };
    delete next[String(key)];
    return setAtPath(target, parentPath, next);
  }
  return target;
}

export function addObjectEntryAtPath(
  target: unknown,
  path: PathPart[],
  key: string,
  value: unknown,
): unknown {
  const node = getAtPath(target, path);
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return target;
  }
  const next = { ...(node as Record<string, unknown>), [key]: value };
  return setAtPath(target, path, next);
}

export function addArrayItemAtPath(
  target: unknown,
  path: PathPart[],
  value: unknown,
): unknown {
  const node = getAtPath(target, path);
  if (!Array.isArray(node)) {
    return target;
  }
  const next = [...node, value];
  return setAtPath(target, path, next);
}

