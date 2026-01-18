import { z } from "zod";
import { AppError } from "./errors";

type ParseOptions = {
  code?: string;
  message?: string;
};

export const parseBody = async <T>(
  request: Request,
  schema: z.ZodSchema<T>,
  options: ParseOptions = {},
): Promise<T> => {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new AppError(
      options.code ?? "VALIDATION_ERROR",
      options.message ?? "invalid json",
      400,
      { reason: "invalid_json" },
    );
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    throw new AppError(
      options.code ?? "VALIDATION_ERROR",
      options.message ?? "invalid input",
      400,
      { issues: result.error.issues },
    );
  }
  return result.data;
};
