import { z } from "zod";

export const contactConfigSchema = z.object({
  handle: z.string().min(1, "联系人标识不能为空"),
  name: z.string().min(1, "联系人名称不能为空"),
  workspace: z.string().min(1, "workspace 路径不能为空")
});

export const bridgeConfigSchema = z.object({
  rejectionMessage: z.string().min(1, "拒绝文案不能为空"),
  messageMergeWindowMs: z.number().int().positive("消息合并窗口必须是正整数"),
  adminHandles: z
    .array(z.string().min(1, "管理员联系人标识不能为空"))
    .optional(),
  contacts: z.array(contactConfigSchema).min(1, "至少需要一个白名单联系人")
});

export type ContactConfig = z.infer<typeof contactConfigSchema>;
export type BridgeConfig = z.infer<typeof bridgeConfigSchema>;
