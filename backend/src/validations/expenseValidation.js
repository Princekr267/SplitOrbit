import { z } from 'zod';

const splitItemSchema = z.object({
  personId: z.string().uuid('Invalid person ID format'),
  amount: z.number().int().nonnegative().optional(),
  exactAmount: z.number().int().nonnegative().optional(),
  basisPoints: z.number().int().min(0).max(10000).optional(),
});

export const createExpenseSchema = {
  params: z.object({
    groupId: z.string().uuid('Invalid group ID format'),
  }),
  body: z.object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    totalAmount: z.number().int().positive('Total amount must be a positive integer in paise'),
    date: z.string().optional(),
    paidByPersonId: z.string().uuid('Invalid paidByPersonId format'),
    category: z.string().trim().optional(),
    paymentStatus: z.string().trim().optional(),
    status: z.string().trim().optional(),
    description: z.string().trim().max(1000).optional().default(''),
    splitType: z.enum(['equal', 'exact', 'percentage']).default('equal'),
    splits: z.array(splitItemSchema).optional().default([]),
    selectedPersonIds: z.array(z.string().uuid()).optional().default([]),
  }),
};

export const updateExpenseSchema = {
  params: z.object({
    groupId: z.string().uuid('Invalid group ID format'),
    expenseId: z.string().uuid('Invalid expense ID format'),
  }),
  body: z.object({
    title: z.string().trim().min(1, 'Title cannot be empty').max(200).optional(),
    totalAmount: z.number().int().positive('Total amount must be a positive integer in paise').optional(),
    date: z.string().optional(),
    paidByPersonId: z.string().uuid('Invalid paidByPersonId format').optional(),
    category: z.string().trim().optional(),
    paymentStatus: z.string().trim().optional(),
    status: z.string().trim().optional(),
    description: z.string().trim().max(1000).optional(),
    splitType: z.enum(['equal', 'exact', 'percentage']).optional(),
    splits: z.array(splitItemSchema).optional(),
    selectedPersonIds: z.array(z.string().uuid()).optional(),
  }),
};

export const expenseParamsSchema = {
  params: z.object({
    groupId: z.string().uuid('Invalid group ID format'),
    expenseId: z.string().uuid('Invalid expense ID format'),
  }),
};
