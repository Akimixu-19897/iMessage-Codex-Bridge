import type { BridgeConfig, ContactConfig } from "../config/schema.js";

type AllowedDecision = {
  allowed: true;
  contact: ContactConfig;
};

type RejectedDecision = {
  allowed: false;
  rejectionMessage: string;
};

export type ContactPolicyDecision = AllowedDecision | RejectedDecision;

export function createContactPolicy(config: BridgeConfig) {
  const contactsByHandle = new Map(
    config.contacts.map((contact) => [contact.handle, contact] as const)
  );

  return {
    evaluate(handle: string): ContactPolicyDecision {
      const contact = contactsByHandle.get(handle);

      if (contact) {
        return {
          allowed: true,
          contact
        };
      }

      return {
        allowed: false,
        rejectionMessage: config.rejectionMessage
      };
    }
  };
}
