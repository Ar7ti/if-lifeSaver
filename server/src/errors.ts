export class AppError extends Error {
  constructor(public code: string, message: string, public statusCode = 400, public details?: Record<string, unknown>) { super(message); }
}
export const notFound = (entity: string) => new AppError('NOT_FOUND', `${entity} not found`, 404);
