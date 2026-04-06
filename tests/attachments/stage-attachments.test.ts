import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { stageAttachments } from "../../src/attachments/stage-attachments.js";

describe("stageAttachments", () => {
  test("copies supported image attachments into the staging directory", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "stage-attachments-"));
    const sourceImage = join(workspace, "source.png");
    const sourceText = join(workspace, "note.txt");
    const stagingDirectory = join(workspace, "attachments");
    await writeFile(sourceImage, "image-bytes", "utf8");
    await writeFile(sourceText, "ignored", "utf8");

    const staged = await stageAttachments({
      handle: "+8613800000000",
      messageId: "m1",
      attachmentPaths: [sourceImage, sourceText],
      stagingDirectory,
      now: () => 1710000000000
    });

    expect(staged).toHaveLength(1);
    expect(staged[0]).toMatchObject({
      messageId: "m1",
      sourcePath: sourceImage
    });
    await expect(readFile(staged[0]!.stagedPath, "utf8")).resolves.toBe("image-bytes");
  });
});
