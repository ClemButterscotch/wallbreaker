// Rebrandable product identity, kept separate from game rules and layout.
export const BRAND = Object.freeze({
  name: 'wallbreaker',
  storageNamespace: 'wallbreaker',
  peerNamespace: 'wallbreaker',
});

export const HOST_MODES = Object.freeze({
  '/host': 'standard',
  '/tutorial/host': 'tutorial',
  '/mathbreaker/host': 'mathbreaker',
});

export function hostModeForPath(pathname) {
  return HOST_MODES[pathname] || null;
}

export function hostStorageName(pathname) {
  return `host-${hostModeForPath(pathname) || 'standard'}`;
}

export function storageKey(name) {
  return `${BRAND.storageNamespace}-${name}`;
}
