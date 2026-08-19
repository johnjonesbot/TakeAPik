// Official takeapik wordmark (white letters + red camera mark). Links to the
// marketing home by default, or to the album home when an href is given.
export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <a className="wordmark" href={href} aria-label="TakeAPik home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/wordmark-white.png" alt="TakeAPik" />
    </a>
  );
}
