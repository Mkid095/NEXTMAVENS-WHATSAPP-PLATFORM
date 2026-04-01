/**
 * Message Event Schemas
 */

/**
 * MESSAGES_UPSERT event schema
 */
export const messageUpsertSchema = {
  type: 'object',
  required: ['id', 'from', 'to', 'type'],
  properties: {
    id: { type: 'string' },
    from: { type: 'string' },
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
    thumbnail: { type: 'string', nullable: true },
    thumbnailUrl: { type: 'string', nullable: true },
    'fromMe': { type: 'boolean' },
    'toMe': { type: 'boolean' },
    ack: { type: 'integer' },
    state: { type: 'string' },
    dest: { type: 'string' },
    self: { type: 'string' },
    isForwarded: { type: 'boolean' },
    isGroupMsg: { type: 'boolean' },
    broadcast: { type: 'boolean' },
    repliedMsg: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        from: { type: 'string' },
        body: { type: 'string' },
      },
    },
    contextInfo: {
      type: 'object',
      properties: {
        stanzaId: { type: 'string' },
        participant: { type: 'string' },
        quotedMessage: { type: 'object' },
        mentionedJidList: { type: 'array', items: { type: 'string' } },
        groupMention: { type: 'boolean' },
      },
    },
    senderContactName: { type: 'string' },
    quotedBody: { type: 'string' },
    stream: { type: 'string' },
    references: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'object' },
          message: { type: 'object' },
        },
      },
    },
    deviceId: { type: 'string' },
  },
};

/**
 * MESSAGES_UPDATE event schema
 */
export const messageUpdateSchema = {
  type: 'object',
  required: ['id', 'from', 'to', 'type'],
  properties: {
    id: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    body: { type: 'string', nullable: true },
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
  },
};

/**
 * MESSAGES_DELETE event schema
 */
export const messageDeleteSchema = {
  type: 'object',
  required: ['id', 'from', 'to'],
  properties: {
    id: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    'fromMe': { type: 'boolean' },
  },
};
