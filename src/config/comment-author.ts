import type { CommentAuthor } from "../comments/CreateComment";
import type { InstallAppConfig } from "../schema/install-config";

export function commentAuthorFromInstallConfig(
  config: InstallAppConfig,
): CommentAuthor {
  return {
    name: config.user.name,
    email: config.user.email,
    role: config.user.role === "consultant" ? "consultant" : "reviewer",
  };
}
