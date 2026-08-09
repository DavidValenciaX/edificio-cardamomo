const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_QUALITY = 0.82;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo leer la imagen seleccionada."));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

/**
 * Resizes large room photos and stores them as WebP when the browser supports it.
 * If the browser cannot process the file, the original file is returned so uploads
 * remain functional instead of failing only because of local image processing.
 */
export async function optimizeRoomImage(file: File, maxDimension = DEFAULT_MAX_DIMENSION): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml" || file.type === "image/gif") {
    return file;
  }

  try {
    const image = await loadImage(file);
    const largestDimension = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, maxDimension / largestDimension);

    if (scale === 1 && file.type === "image/webp" && file.size <= 350 * 1024) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) return file;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const webpBlob = await canvasToBlob(canvas, "image/webp", DEFAULT_QUALITY);
    const outputBlob = webpBlob?.type === "image/webp"
      ? webpBlob
      : await canvasToBlob(canvas, "image/jpeg", DEFAULT_QUALITY);

    if (!outputBlob || outputBlob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "room-image";
    const extension = outputBlob.type === "image/webp" ? "webp" : "jpg";

    return new File([outputBlob], `${baseName}.${extension}`, {
      type: outputBlob.type,
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn("Room image optimization skipped:", error);
    return file;
  }
}
