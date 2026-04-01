import { resolve, relative, isAbsolute } from "node:path";

/**
 * Path-based permission validation.
 * Checks if file operations target allowed paths.
 * Mirrors Claude Code's src/utils/permissions/filesystem.ts
 */

// Sensitive paths that should never be written to
const SENSITIVE_PATHS = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.secret",
  ".git/config",
  ".git/hooks",
  "id_rsa",
  "id_ed25519",
  ".ssh/config",
  ".npmrc",
  ".pypirc",
];

// Directories that should require extra caution
const PROTECTED_DIRS = [
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "__pycache__",
];

export type PathValidation = {
  allowed: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
};

/**
 * Check if a file path is allowed for write operations.
 */
export function validateWritePath(
  filePath: string,
  projectRoot: string,
  cwd: string
): PathValidation {
  const resolved = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
  const rel = relative(projectRoot, resolved);

  // Check if path escapes project root
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return {
      allowed: true,
      requiresConfirmation: true,
      reason: `Path is outside project root (${projectRoot})`,
    };
  }

  // Check sensitive paths
  for (const sensitive of SENSITIVE_PATHS) {
    if (rel === sensitive || rel.endsWith(`/${sensitive}`)) {
      return {
        allowed: false,
        reason: `Cannot write to sensitive file: ${sensitive}`,
      };
    }
  }

  // Check protected directories
  for (const dir of PROTECTED_DIRS) {
    if (rel.startsWith(dir + "/") || rel === dir) {
      return {
        allowed: true,
        requiresConfirmation: true,
        reason: `Writing to protected directory: ${dir}`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Check if a file path is allowed for read operations.
 * Most reads are allowed, except for known secret files.
 */
export function validateReadPath(filePath: string): PathValidation {
  const lower = filePath.toLowerCase();

  // Block reading private keys
  if (lower.includes("id_rsa") || lower.includes("id_ed25519") || lower.includes("id_ecdsa")) {
    if (!lower.endsWith(".pub")) {
      return {
        allowed: false,
        reason: "Cannot read private key files",
      };
    }
  }

  return { allowed: true };
}
