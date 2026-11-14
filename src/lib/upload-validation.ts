/**
 * Upload content validation for assignment submissions.
 *
 * Policy: an explicit ALLOWLIST of file types appropriate for student
 * coursework, verified by three independent signals — the filename
 * extension, the client-reported MIME type, and the file's actual
 * leading bytes (magic numbers). Client-reported types are never
 * trusted on their own: a binary format whose bytes do not match its
 * claimed extension is rejected, and text-family files must actually
 * look like text.
 *
 * Deliberately NOT allowed (active or executable content): exe/msi/
 * bat/cmd/sh/ps1/jar/apk/com/scr/vbs, html/htm, svg, and anything not
 * on the list. Web-project work can be submitted as a .zip archive,
 * which is allowed.
 *
 * Residual risk (documented, not hidden): there is no malware scanning
 * in this pipeline. Allowed containers (zip/rar/7z, Office files) can
 * carry malicious content; files stay in a private bucket and are only
 * ever served through authorized, short-lived signed URLs — never
 * executed or rendered by the application itself.
 */

export interface UploadValidationOk {
  ok: true;
  /** Canonical kind, e.g. "pdf", "zip", "image", "text". */
  kind: string;
}
export type UploadValidation = UploadValidationOk | { ok: false; error: string };

const BINARY_SIGNATURES: Record<string, { exts: string[]; kind: string; test: (b: Uint8Array) => boolean }> = {
  pdf: { exts: ["pdf"], kind: "pdf", test: (b) => hasAscii(b, 0, "%PDF-") },
  ole: {
    exts: ["doc", "xls", "ppt"],
    kind: "office-legacy",
    test: (b) => b.length >= 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0,
  },
  zip: {
    exts: ["zip", "docx", "xlsx", "pptx", "odt", "ods", "odp"],
    kind: "zip",
    test: (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05) && (b[3] === 0x04 || b[3] === 0x06),
  },
  jpeg: { exts: ["jpg", "jpeg"], kind: "image", test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { exts: ["png"], kind: "image", test: (b) => b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  gif: { exts: ["gif"], kind: "image", test: (b) => hasAscii(b, 0, "GIF8") },
  webp: { exts: ["webp"], kind: "image", test: (b) => hasAscii(b, 0, "RIFF") && hasAscii(b, 8, "WEBP") },
  wav: { exts: ["wav"], kind: "audio", test: (b) => hasAscii(b, 0, "RIFF") && hasAscii(b, 8, "WAVE") },
  mp4: {
    exts: ["mp4", "mov"],
    kind: "video",
    test: (b) => b.length >= 8 && hasAscii(b, 4, "ftyp"),
  },
  mp3: {
    exts: ["mp3"],
    kind: "audio",
    test: (b) => hasAscii(b, 0, "ID3") || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  },
  rar: { exts: ["rar"], kind: "archive", test: (b) => hasAscii(b, 0, "Rar!") && b.length >= 7 && b[6] === 0x07 },
  sevenzip: {
    exts: ["7z"],
    kind: "archive",
    test: (b) => b.length >= 6 && b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf && b[4] === 0x27 && b[5] === 0x1c,
  },
  rtf: { exts: ["rtf"], kind: "document", test: (b) => hasAscii(b, 0, "{\\rtf") },
};

/** Text-family extensions: no magic number exists, so content is checked to be text-like. */
const TEXT_EXTS = new Set([
  "txt", "md", "csv", "json", "xml", "css",
  "js", "jsx", "ts", "tsx", "py", "java", "c", "h", "cpp", "sql",
]);

const EXT_TO_SIGNATURE = new Map<string, string>();
for (const [name, sig] of Object.entries(BINARY_SIGNATURES)) {
  for (const ext of sig.exts) EXT_TO_SIGNATURE.set(ext, name);
}

export const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([
  ...EXT_TO_SIGNATURE.keys(),
  ...TEXT_EXTS,
]);

function hasAscii(b: Uint8Array, offset: number, s: string): boolean {
  if (b.length < offset + s.length) return false;
  for (let i = 0; i < s.length; i++) if (b[offset + i] !== s.charCodeAt(i)) return false;
  return true;
}

export function extensionOf(fileName: string): string | null {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1).toLowerCase();
}

function looksLikeText(b: Uint8Array): boolean {
  const n = Math.min(b.length, 4096);
  for (let i = 0; i < n; i++) {
    if (b[i] === 0) return false; // NUL byte: not text
  }
  // Reject well-known executable/binary headers masquerading as text.
  if (b.length >= 2 && b[0] === 0x4d && b[1] === 0x5a) return false; // MZ (Windows exe)
  if (b.length >= 4 && b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) return false; // ELF
  if (hasAscii(b, 0, "%PDF-")) return false;
  if (hasAscii(b, 0, "PK\x03\x04")) return false;
  return true;
}

/**
 * Validate one uploaded file. Reads at most the first 8KB for sniffing
 * decisions on binary formats (text check inspects the first 4KB).
 */
export async function validateUploadFile(file: File): Promise<UploadValidation> {
  const ext = extensionOf(file.name);
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: `"${file.name}": file type ${ext ? `.${ext}` : "(no extension)"} is not allowed. Allowed: documents (PDF, Word, Excel, PowerPoint, text), images, audio/video, and archives (ZIP, RAR, 7z). Tip: put project folders into a ZIP file.`,
    };
  }

  const mime = (file.type || "").toLowerCase();
  // A browser claiming an executable/active MIME type is rejected
  // outright, whatever the filename says. Other unexpected MIME values
  // are tolerated — the byte-level checks below are the real gate.
  if (
    mime.includes("html") ||
    mime.includes("executable") ||
    mime.includes("x-msdownload") ||
    mime.includes("javascript") ||
    mime.includes("x-sh")
  ) {
    return { ok: false, error: `"${file.name}": reported type "${file.type}" is not allowed.` };
  }

  const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());

  const sigName = EXT_TO_SIGNATURE.get(ext);
  if (sigName) {
    const sig = BINARY_SIGNATURES[sigName];
    if (!sig.test(head)) {
      return {
        ok: false,
        error: `"${file.name}": the file contents do not match the .${ext} format. The file may be corrupted or renamed from another type.`,
      };
    }
    return { ok: true, kind: sig.kind };
  }

  // Text family
  if (!looksLikeText(head)) {
    return {
      ok: false,
      error: `"${file.name}": the file contents are not plain text as expected for .${ext} files.`,
    };
  }
  return { ok: true, kind: "text" };
}
