import { ExternalLink } from "lucide-react";

/**
 * Safe lesson-video rendering. The schema stores a free-form `videoUrl`
 * string, so the URL is parsed strictly:
 * - YouTube (watch / youtu.be / shorts / embed) -> youtube-nocookie iframe
 * - Vimeo -> player.vimeo.com iframe
 * - Direct media files (.mp4/.webm/.ogg/.mov) -> native <video>
 * - Any other valid http(s) URL -> a plain external link (never iframed)
 * - Anything unparseable or non-http(s) -> not rendered at all
 */
export function parseVideoUrl(raw: string | null | undefined):
  | { kind: "youtube"; embedUrl: string }
  | { kind: "vimeo"; embedUrl: string }
  | { kind: "file"; url: string }
  | { kind: "link"; url: string }
  | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id =
      url.searchParams.get("v") ??
      (url.pathname.startsWith("/shorts/") ? url.pathname.split("/")[2] : null) ??
      (url.pathname.startsWith("/embed/") ? url.pathname.split("/")[2] : null);
    if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) {
      return { kind: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
    }
  }
  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    if (/^[A-Za-z0-9_-]{6,20}$/.test(id)) {
      return { kind: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
    }
  }
  if (host === "vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (/^\d+$/.test(id ?? "")) {
      return { kind: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
    }
  }
  if (/\.(mp4|webm|ogg|mov)$/i.test(url.pathname)) {
    return { kind: "file", url: url.toString() };
  }
  return { kind: "link", url: url.toString() };
}

export function VideoEmbed({ videoUrl, title }: { videoUrl: string | null; title: string }) {
  const parsed = parseVideoUrl(videoUrl);
  if (!parsed) return null;

  if (parsed.kind === "youtube" || parsed.kind === "vimeo") {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg border bg-black">
        <iframe
          src={parsed.embedUrl}
          title={`Video for ${title}`}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  }
  if (parsed.kind === "file") {
    return (
      <video controls preload="metadata" className="aspect-video w-full rounded-lg border bg-black" src={parsed.url}>
        Your browser does not support embedded video.
      </video>
    );
  }
  return (
    <a
      href={parsed.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
    >
      <ExternalLink className="h-4 w-4" /> Watch video
    </a>
  );
}
