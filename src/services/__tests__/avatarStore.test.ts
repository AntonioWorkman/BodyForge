/**
 * @jest-environment node
 */

/**
 * Creating the avatar store must not touch the filesystem.
 *
 * It used to build its directory eagerly, which meant merely constructing the
 * services hit the filesystem — and on web that threw, taking the whole app
 * down at boot before any avatar was involved. Every unit test and both bundle
 * exports passed; only running the app caught it.
 */
jest.mock('expo-file-system', () => ({
  Paths: {
    get document() {
      throw new Error('filesystem unavailable on this platform');
    },
  },
  Directory: class {
    constructor() {
      throw new Error('filesystem unavailable on this platform');
    }
  },
  File: class {
    constructor() {
      throw new Error('filesystem unavailable on this platform');
    }
  },
}));

// eslint-disable-next-line import/first
import { createAvatarStore } from '../avatarStore';

describe('avatar store construction', () => {
  it('constructs without touching the filesystem', () => {
    expect(() => createAvatarStore()).not.toThrow();
  });

  it('answers ownership questions without the filesystem', () => {
    const store = createAvatarStore();
    expect(store.owns('file:///app/avatars/one.jpg')).toBe(true);
    expect(store.owns('file:///picker/tmp/one.jpg')).toBe(false);
    expect(store.owns(null)).toBe(false);
  });

  it('ignores removal of a path it does not own, even with no filesystem', async () => {
    const store = createAvatarStore();
    await expect(store.remove('file:///picker/tmp/one.jpg')).resolves.toBeUndefined();
    await expect(store.remove(null)).resolves.toBeUndefined();
  });
});
