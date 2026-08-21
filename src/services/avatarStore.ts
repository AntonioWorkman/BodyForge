import { Directory, File, Paths } from 'expo-file-system';

/**
 * Avatar storage.
 *
 * An image picker hands back a URI into a shared or cached location — on iOS a
 * temporary copy, on Android often a content:// reference. Neither is app-owned
 * or guaranteed to survive, so the picked file is copied into the app's own
 * document directory and that path is what the profile stores.
 *
 * Local only. Nothing here uploads anything.
 */
export interface AvatarStore {
  /** Copies an image into app-owned storage and returns the owned URI. */
  save(sourceUri: string): Promise<string>;
  /** Deletes an app-owned avatar. Does nothing for a URI it does not own. */
  remove(uri: string | null): Promise<void>;
  /** Whether a URI points inside app-owned avatar storage. */
  owns(uri: string | null): boolean;
}

/** Folder, relative to the app's document directory, holding owned avatars. */
const AVATAR_DIRECTORY = 'avatars';

function extensionOf(uri: string): string {
  const withoutQuery = uri.split(/[?#]/)[0] ?? '';
  const match = /\.([a-zA-Z0-9]{1,5})$/.exec(withoutQuery);
  return match ? `.${match[1]!.toLowerCase()}` : '.jpg';
}

export function createAvatarStore(): AvatarStore {
  const directory = new Directory(Paths.document, AVATAR_DIRECTORY);

  return {
    owns(uri) {
      return uri !== null && uri.includes(`/${AVATAR_DIRECTORY}/`);
    },

    async save(sourceUri) {
      directory.create({ idempotent: true, intermediates: true });

      // Named by timestamp so replacing an avatar cannot collide with the file
      // still being displayed from the previous one.
      const destination = new File(directory, `avatar-${Date.now()}${extensionOf(sourceUri)}`);
      const source = new File(sourceUri);
      await source.copy(destination);

      return destination.uri;
    },

    async remove(uri) {
      // Only app-owned files are ever deleted; a picker URI belongs elsewhere.
      if (!uri || !this.owns(uri)) return;
      try {
        const file = new File(uri);
        if (file.exists) file.delete();
      } catch {
        // A missing or already-removed avatar is not a failure worth raising.
      }
    },
  };
}
