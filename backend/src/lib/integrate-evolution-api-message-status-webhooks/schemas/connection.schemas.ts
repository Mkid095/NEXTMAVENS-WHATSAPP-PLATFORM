/**
 * Connection and QR Code Event Schemas
 */

/**
 * CONNECTION_UPDATE event schema
 */
export const connectionUpdateSchema = {
  type: 'object',
  required: ['instanceId', 'status'],
  properties: {
    instanceId: { type: 'string' },
    status: {
      type: 'string',
      enum: [
        'connecting',
        'open',
        'close',
        'disconnected',
        'unresponsive',
      ],
    },
    state: { type: 'string' },
  },
};

/**
 * QRCODE_UPDATED event schema
 */
export const qrCodeUpdateSchema = {
  type: 'object',
  required: ['instanceId', 'status', 'qrCode'],
  properties: {
    instanceId: { type: 'string' },
    status: {
      type: 'string',
      enum: [
        'connection',
        'authed',
        'qrcode',
      ],
    },
    qrCode: { type: 'string' },
  },
};

/**
 * SEND_MESSAGE event schema
 */
export const sendMessageSchema = {
  type: 'object',
  required: ['id', 'to', 'type'],
  properties: {
    id: { type: 'string' },
    to: { type: 'string' },
    body: { type: 'string', nullable: true },
    base64: { type: 'string', nullable: true },
    type: {
      type: 'string',
      enum: [
        'text',
        'image',
        'document',
        'video',
        'audio',
        'sticker',
        'location',
        'contacts',
        'button',
        'button_reply',
        'list',
      ],
    },
    mediaUrl: { type: 'string', nullable: true },
    fileName: { type: 'string', nullable: true },
    fileSize: { type: 'integer', nullable: true },
    mimeType: { type: 'string', nullable: true },
  },
};
