export function chartDownloadBasename(title: string | undefined, typeLabel: string) {
  const raw = (title?.trim() || typeLabel || "chart")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  return raw || "chart";
}

export function serializeChartSvg(
  svg: SVGSVGElement,
  options?: { background?: string },
) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const box = svg.getBoundingClientRect();
  const width = Math.max(Math.round(box.width) || Number(svg.getAttribute("width")) || 0, 640);
  const height = Math.max(Math.round(box.height) || Number(svg.getAttribute("height")) || 0, 280);

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("viewBox", svg.getAttribute("viewBox") || `0 0 ${width} ${height}`);

  const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  background.setAttribute("width", "100%");
  background.setAttribute("height", "100%");
  background.setAttribute("fill", options?.background ?? "#0c0c0e");
  clone.insertBefore(background, clone.firstChild);

  return new XMLSerializer().serializeToString(clone);
}

function triggerDownload(filename: string, href: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
}

export function downloadChartSvg(svg: SVGSVGElement, filename: string) {
  const xml = serializeChartSvg(svg);
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(filename, url);
  URL.revokeObjectURL(url);
}

export function downloadChartPng(svg: SVGSVGElement, filename: string) {
  const xml = serializeChartSvg(svg);
  const image = new Image();
  const box = svg.getBoundingClientRect();
  const width = Math.max(Math.round(box.width), 640);
  const height = Math.max(Math.round(box.height), 280);

  return new Promise<void>((resolve, reject) => {
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("canvas"));
        return;
      }

      context.fillStyle = "#0c0c0e";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("png"));
          return;
        }
        const url = URL.createObjectURL(blob);
        triggerDownload(filename, url);
        URL.revokeObjectURL(url);
        resolve();
      }, "image/png");
    };
    image.onerror = () => reject(new Error("svg"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  });
}
