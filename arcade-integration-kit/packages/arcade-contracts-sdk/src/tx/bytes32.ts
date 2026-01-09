// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import { ZeroHash, encodeBytes32String, isHexString, keccak256, toUtf8Bytes } from "ethers";

export function toBytes32String(value: string): string {
  const s = String(value).trim();
  if (isHexString(s, 32)) return s;
  return encodeBytes32String(s);
}

export function toBytes32Ref(value: string | null | undefined): string {
  if (!value) return ZeroHash;
  const s = String(value).trim();
  if (!s) return ZeroHash;
  if (isHexString(s, 32)) return s;
  return keccak256(toUtf8Bytes(s));
}
