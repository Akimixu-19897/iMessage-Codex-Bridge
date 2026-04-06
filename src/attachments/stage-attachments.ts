import { copyFile, mkdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";

export type StagedAttachment = {
  messageId: string;
  sourcePath: string;
  stagedPath: string;
  createdAt: number;
};

type StageAttachmentsOptions = {
  handle: string;
  messageId: string;
  attachmentPaths: string[];
  stagingDirectory: string;
  now?: () => number;
};

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".heic",
  ".heif"
]);

export async function stageAttachments(
  options: StageAttachmentsOptions
): Promise<StagedAttachment[]> {
  const now = options.now ?? Date.now;
  const createdAt = now();
  const imagePaths = options.attachmentPaths.filter(isSupportedImagePath);

  await mkdir(options.stagingDirectory, { recursive: true });

  const stagedAttachments: StagedAttachment[] = [];
  for (const [index, sourcePath] of imagePaths.entries()) {
    const stagedPath = join(
      options.stagingDirectory,
      `${sanitizeHandle(options.handle)}-${createdAt}-${index}-${basename(sourcePath)}`
    );
    await copyFile(sourcePath, stagedPath);
    stagedAttachments.push({
      messageId: options.messageId,
      sourcePath,
      stagedPath,
      createdAt
    });
  }

  return stagedAttachments;
}

function isSupportedImagePath(path: string): boolean {
  return SUPPORTED_IMAGE_EXTENSIONS.has(extname(path).toLowerCase());
}

function sanitizeHandle(handle: string): string {
  return handle.replace(/[^a-zA-Z0-9._-]/g, "_");
}
