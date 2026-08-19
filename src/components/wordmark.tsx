// Official takeapik wordmark (white letters + red camera mark), served from
// the web root at /images. Links home. Alt text carries the brand name.
export function Wordmark() {
  return (
    <a className="wordmark" href="/" aria-label="TakeAPik home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/logo%20white%20letters.png" alt="TakeAPik" />
    </a>
  );
}
