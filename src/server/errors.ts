/** An error whose message is safe to show to the user. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid" | "forbidden" | "not_found" | "conflict" | "unauthenticated" = "invalid",
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "That page") => new AppError(`${what} could not be found.`, "not_found");
export const forbidden = (msg = "You don't have permission to do that.") => new AppError(msg, "forbidden");
