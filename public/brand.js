// Rebrandable product identity, kept separate from game rules and layout.
export const BRAND = Object.freeze({
  name: 'Wallfacers',
  storageNamespace: 'wallfacers',
  peerNamespace: 'wallfacers',
});

export function storageKey(name) {
  return `${BRAND.storageNamespace}-${name}`;
}
