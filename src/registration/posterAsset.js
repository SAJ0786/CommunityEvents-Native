const MAX_BYTES = 5 * 1024 * 1024;
// Use the encoded file signature, not a guessed MIME or the original file name.
export function registrationPosterAsset(asset) {
  const base64 = asset?.base64;
  if (typeof base64 !== 'string' || !base64.length || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw Error('The selected image could not be read. Choose it again.');
  const bytes = []; let bits = 0, count = 0;
  for (const char of base64.slice(0, 24)) {
    const digit = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.indexOf(char);
    if (digit < 0) break;
    bits = (bits << 6) | digit; count += 6;
    if (count >= 8) { count -= 8; bytes.push((bits >> count) & 255); }
  }
  const mime = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
    : [137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n) ? 'image/png'
    : String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP' ? 'image/webp' : '';
  if (!mime) throw Error('Choose a JPEG, PNG or WebP image.');
  const size = Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (size > MAX_BYTES) throw Error('Choose an image up to 5 MB.');
  return { uri: asset.uri, base64, mime };
}
