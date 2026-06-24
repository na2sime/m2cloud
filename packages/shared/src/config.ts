import { z } from "zod";

/**
 * Validate process.env against a zod schema. Throws a readable error listing
 * every missing/invalid variable — fail fast on misconfiguration at boot.
 */
export function loadConfig<T extends z.ZodTypeAny>(schema: T): z.infer<T> {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

export { z };
