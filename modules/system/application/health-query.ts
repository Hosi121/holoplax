export interface HealthQueryPort {
  isDatabaseReachable(): Promise<boolean>;
}

export const createHealthQuery = (port: HealthQueryPort) => () => port.isDatabaseReachable();
