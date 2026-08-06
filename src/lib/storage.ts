/**
 * Helpers for putting files into Supabase Storage and getting them back.
 *
 * A stored file's key ends up inside a URL twice over — once in the signed
 * link the browser fetches, once in the direct request the client makes. The
 * Supabase client escapes the first with encodeURI, which leaves #, ? and &
 * exactly as they are, and doesn't escape the second at all. So a contract
 * filed as "Smith & Sons #12.pdf" gets a link pointing at the wrong object,
 * or one whose token has been swallowed by the query string.
 */

export const EXT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * A file name safe to use as a storage key.
 *
 * Callers pair this with a random ID, so the name is only here to keep the
 * bucket readable — nothing depends on it surviving intact.
 */
export function safeStorageName(name: string) {
  const dot = name.lastIndexOf(".");
  const stem = (dot > 0 ? name.slice(0, dot) : name)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  const ext = (dot > 0 ? name.slice(dot + 1) : "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase()
    .slice(0, 8);
  return ext ? `${stem || "file"}.${ext}` : stem || "file";
}

/** What a file actually is, falling back to its extension. */
export function fileContentType(file: File) {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPES[ext] ?? "application/octet-stream";
}

/**
 * Percent-escape the characters that would otherwise cut a key short.
 *
 * Files uploaded before names were cleaned up still carry whatever the phone
 * called them, and renaming an object in place isn't possible. Escaping by
 * hand before handing the key to the client lets those files still be
 * fetched: the server puts the characters back when it decodes the path.
 *
 * One pass over the string, so the % introduced for one character is never
 * mistaken for one that needs escaping itself.
 */
export function escapeStorageKey(path: string) {
  return path.replace(
    /[%#?]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}
