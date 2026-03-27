import { z } from 'zod';

export const sendTextMessageSchema = z.object({
  instanceId: z.string().uuid('Invalid instance ID format'),
  to: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164 required)'),
  type: z.literal('text'),
  content: z.string().min(1, 'Content cannot be empty').max(4096, 'Content too long (max 4096)'),
  quotedMessageId: z.string().optional(),
  mentions: z.array(z.string()).optional(),
});

export const sendMediaMessageSchema = z.object({
  instanceId: z.string().uuid('Invalid instance ID format'),
  to: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164 required)'),
  type: z.enum(['image', 'video', 'audio', 'document']),
  media: z.string().min(1, 'Media data (base64 or URL) required'),
  caption: z.string().max(1024, 'Caption too long (max 1024)').optional(),
  fileName: z.string().optional(),
  mimetype: z.string().optional(),
  quotedMessageId: z.string().optional(),
});

export const sendButtonsMessageSchema = z.object({
  instanceId: z.string().uuid('Invalid instance ID format'),
  to: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164 required)'),
  type: z.enum(['buttons']),
  title: z.string().min(1, 'Title required').max(200, 'Title too long'),
  description: z.string().max(1024, 'Description too long').optional(),
  footer: z.string().max(200, 'Footer too long').optional(),
  buttons: z.array(z.object({
    id: z.string().min(1),
    text: z.string().min(1).max(200),
    type: z.enum(['reply', 'url', 'call', 'location']),
    value: z.string().optional(),
  })).min(1).max(3, 'Maximum 3 buttons allowed'),
  quotedMessageId: z.string().optional(),
});

export const sendLocationMessageSchema = z.object({
  instanceId: z.string().uuid('Invalid instance ID format'),
  to: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164 required)'),
  type: z.enum(['location']),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  quotedMessageId: z.string().optional(),
});

export const sendTemplateMessageSchema = z.object({
  instanceId: z.string().uuid('Invalid instance ID format'),
  to: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164 required)'),
  type: z.enum(['template']),
  templateName: z.string().min(1).max(100),
  language: z.string().min(1).max(10).default('en'),
  components: z.array(z.object({
    type: z.enum(['header', 'body', 'button', 'footer']),
    sub_type: z.string().optional(),
    index: z.number().optional(),
    parameters: z.array(z.object({
      type: z.enum(['text', 'currency', 'date_time', 'image', 'video', 'document', 'location']),
      text: z.string().optional(),
      currency: z.string().optional(),
      date_time: z.number().optional(),
      image: z.object({ link: z.string().url() }).optional(),
      video: z.object({ link: z.string().url() }).optional(),
      document: z.object({ link: z.string().url() }).optional(),
      location: z.object({
        latitude: z.number(),
        longitude: z.number(),
        name: z.string().optional(),
        address: z.string().optional(),
      }).optional(),
    })).optional(),
  })).optional(),
  quotedMessageId: z.string().optional(),
});

export const sendMessageSchema = z.discriminatedUnion('type', [
  sendTextMessageSchema,
  sendMediaMessageSchema,
  sendButtonsMessageSchema,
  sendLocationMessageSchema,
  sendTemplateMessageSchema,
]);
