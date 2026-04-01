/**
 * Environment Configuration
 *
 * Centralized configuration with validation and defaults.
 */

import { z } from 'zod';

const configSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.string().default('3000'),
  LOG_LEVEL: z.string().default('info'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379'),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),

  // Evolution API
  EVOLUTION_API_URL: z.string().url(),
  EVOLUTION_API_KEY: z.string(),
  EVOLUTION_WEBHOOK_SECRET: z.string(),
  EVOLUTION_WEBHOOK_URL: z.string().optional(),

  // CORS
  CORS_ORIGIN: z.string().default('*'),

  // App
  APP_URL: z.string().url(),

  // Optional services
  PAYSTACK_SECRET_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

type Config = z.infer<typeof configSchema>;

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  // Load from .env file if present (only in non-production)
  if (process.env.NODE_ENV !== 'production') {
    try {
      const fs = require('fs');
      const path = require('path');
      const dotenvPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(dotenvPath)) {
        const content = fs.readFileSync(dotenvPath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length) {
            env[key.trim()] = valueParts.join('=').trim().replace(/^['"]|['"]$/g, '');
          }
        }
      }
    } catch (e) {
      console.warn('[Config] Failed to load .env file:', e.message);
    }
  }

  // Override with process.env
  for (const key in process.env) {
    env[key] = process.env[key]!;
  }

  return env;
}

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const rawEnv = loadEnv();

  try {
    const validated = configSchema.parse(rawEnv);
    cachedConfig = validated;
    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[Config] Environment validation failed:');
      error.errors.forEach(err => {
        console.error(`  ${err.path.join('.')}: ${err.message}`);
      });
      throw new Error('Invalid environment configuration');
    }
    throw error;
  }
}

export function getSocketPath(): string {
  const config = getConfig();
  const protocol = config.APP_URL.startsWith('https') ? 'wss' : 'ws';
  const url = new URL(config.APP_URL);
  return `${protocol}://${url.host}/socket.io`;
}
