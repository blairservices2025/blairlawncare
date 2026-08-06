/**
 * The peaks from the Blair Lawn Care logo, for the corners of the app.
 *
 * The wordmark is left off on purpose: everywhere this appears, "Blair Lawn
 * Care" is already set in type right beside it, and at badge size the logo's
 * own lettering would only be a smudge. scripts/make-icons.mjs cuts this out
 * of assets/logo.png, so it stays in step with the real artwork.
 *
 * Decorative — the name is always adjacent as real text, so it's hidden from
 * screen readers rather than read out twice.
 */
export default function LogoMark({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo-mark.png" alt="" aria-hidden="true" className={className} />
  );
}
