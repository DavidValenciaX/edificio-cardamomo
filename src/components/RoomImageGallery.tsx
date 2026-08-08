import { useEffect, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DEFAULT_ROOM_IMAGE_PLACEHOLDER } from "../data";

interface RoomImageGalleryProps {
  roomId: string;
  roomName: string;
  images: string[];
  className?: string;
}

export default function RoomImageGallery({ roomId, roomName, images, className = "" }: RoomImageGalleryProps) {
  const normalizedImages = images.filter(Boolean);
  const galleryImages = normalizedImages.length > 0 ? normalizedImages : [DEFAULT_ROOM_IMAGE_PLACEHOLDER];
  const [activeIndex, setActiveIndex] = useState(0);
  const hasMultipleImages = galleryImages.length > 1;

  useEffect(() => {
    setActiveIndex(0);
  }, [roomId, galleryImages.length]);

  const showPreviousImage = () => {
    setActiveIndex((currentIndex) => (currentIndex === 0 ? galleryImages.length - 1 : currentIndex - 1));
  };

  const showNextImage = () => {
    setActiveIndex((currentIndex) => (currentIndex === galleryImages.length - 1 ? 0 : currentIndex + 1));
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

  const currentImage = galleryImages[activeIndex] || DEFAULT_ROOM_IMAGE_PLACEHOLDER;
  const imageAlt = normalizedImages.length > 0
    ? `Interior de ${roomName}, foto ${activeIndex + 1} de ${galleryImages.length}`
    : `Imagen de referencia de ${roomName}`;

  return (
    <div
      role="region"
      aria-roledescription="carrusel"
      aria-label={`Fotos de ${roomName}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`relative overflow-hidden bg-warm-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 ${className}`}
    >
      <div className="relative aspect-[16/10] sm:aspect-[3/2]">
        <img
          src={currentImage}
          alt={imageAlt}
          referrerPolicy="no-referrer"
          width={960}
          height={600}
          loading={activeIndex === 0 ? "eager" : "lazy"}
          className="h-full w-full object-cover object-center"
        />

        {hasMultipleImages && (
          <>
            <button
              type="button"
              onClick={showPreviousImage}
              aria-label="Ver foto anterior"
              className="absolute left-3 top-1/2 z-10 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full border border-warm-bg/35 bg-dark/70 text-warm-bg shadow-lg backdrop-blur-sm transition-colors hover:bg-dark focus-visible:bg-dark"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={showNextImage}
              aria-label="Ver foto siguiente"
              className="absolute right-3 top-1/2 z-10 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full border border-warm-bg/35 bg-dark/70 text-warm-bg shadow-lg backdrop-blur-sm transition-colors hover:bg-dark focus-visible:bg-dark"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <span
              aria-live="polite"
              className="absolute bottom-3 right-3 rounded-full border border-warm-bg/25 bg-dark/75 px-3 py-1 text-xs font-bold text-warm-bg backdrop-blur-sm"
            >
              {activeIndex + 1} de {galleryImages.length}
            </span>
          </>
        )}
      </div>

      {hasMultipleImages && (
        <div className="flex items-center justify-center gap-2 border-t border-warm-border bg-white px-4 py-3" aria-label="Seleccionar foto">
          {galleryImages.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`Ver foto ${index + 1} de ${galleryImages.length}`}
              aria-current={index === activeIndex ? "true" : undefined}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
            >
              <span
                aria-hidden="true"
                className={`h-3 w-3 rounded-full border transition-colors ${
                index === activeIndex
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
