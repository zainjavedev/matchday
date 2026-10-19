export const shareUrl = (follows) => `${location.origin}${location.pathname}#teams=${follows.map(encodeURIComponent).join(',')}`;

export const readShared = () => {
  const m = location.hash.match(/teams=([^&]+)/);
  if (!m) return [];
  return m[1].split(',').map(decodeURIComponent).filter((id) => /^[a-z0-9]+:[\w.-]+$/i.test(id));
};
