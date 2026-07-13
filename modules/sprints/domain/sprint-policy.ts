export const sprintWindowViolation = (input: { startedAt: Date; plannedEndAt: Date | null }) =>
  input.plannedEndAt && input.plannedEndAt.getTime() < input.startedAt.getTime()
    ? "planned end must not be before sprint start"
    : null;
