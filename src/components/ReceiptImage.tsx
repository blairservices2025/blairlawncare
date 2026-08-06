"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const EXT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/**
 * A receipt photo out of the private storage bucket.
 *
 * The quick way to show one is a signed URL: the browser fetches and caches
 * it like any other image. That fails in two ordinary situations, and until
 * now both showed up as nothing but a broken-image icon:
 *
 *  - The signing helper builds its link with encodeURI, which leaves #, ?,
 *    & and + alone. A photo saved as "Receipt #3.jpg" signs to a link that
 *    points somewhere else, or loses its token entirely.
 *  - The link only lasts a few hours. Leave the page open over lunch and
 *    every photo on it expires.
 *
 * So a failed image falls back to fetching the file through the Supabase
 * client, which addresses the object by path and needs no link at all. That
 * covers both cases without anyone having to re-upload anything. If even
 * that fails, it says why instead of leaving a question mark on the screen.
 */
export default function ReceiptImage({
  path,
  signedUrl,
  alt,
  className = "",
}: {
  path: string;
  signedUrl?: string;
  alt: string;
  className?: string;
}) {
  const supabase = createClient();
  const [src, setSrc] = useState<string | undefined>(signedUrl);
  const [problem, setProblem] = useState<string | null>(null);
  const blobUrl = useRef<string | null>(null);
  const triedFallback = useRef(false);

  useEffect(() => {
    setSrc(signedUrl);
    setProblem(signedUrl ? null : "No link could be made for this photo.");
    triedFallback.current = false;
  }, [signedUrl]);

  // The blob lives until the page moves on; without this each one leaks.
  useEffect(
    () => () => {
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    },
    []
  );

  const handleError = useCallback(async () => {
    // Only one retry. If the fetched copy also fails to decode, retrying
    // would spin forever — that's a file this browser can't display.
    if (triedFallback.current) {
      setSrc(undefined);
      setProblem("This browser can't display this file.");
      return;
    }
    triedFallback.current = true;

    // A # or ? in the stored name breaks the fetch as surely as it breaks
    // the signed link — everything after it is read as a fragment or a query
    // string. Nothing here can reach that file, so say what's wrong with it
    // rather than failing vaguely.
    if (/[#?]/.test(path)) {
      setSrc(undefined);
      setProblem("This photo's file name breaks its link. Upload it again.");
      return;
    }

    const { data, error } = await supabase.storage.from("receipts").download(path);
    if (error || !data) {
      setSrc(undefined);
      setProblem(error?.message ?? "The photo couldn't be fetched.");
      return;
    }

    // Anything uploaded before the type was pinned down may be filed as
    // plain text or as raw bytes, and a blob URL carrying that type won't
    // render. The bytes are a photo either way, so relabel by extension.
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const blob = data.type.startsWith("image/")
      ? data
      : new Blob([data], { type: EXT_TYPES[ext] ?? "image/jpeg" });

    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = URL.createObjectURL(blob);
    setSrc(blobUrl.current);
  }, [path, supabase]);

  if (!src) {
    return (
      <div
        className={`${className} flex flex-col items-center justify-center gap-1 bg-bone-dim px-2 text-center`}
      >
        <span className="text-lg leading-none">🧾</span>
        <span className="text-[10px] leading-tight text-ink-soft">
          {problem ?? "Photo unavailable"}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} onError={handleError} />
  );
}
