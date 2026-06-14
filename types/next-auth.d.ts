import "next-auth";

declare module "next-auth" {
  interface Session {
    user?: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: "ADMIN" | "USER";
      disabledAt?: string | null;
      onboardingCompletedAt?: string | Date | null;
      pwChangedAt?: number | null;
    };
  }
}
