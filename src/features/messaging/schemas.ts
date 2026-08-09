import { z } from 'zod'

export const channelSchema = z.object({
  name: z
    .string()
    .min(2, 'Enter a channel name')
    .max(60, 'Keep it under 60 characters')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/, 'Letters, numbers, spaces, - and _ only'),
  description: z.string().max(200, 'Keep it under 200 characters').optional(),
})
export type ChannelFormValues = z.infer<typeof channelSchema>

export const messageSchema = z.object({
  body: z.string().trim().min(1, 'Write a message').max(4000, 'Keep it under 4000 characters'),
})
export type MessageFormValues = z.infer<typeof messageSchema>
