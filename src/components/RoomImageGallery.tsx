import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { DEFAULT_ROOM_IMAGE_PLACEHOLDER } from "../data";

interface RoomImageGalleryProps {
  roomId: string;
  roomName: string;
  images: string[];
  className?: string;
  compact?: boolean;
}

function preloadImage(imageUrl: string, cache: Map<string, Promise<void>>): Promise<void> {
  const cachedPromise = cache.get(imageUrl);
  if (cachedPromise) return cachedPromise;

  const promise = new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const finish = () => resolve();
      if (typeof image.decode !== "function") {
        finish();
        return;
      }

      void image.decode().catch(() => undefined).then(finish);
    };
    image.onerror = () => reject(new Error("No se pudo cargar la imagen."));
    image.src = imageUrl;
  });

  cache.set(imageUrl, promise);
  void promise.catch(() => cache.delete(imageUrl));
  return promise;
}

export default function RoomImageGallery({ roomId, roomName, images, className = "", compact = false }: RoomImageGalleryProps) {
  const normalizedImages = useMemo(() => images.filter(Boolean), [images]);
  const galleryImages = useMemo(
    () => normalizedImages.length > 0 ? normalizedImages : [DEFAULT_ROOM_IMAGE_PLACEHOLDER],
    [normalizedImages],
  );
  const galleryKey = galleryImages.join("\u0000");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [shouldPreloadAdjacent, setShouldPreloadAdjacent] = useState(!compact);
  const hasMultipleImages = galleryImages.length > 1;
  const imageCacheRef = useRef(new Map<string, Promise<void>>());
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const preload = useCallback(
    (imageUrl: string) => preloadImage(imageUrl, imageCacheRef.current),
    [],
  );

  useEffect(() => {
    requestIdRef.current += 1;
    setActiveIndex(0);
    setIsLoading(false);
    setImageLoadError(false);
  }, [roomId, galleryKey]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const safeActiveIndex = activeIndex < galleryImages.length ? activeIndex : 0;

  useEffect(() => {
    if (!hasMultipleImages) return;
    if (!shouldPreloadAdjacent) return;

    const nextIndex = (safeActiveIndex + 1) % galleryImages.length;
    const previousIndex = (safeActiveIndex - 1 + galleryImages.length) % galleryImages.length;
    void preload(galleryImages[nextIndex]).catch(() => undefined);
    void preload(galleryImages[previousIndex]).catch(() => undefined);
  }, [galleryKey, galleryImages, hasMultipleImages, preload, safeActiveIndex, shouldPreloadAdjacent]);

  const requestImage = useCallback((nextIndex: number) => {
    if (!hasMultipleImages || nextIndex === safeActiveIndex || isLoading) return;

    const nextImage = galleryImages[nextIndex];
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setImageLoadError(false);

    void preload(nextImage)
      .then(() => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        setActiveIndex(nextIndex);
        setIsLoading(false);
      })
      .catch(() => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        setIsLoading(false);
        setImageLoadError(true);
      });
  }, [galleryImages, hasMultipleImages, isLoading, preload, safeActiveIndex]);

  const showPreviousImage = () => {
    requestImage(safeActiveIndex === 0 ? galleryImages.length - 1 : safeActiveIndex - 1);
  };

  const showNextImage = () => {
    requestImage(safeActiveIndex === galleryImages.length - 1 ? 0 : safeActiveIndex + 1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!hasMultipleImages) return;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPreviousImage();
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      showNextImage();
    }
  };

  const currentImage = galleryImages[safeActiveIndex] || DEFAULT_ROOM_IMAGE_PLACEHOLDER;
  const imageAlt = normalizedImages.length > 0
    ? `Interior de ${roomName}, foto ${safeActiveIndex + 1} de ${galleryImages.length}`
    : `Imagen de referencia de ${roomName}`;

  return (
    <div
      role="region"
      aria-roledescription="carrusel"
      aria-label={`Fotos de ${roomName}`}
      aria-busy={isLoading}
      tabIndex={0}
      onMouseEnter={() => setShouldPreloadAdjacent(true)}
      onFocus={() => setShouldPreloadAdjacent(true)}
      onTouchStart={() => setShouldPreloadAdjacent(true)}
      onKeyDown={handleKeyDown}
      className={`relative overflow-hidden bg-warm-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 ${className}`}
    >
      <div className={`relative ${compact ? "aspect-[4/3]" : "aspect-[16/10] sm:aspect-[3/2]"}`}>
        <img
          src={currentImage}
          alt={imageAlt}
          referrerPolicy="no-referrer"
          width={960}
          height={600}
          loading={compact ? "lazy" : "eager"}
          fetchPriority={compact ? "auto" : safeActiveIndex === 0 ? "high" : "auto"}
          decoding="async"
          onError={() => setImageLoadError(true)}
          className="h-full w-full object-cover object-center"
        />

        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-dark/20" role="status">
            <LoaderCircle className="h-7 w-7 animate-spin text-warm-bg motion-reduce:animate-none" aria-hidden="true" />
            <span className="sr-only">Cargando foto…</span>
          </div>
        )}

        {imageLoadError && !isLoading && (
          <div className="absolute inset-x-3 bottom-3 z-10 rounded-xl bg-dark/80 px-3 py-2 text-center text-xs font-semibold text-warm-bg" role="alert">
            No se pudo cargar esta foto.
          </div>
        )}

        {hasMultipleImages && (
          <>
            <button
              type="button"
              onClick={showPreviousImage}
              disabled={isLoading}
              aria-label="Ver foto anterior"
              className="absolute left-3 top-1/2 z-10 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full border border-warm-bg/35 bg-dark/70 text-warm-bg shadow-lg backdrop-blur-sm transition-colors hover:bg-dark focus-visible:bg-dark disabled:cursor-wait disabled:opacity-70"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={showNextImage}
              disabled={isLoading}
              aria-label="Ver foto siguiente"
              className="absolute right-3 top-1/2 z-10 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full border border-warm-bg/35 bg-dark/70 text-warm-bg shadow-lg backdrop-blur-sm transition-colors hover:bg-dark focus-visible:bg-dark disabled:cursor-wait disabled:opacity-70"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <span
              aria-live="polite"
              className="absolute bottom-3 right-3 rounded-full border border-warm-bg/25 bg-dark/75 px-3 py-1 text-xs font-bold text-warm-bg backdrop-blur-sm"
            >
              {safeActiveIndex + 1} de {galleryImages.length}
            </span>
          </>
        )}
      </div>

      {hasMultipleImages && !compact && (
        <div className="flex items-center justify-center gap-2 border-t border-warm-border bg-white px-4 py-3" aria-label="Seleccionar foto">
          {galleryImages.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              onClick={() => requestImage(index)}
              disabled={isLoading}
              aria-label={`Ver foto ${index + 1} de ${galleryImages.length}`}
              aria-current={index === safeActiveIndex ? "true" : undefined}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
            >
              <span
                aria-hidden="true"
                className={`h-3 w-3 rounded-full border transition-colors ${
                index === safeActiveIndex
                  ? "border-primary bg-primary"
                  : "border-secondary/40 bg-secondary/20 hover:bg-secondary/45"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
