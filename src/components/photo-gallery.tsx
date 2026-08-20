"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrandLoader } from "@/components/brand-loader";

export interface GalleryPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  description: string | null;
  createdAt: string;
  isMine: boolean;
}

interface FeedPayload {
  data?: { photos: GalleryPhoto[]; nextCursor: string | null };
  error?: { message?: string };
}

interface PhotoGalleryProps {
  endpoint?: "/api/v1/photos" | "/api/v1/photos/mine";
  emptyMessage?: string;
  /** Render controls (edit/delete) under a photo; used by My uploads. */
  renderExtras?: (photo: GalleryPhoto, refresh: () => void) => React.ReactNode;
}

type SortOrder = "desc" | "asc";
const ORDER_STORAGE_KEY = "takeapik-gallery-order";
const LIVE_POLL_MS = 12_000;

function storedOrder(): SortOrder {
  if (typeof window === "undefined") return "desc";
  return window.localStorage.getItem(ORDER_STORAGE_KEY) === "asc" ? "asc" : "desc";
}

export function PhotoGallery({
  endpoint = "/api/v1/photos",
  emptyMessage = "No photos yet — be the first to add one.",
  renderExtras
}: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "idle" | "error" | "done">("loading");
  const [viewing, setViewing] = useState<GalleryPhoto | null>(null);
  const [order, setOrder] = useState<SortOrder>(storedOrder);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const photosRef = useRef<GalleryPhoto[]>([]);
  const stateRef = useRef(state);
  photosRef.current = photos;
  stateRef.current = state;

  const loadPage = useCallback(
    async (cursor: string | null, replace = false) => {
      if (busy.current) return;
      busy.current = true;
      setState("loading");
      try {
        const query = cursor
          ? `?cursor=${encodeURIComponent(cursor)}`
          : `?order=${order}`;
        const response = await fetch(`${endpoint}${query}`);
        const payload = (await response.json()) as FeedPayload;
        if (!response.ok || !payload.data) throw new Error(payload.error?.message);
        const page = payload.data;
        setPhotos((current) => (replace ? page.photos : [...current, ...page.photos]));
        setNextCursor(page.nextCursor);
        setState(page.nextCursor ? "idle" : "done");
      } catch {
        setState("error");
      } finally {
        busy.current = false;
      }
    },
    [endpoint, order]
  );

  const refresh = useCallback(() => void loadPage(null, true), [loadPage]);

  function switchOrder(next: SortOrder) {
    if (next === order) return;
    window.localStorage.setItem(ORDER_STORAGE_KEY, next);
    setPhotos([]);
    setNextCursor(null);
    setOrder(next);
  }

  useEffect(() => {
    void loadPage(null, true);
  }, [loadPage]);

  // Live updates without refreshing: while the tab is visible, quietly check
  // for photos that arrived since, and slide them in at the correct end.
  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible" || busy.current) return;
      // In oldest-first mode new photos belong after the last page; only
      // append once everything earlier is already on screen.
      if (order === "asc" && stateRef.current !== "done") return;
      try {
        const response = await fetch(`${endpoint}?order=desc`);
        const payload = (await response.json()) as FeedPayload;
        if (!response.ok || !payload.data) return;
        const known = new Set(photosRef.current.map((photo) => photo.id));
        const fresh = payload.data.photos.filter((photo) => !known.has(photo.id));
        if (fresh.length === 0) return;
        setPhotos((current) => {
          const currentIds = new Set(current.map((photo) => photo.id));
          const additions = fresh.filter((photo) => !currentIds.has(photo.id));
          if (additions.length === 0) return current;
          return order === "desc" ? [...additions, ...current] : [...current, ...additions.reverse()];
        });
        setState((value) => (value === "done" && order === "desc" ? "done" : value));
      } catch {
        // Network blips are fine; the next tick retries.
      }
    }, LIVE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [endpoint, order]);

  useEffect(() => {
    if (!viewing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && nextCursor) void loadPage(nextCursor);
      },
      { rootMargin: "600px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [nextCursor, loadPage]);

  if (state === "done" && photos.length === 0) {
    return <p className="gallery-empty">{emptyMessage}</p>;
  }

  return (
    <>
      <div className="gallery-toolbar">
        <button
          type="button"
          className={`link-button${order === "desc" ? " is-active" : ""}`}
          aria-pressed={order === "desc"}
          onClick={() => switchOrder("desc")}
        >
          Newest first
        </button>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          className={`link-button${order === "asc" ? " is-active" : ""}`}
          aria-pressed={order === "asc"}
          onClick={() => switchOrder("asc")}
        >
          Oldest first
        </button>
      </div>
      <div className="gallery-masonry">
        {photos.map((photo) => (
          <figure key={photo.id} className="gallery-item">
            <button
              type="button"
              className="gallery-photo-button"
              aria-label={photo.description ? `View photo: ${photo.description}` : "View photo"}
              onClick={() => setViewing(photo)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.description ?? "Event photo"}
                width={photo.width}
                height={photo.height}
                loading="lazy"
                decoding="async"
              />
            </button>
            {photo.description ? <figcaption>{photo.description}</figcaption> : null}
            {renderExtras ? <div className="gallery-extras">{renderExtras(photo, refresh)}</div> : null}
          </figure>
        ))}
      </div>
      <div ref={sentinel} aria-hidden="true" />
      {state === "loading" ? <div className="gallery-status"><BrandLoader label="Loading photos" /></div> : null}
      {viewing ? (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={viewing.description ?? "Photo"}
          onClick={() => setViewing(null)}
        >
          <button type="button" className="lightbox-close" aria-label="Close photo">✕</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewing.url} alt={viewing.description ?? "Event photo"} onClick={(event) => event.stopPropagation()} />
          {viewing.description ? <p className="lightbox-caption">{viewing.description}</p> : null}
        </div>
      ) : null}
      {state === "error" ? (
        <p className="gallery-status">
          Couldn&apos;t load photos.{" "}
          <button type="button" className="link-button" onClick={() => void loadPage(nextCursor)}>
            Try again
          </button>
        </p>
      ) : null}
    </>
  );
}
