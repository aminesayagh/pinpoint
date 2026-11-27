import { useEffect, useMemo, useRef, useState } from 'react';
import { getScreenshot } from '@/lib/db';

/** 40px screenshot preview; a click shows it full size over the panel (click or Esc closes). */
export function Thumbnail({ image, alt }: { image: Blob; alt: string }) {
  const url = useMemo(() => URL.createObjectURL(image), [image]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const viewer = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className="size-10 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-default bg-default/30"
        aria-label={`${alt}: open full screen`}
        onClick={() => viewer.current?.showModal()}
      >
        <img src={url} alt={alt} className="size-full object-contain" />
      </button>
      <dialog
        ref={viewer}
        className="m-0 h-dvh max-h-none w-dvw max-w-none cursor-zoom-out items-center justify-center bg-transparent p-3 open:flex backdrop:bg-black/90"
        onClick={() => viewer.current?.close()}
      >
        {/* Real size, only shrunk to fit: small captures stay sharp. */}
        <img
          src={url}
          alt={`${alt}, full screen`}
          className="max-h-full max-w-full rounded-lg bg-white shadow-2xl"
        />
      </dialog>
    </>
  );
}

/** Thumbnail of a saved comment's screenshot, loaded on demand (the list does not hold blobs). */
export function SavedThumbnail({ feedbackId, alt }: { feedbackId: string; alt: string }) {
  const [image, setImage] = useState<Blob>();
  useEffect(() => {
    let live = true;
    getScreenshot(feedbackId).then(
      (s) => live && setImage(s?.image_blob),
      () => {},
    );
    return () => void (live = false);
  }, [feedbackId]);
  return image ? (
    <Thumbnail image={image} alt={alt} />
  ) : (
    <span className="size-10 shrink-0 rounded-lg bg-default/30" />
  );
}
