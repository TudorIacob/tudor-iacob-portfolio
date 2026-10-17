import { z } from "zod";

const singleLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) => !/[\p{Cc}\p{Cf}]/u.test(value),
      "Use a single line without control characters.",
    );
export const contactSchema = z
  .object({
    name: singleLine(100).min(1, "Enter your name."),
    email: singleLine(254).pipe(z.email("Enter a valid email address.")),
    company: singleLine(150).optional().default(""),
    message: z
      .string()
      .trim()
      .min(10, "Enter at least 10 characters.")
      .max(5000, "Use at most 5,000 characters.")
      .refine(
        (value) => !/[\p{Cf}\p{Cc}]/u.test(value.replace(/[\r\n\t]/g, "")),
        "Remove control characters from your message.",
      ),
    website: z.string().max(0).optional().default(""),
  })
  .strict();
export type ContactData = z.infer<typeof contactSchema>;
export type ContactErrors = Partial<Record<keyof ContactData, string>>;
export function contactErrors(error: z.ZodError): ContactErrors {
  const result: ContactErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && field in contactSchema.shape)
      result[field as keyof ContactData] ??= issue.message;
  }
  return result;
}
