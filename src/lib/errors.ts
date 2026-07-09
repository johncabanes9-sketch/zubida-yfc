export type RegistrationErrorCode =
  | "FULL" | "CLOSED" | "DEADLINE_PASSED" | "DUPLICATE"
  | "RATE_LIMITED" | "INVALID" | "CAPTCHA_FAILED" | "SERVER_ERROR";

export const ERROR_STATUS: Record<RegistrationErrorCode, number> = {
  INVALID: 400, CAPTCHA_FAILED: 400, DUPLICATE: 409,
  FULL: 409, CLOSED: 409, DEADLINE_PASSED: 409,
  RATE_LIMITED: 429, SERVER_ERROR: 500,
};

export const ERROR_MESSAGE: Record<RegistrationErrorCode, string> = {
  FULL: "This event is fully booked.",
  CLOSED: "Registration for this event is closed.",
  DEADLINE_PASSED: "The registration deadline has passed.",
  DUPLICATE: "This email is already registered for this event.",
  RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
  INVALID: "Please check the form and try again.",
  CAPTCHA_FAILED: "Captcha verification failed. Please retry.",
  SERVER_ERROR: "Something went wrong on our end. Please try again.",
};

export function isRegistrationErrorCode(v: unknown): v is RegistrationErrorCode {
  return typeof v === "string" && v in ERROR_STATUS;
}
