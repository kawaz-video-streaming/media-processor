import { z } from 'zod';


export const validateSchema = <T>(schema: z.ZodType<T>) => (payload: any): payload is T => {
    const result = schema.safeParse(payload);
    return result.success;
}