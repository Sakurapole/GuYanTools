import type { FileTransferEntry } from '@/contracts/ftp';

export type PathBreadcrumb = {
  label: string;
  path: string;
};

export function baseName(path: string) {
  if (!path) return '';
  const normalized = path.replace(/[\\/]+$/, '');
  const segments = normalized.split(/[\\/]/);
  return segments[segments.length - 1] || normalized;
}

export function joinRemotePath(base: string, name: string) {
  const root = base && base !== '/' ? base.replace(/\/+$/, '') : '';
  return `${root}/${name}`.replace(/\/{2,}/g, '/');
}

export function parentRemotePath(path: string) {
  const normalized = (path || '/').replace(/\/+$/, '') || '/';
  if (normalized === '/') return '/';
  const index = normalized.lastIndexOf('/');
  return index <= 0 ? '/' : normalized.slice(0, index);
}

export function joinLocalPath(base: string, name: string) {
  if (!base) return name;
  const separator = base.includes('\\') ? '\\' : '/';
  const root = base.endsWith('\\') || base.endsWith('/') ? base.slice(0, -1) : base;
  return `${root}${separator}${name}`;
}

export function parentLocalPath(path: string) {
  if (!path) return path;
  const normalized = path.replace(/[\\/]+$/, '');
  if (/^[A-Za-z]:$/.test(normalized)) return `${normalized}\\`;
  if (/^[A-Za-z]:\\$/.test(path)) return path;
  const separatorIndex = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'));
  if (separatorIndex <= 0) return normalized;
  const parent = normalized.slice(0, separatorIndex);
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent;
}

export function buildPathSuggestions(entries: FileTransferEntry[], input: string) {
  const query = input.trim().toLowerCase();
  const lastSegment = baseName(input).toLowerCase();

  return entries
    .filter((entry) => entry.isDir)
    .map((entry) => entry.path)
    .filter((path, index, array) => array.indexOf(path) === index)
    .filter((path) => {
      if (!query) return true;
      const normalizedPath = path.toLowerCase();
      const normalizedName = baseName(path).toLowerCase();
      return normalizedPath.includes(query) || normalizedName.includes(lastSegment);
    })
    .slice(0, 8);
}

export function buildRemoteBreadcrumbs(path: string): PathBreadcrumb[] {
  const normalized = `/${(path || '/').replace(/\/+/g, '/').replace(/^\/?/, '').replace(/\/+$/, '')}`.replace(/\/{2,}/g, '/');
  if (normalized === '/') {
    return [{ label: '/', path: '/' }];
  }

  const breadcrumbs: PathBreadcrumb[] = [{ label: '/', path: '/' }];
  let currentPath = '';
  for (const segment of normalized.slice(1).split('/')) {
    currentPath = currentPath ? `${currentPath}/${segment}` : `/${segment}`;
    breadcrumbs.push({ label: segment, path: currentPath });
  }
  return breadcrumbs;
}

export function buildLocalBreadcrumbs(path: string): PathBreadcrumb[] {
  if (!path) return [];

  const trimmedPath = path.replace(/[\\/]+$/, '') || path;
  const driveMatch = trimmedPath.match(/^[A-Za-z]:/);
  if (driveMatch) {
    const drive = driveMatch[0];
    const breadcrumbs: PathBreadcrumb[] = [{ label: drive, path: `${drive}\\` }];
    const remainder = trimmedPath.slice(drive.length).replace(/^[\\/]+/, '');
    let currentPath = `${drive}\\`;
    for (const segment of remainder.split(/[\\/]+/).filter(Boolean)) {
      currentPath = joinLocalPath(currentPath, segment);
      breadcrumbs.push({ label: segment, path: currentPath });
    }
    return breadcrumbs;
  }

  const uncMatch = trimmedPath.match(/^\\\\[^\\]+\\[^\\]+/);
  if (uncMatch) {
    const root = uncMatch[0];
    const breadcrumbs: PathBreadcrumb[] = [{ label: root, path: root }];
    const remainder = trimmedPath.slice(root.length).replace(/^[\\/]+/, '');
    let currentPath = root;
    for (const segment of remainder.split(/[\\/]+/).filter(Boolean)) {
      currentPath = joinLocalPath(currentPath, segment);
      breadcrumbs.push({ label: segment, path: currentPath });
    }
    return breadcrumbs;
  }

  if (/^[\\/]/.test(trimmedPath)) {
    const normalized = trimmedPath.replace(/\\/g, '/');
    const breadcrumbs: PathBreadcrumb[] = [{ label: '/', path: '/' }];
    let currentPath = '';
    for (const segment of normalized.replace(/^\/+/, '').split('/').filter(Boolean)) {
      currentPath = currentPath ? `${currentPath}/${segment}` : `/${segment}`;
      breadcrumbs.push({ label: segment, path: currentPath });
    }
    return breadcrumbs;
  }

  return [{ label: trimmedPath, path }];
}
