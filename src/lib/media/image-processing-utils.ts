export const processBalatroCardImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result;
      if (typeof src !== "string") {
        reject(new Error("Failed to read image file"));
        return;
      }

      const img = new Image();
      img.onload = () => {
        if (img.width !== 71 || img.height !== 95) {
          resolve(src);
          return;
        }

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = 142;
        canvas.height = 190;

        if (!ctx) {
          reject(new Error("Canvas context failed"));
          return;
        }

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, 142, 190);
        resolve(canvas.toDataURL("image/png"));
      };

      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = src;
    };
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
};