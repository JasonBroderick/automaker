/**
 * POST /store-api-key endpoint - Store API key
 */

import type { Request, Response } from 'express';
import { setApiKey, persistApiKeyToEnv, getErrorMessage, logError } from '../common.js';
import { createLogger } from '@automaker/utils';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('Setup');

export function createStoreApiKeyHandler(settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { provider, apiKey } = req.body as {
        provider: string;
        apiKey: string;
      };

      if (!provider || !apiKey) {
        res.status(400).json({ success: false, error: 'provider and apiKey required' });
        return;
      }

      const providerEnvMap: Record<string, string> = {
        anthropic: 'ANTHROPIC_API_KEY',
        anthropic_oauth_token: 'ANTHROPIC_API_KEY',
        openai: 'OPENAI_API_KEY',
      };
      const envKey = providerEnvMap[provider];
      if (!envKey) {
        res.status(400).json({
          success: false,
          error: `Unsupported provider: ${provider}. Only anthropic and openai are supported.`,
        });
        return;
      }

      // Store in memory cache and process.env
      setApiKey(provider, apiKey);
      process.env[envKey] = apiKey;

      // Persist to .env file
      await persistApiKeyToEnv(envKey, apiKey);

      // Also persist to credentials.json via SettingsService
      if (settingsService) {
        const credentialKey = provider === 'anthropic_oauth_token' ? 'anthropic' : provider;
        // Get current credentials and update only the changed key
        const currentCredentials = await settingsService.getCredentials();
        await settingsService.updateCredentials({
          apiKeys: {
            ...currentCredentials.apiKeys,
            [credentialKey]: apiKey,
          },
        });
        logger.info(`[Setup] Stored API key in credentials.json for ${credentialKey}`);
      }

      logger.info(`[Setup] Stored API key as ${envKey}`);

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Store API key failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
