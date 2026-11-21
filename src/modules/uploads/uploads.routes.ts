import express, { Router } from "express";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { verifyToken } from "../../middleware/auth.js";

export const uploadsRouter = Router();

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Accepted image types, identified by their leading bytes rather than the client's Content-Type alone. */
const IMAGE_SIGNATURES: { type: string; matches: (bytes: Buffer) => boolean }[] = [
  { type: "image/jpeg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/webp", matches: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
  { type: "image/gif", matches: (b) => b.subarray(0, 4).toString("ascii") === "GIF8" },
];

type ImgbbResponse = { success?: boolean; data?: { url?: string; display_url?: string }; error?: { message?: string } };

// POST /api/uploads/image — any signed-in user uploads one image (raw bytes, Content-Type: image/*).
// The server forwards it to ImgBB with its own API key, so the key never reaches the browser,
// and returns the hosted https URL for the service image or profile photo.
uploadsRouter.post(
  "/image",
  verifyToken,
  express.raw({ type: IMAGE_SIGNATURES.map((signature) => signature.type), limit: MAX_IMAGE_BYTES }),
  async (req, res) => {
    if (!env.IMGBB_API_KEY) throw new AppError(503, "SERVICE_UNAVAILABLE", "Image uploads aren't configured on the server");

    const bytes = Buffer.isBuffer(req.body) ? req.body : null;
    if (!bytes || bytes.length === 0) throw new AppError(400, "BAD_REQUEST", "Choose a JPG, PNG, WebP or GIF image");
    const detected = IMAGE_SIGNATURES.find((signature) => signature.matches(bytes));
    if (!detected) throw new AppError(400, "BAD_REQUEST", "That file isn't a JPG, PNG, WebP or GIF image");

    const form = new FormData();
    form.append("image", bytes.toString("base64"));

    let result: ImgbbResponse | null = null;
    try {
      const response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(env.IMGBB_API_KEY)}`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(20_000),
      });
      result = (await response.json().catch(() => null)) as ImgbbResponse | null;
      if (!response.ok || !result?.success) {
        console.error("ImgBB upload failed:", response.status, result?.error?.message);
        result = null;
      }
    } catch (error) {
      console.error("ImgBB upload failed:", error instanceof Error ? error.message : error);
    }

    const url = result?.data?.display_url ?? result?.data?.url;
    if (!url?.startsWith("https://")) throw new AppError(502, "BAD_GATEWAY", "The image couldn't be uploaded. Please try again.");
    res.status(201).json({ success: true, data: { url } });
  },
);
