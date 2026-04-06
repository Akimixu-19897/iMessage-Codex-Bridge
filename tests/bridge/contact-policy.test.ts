import { describe, expect, test } from "vitest";

import { createContactPolicy } from "../../src/bridge/contact-policy.js";

describe("createContactPolicy", () => {
  test("allows configured contacts", () => {
    const policy = createContactPolicy({
      rejectionMessage: "请联系管理员开通权限。",
      messageMergeWindowMs: 5000,
      contacts: [
        {
          handle: "+8613800000000",
          name: "测试联系人",
          workspace: "/tmp/workspace-a"
        }
      ]
    });

    expect(policy.evaluate("+8613800000000")).toEqual({
      allowed: true,
      contact: {
        handle: "+8613800000000",
        name: "测试联系人",
        workspace: "/tmp/workspace-a"
      }
    });
  });

  test("rejects non-whitelisted contacts with fixed message", () => {
    const policy = createContactPolicy({
      rejectionMessage: "请联系管理员开通权限。",
      messageMergeWindowMs: 5000,
      contacts: [
        {
          handle: "+8613800000000",
          name: "测试联系人",
          workspace: "/tmp/workspace-a"
        }
      ]
    });

    expect(policy.evaluate("+8613900000000")).toEqual({
      allowed: false,
      rejectionMessage: "请联系管理员开通权限。"
    });
  });
});
