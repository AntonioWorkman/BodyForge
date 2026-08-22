/**
 * Identifiers.
 *
 * Records are created on-device with no server to assign keys, so ids are
 * generated locally. Time-ordered prefixes keep rows sorted naturally in the
 * database, which makes debugging exports far easier to read.
 */
let counter = 0;

export function createId(prefix: string): string {
  counter = (counter + 1) % 0xffff;
  const time = Date.now().toString(36);
  const random = Math.floor(Math.random() * 0xffffff).toString(36);
  const sequence = counter.toString(36).padStart(3, '0');
  return `${prefix}_${time}${sequence}${random}`;
}
