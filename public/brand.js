// Rebrandable product identity, kept separate from game rules and layout.
export const BRAND = Object.freeze({
  name: 'wallbreaker',
  storageNamespace: 'wallbreaker',
  peerNamespace: 'wallbreaker',
});

export function storageKey(name) {
  return `${BRAND.storageNamespace}-${name}`;
}
