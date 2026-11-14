/**
 * Upload validation tests (pure — no database needed).
 * Fixtures are crafted in-memory from real format signatures.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extensionOf, validateUploadFile } from "@/lib/upload-validation";

function file(name: string, bytes: number[] | string, type = ""): File {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : new Uint8Array(bytes);
  return new File([data], name, { type });
}

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]; // %PDF-1.4
const MZ = [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]; // Windows executable
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ZIP = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00];
const MP4 = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]; // ....ftypisom

describe("upload allowlist + content sniffing", () => {
  it("accepts genuine allowlisted files", async () => {
    assert.equal((await validateUploadFile(file("homework.pdf", PDF, "application/pdf"))).ok, true);
    assert.equal((await validateUploadFile(file("photo.png", PNG, "image/png"))).ok, true);
    assert.equal((await validateUploadFile(file("project.zip", ZIP, "application/zip"))).ok, true);
    assert.equal((await validateUploadFile(file("report.docx", ZIP, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))).ok, true);
    assert.equal((await validateUploadFile(file("clip.mp4", MP4, "video/mp4"))).ok, true);
    assert.equal((await validateUploadFile(file("notes.txt", "plain text homework\nline two"))).ok, true);
    assert.equal((await validateUploadFile(file("main.py", "print('hello')\n"))).ok, true);
  });

  it("rejects executable and active content by extension", async () => {
    for (const name of ["virus.exe", "run.msi", "script.bat", "setup.jar", "page.html", "icon.svg", "app.apk", "shell.sh"]) {
      const r = await validateUploadFile(file(name, PDF));
      assert.equal(r.ok, false, `${name} must be rejected`);
    }
  });

  it("rejects renamed binaries: extension is never trusted alone", async () => {
    // EXE bytes wearing a .pdf name -> magic mismatch
    assert.equal((await validateUploadFile(file("homework.pdf", MZ, "application/pdf"))).ok, false);
    // HTML content wearing a .pdf name -> magic mismatch
    assert.equal((await validateUploadFile(file("homework.pdf", "<html><script>alert(1)</script>", "application/pdf"))).ok, false);
    // PDF bytes wearing an image name -> magic mismatch
    assert.equal((await validateUploadFile(file("photo.png", PDF, "image/png"))).ok, false);
    // double extension resolves to the final suffix only
    assert.equal((await validateUploadFile(file("homework.pdf.exe", PDF))).ok, false);
    // binary content claiming to be a text/code file -> NUL/binary sniff fails
    assert.equal((await validateUploadFile(file("main.py", MZ))).ok, false);
  });

  it("rejects dangerous reported MIME types even for allowlisted names", async () => {
    const r = await validateUploadFile(file("homework.pdf", PDF, "text/html"));
    assert.equal(r.ok, false);
  });

  it("extension parsing is path-safe and case-insensitive", () => {
    assert.equal(extensionOf("a/b\\c.PDF"), "pdf");
    assert.equal(extensionOf("noextension"), null);
    assert.equal(extensionOf(".hiddenfile"), null);
    assert.equal(extensionOf("trailing."), null);
  });
});
