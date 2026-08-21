/**
 * @jest-environment node
 */
import { createHarness, withPlayer } from './harness';
import type { TestHarness } from './harness';

/**
 * Avatars must live in app-owned storage.
 *
 * An image picker returns a URI into a temporary or shared location, which is
 * not guaranteed to survive. The picked file is copied into storage the app
 * owns, and that path is what the profile keeps.
 */
describe('avatar storage', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness);
  });

  afterEach(() => harness.close());

  it('stores an app-owned path, not the picker URI', async () => {
    const owned = await harness.player.updateAvatar('file:///tmp/picker/IMG_0042.HEIC');

    expect(owned).not.toBe('file:///tmp/picker/IMG_0042.HEIC');
    expect(harness.avatars.owns(owned)).toBe(true);
    expect((await harness.repositories.player.get())?.avatarUri).toBe(owned);
  });

  it('preserves the file extension so the image still decodes', async () => {
    const owned = await harness.player.updateAvatar('file:///tmp/picker/photo.png');
    expect(owned.endsWith('.png')).toBe(true);
  });

  it('removes the previous owned file when the avatar changes', async () => {
    const first = await harness.player.updateAvatar('file:///tmp/picker/one.jpg');
    const second = await harness.player.updateAvatar('file:///tmp/picker/two.jpg');

    expect(second).not.toBe(first);
    expect(harness.avatars.removed).toContain(first);
    expect(harness.avatars.stored).toEqual([second]);
    expect((await harness.repositories.player.get())?.avatarUri).toBe(second);
  });

  it('never deletes a file it does not own', async () => {
    await harness.avatars.remove('file:///tmp/picker/somebody-elses.jpg');
    expect(harness.avatars.removed).toEqual([]);
  });

  it('stores an avatar during onboarding, before a profile exists', async () => {
    const fresh = await createHarness();

    const owned = await fresh.player.storeAvatar('file:///tmp/picker/first.jpg');
    expect(fresh.avatars.owns(owned)).toBe(true);

    // Picking again during onboarding replaces the copy rather than leaking it.
    const replaced = await fresh.player.storeAvatar('file:///tmp/picker/second.jpg', owned);
    expect(fresh.avatars.removed).toContain(owned);
    expect(fresh.avatars.stored).toEqual([replaced]);

    await fresh.player.createPlayer({
      name: 'Onboarded',
      avatarUri: replaced,
      unitSystem: 'metric',
    });
    expect((await fresh.repositories.player.get())?.avatarUri).toBe(replaced);
    fresh.close();
  });

  it('leaves the profile without an avatar when none was chosen', async () => {
    expect((await harness.repositories.player.get())?.avatarUri).toBeNull();
    expect(harness.avatars.stored).toEqual([]);
  });
});
