/* istanbul ignore file */
import type { AvatarStore } from '@/services/avatarStore';

/**
 * An in-memory `AvatarStore` for tests.
 *
 * The real store copies files, which Jest has no filesystem module for. This
 * keeps the same contract — owned URIs, replacement, cleanup — so the service
 * logic around it is genuinely exercised.
 */
export interface MemoryAvatarStore extends AvatarStore {
  /** URIs currently held, in insertion order. */
  readonly stored: string[];
  /** Every URI ever removed, for asserting cleanup happened. */
  readonly removed: string[];
}

export function createMemoryAvatarStore(): MemoryAvatarStore {
  const stored: string[] = [];
  const removed: string[] = [];
  let counter = 0;

  return {
    stored,
    removed,

    owns(uri) {
      return uri !== null && uri.includes('/avatars/');
    },

    async save(sourceUri) {
      counter += 1;
      const extension = /\.([a-zA-Z0-9]{1,5})$/.exec(sourceUri)?.[1] ?? 'jpg';
      const owned = `file:///app/avatars/avatar-${counter}.${extension}`;
      stored.push(owned);
      return owned;
    },

    async remove(uri) {
      if (!uri || !this.owns(uri)) return;
      removed.push(uri);
      const index = stored.indexOf(uri);
      if (index >= 0) stored.splice(index, 1);
    },
  };
}
