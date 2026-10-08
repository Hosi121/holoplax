export type Session = {
  expires: string;
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string;
    onboardingCompletedAt?: string | Date | null;
    pwChangedAt?: number | null;
  };
};
