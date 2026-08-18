import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().default("TakeAPik"),
  APP_URL: z.url().default("http://localhost:3000"),
  ROOT_DOMAIN: z.string().min(1).default("localhost:3000"),
  DEV_TENANT_SLUG: z.string().optional(),
  TRUST_PROXY: z
    .string()
    .default("false")
    .transform((value) => value === "true"),

  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z
    .string()
    .default("false")
    .transform((value) => value === "true"),

  SESSION_SECRET: z.string().min(32),
  TOKEN_HASH_PEPPER: z.string().min(32),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().max(168).default(24),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().default("takeapik-media"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("false")
    .transform((value) => value === "true"),

  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(15_000_000),
  MAX_IMAGE_WIDTH: z.coerce.number().int().positive().default(1920),

  SUPER_ADMIN_BOOTSTRAP_EMAIL: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Validate and return server environment configuration. Fails fast with the
 * list of offending variable names, never their values.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const failed = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid environment configuration for: ${failed.join(", ")}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCacheForTests(): void {
  cached = undefined;
}
