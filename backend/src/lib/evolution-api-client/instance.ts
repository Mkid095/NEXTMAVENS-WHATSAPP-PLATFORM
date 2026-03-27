import { createEvolutionClient, EvolutionApiClient } from './index';
import * as dotenv from 'dotenv';

dotenv.config();

let client: EvolutionApiClient | null = null;

export function getEvolutionClient(): EvolutionApiClient {
  if (!client) {
    const baseUrl = process.env.EVOLUTION_API_URL || 'http://localhost:3001';
    const apiKey = process.env.EVOLUTION_API_KEY;

    if (!apiKey) {
      throw new Error('EVOLUTION_API_KEY environment variable is required');
    }

    client = createEvolutionClient({
      baseUrl,
      apiKey,
      timeout: 30000,
    });
  }

  return client;
}

export async function initializeEvolutionClient(): Promise<EvolutionApiClient> {
  const evo = getEvolutionClient();

  // Test connection by listing instances
  try {
    await evo.listInstances();
    console.log('[EvolutionClient] Connected to Evolution API');
  } catch (error) {
    console.error('[EvolutionClient] Failed to connect to Evolution API:', error);
    throw error;
  }

  return evo;
}
