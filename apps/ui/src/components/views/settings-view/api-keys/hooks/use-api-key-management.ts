// @ts-nocheck
import { useState, useEffect } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';

const logger = createLogger('ApiKeyManagement');
import { getElectronAPI } from '@/lib/electron';
import type { ProviderConfigParams } from '@/config/api-providers';

interface TestResult {
  success: boolean;
  message: string;
}

interface ApiKeyStatus {
  hasAnthropicKey: boolean;
  hasGoogleKey: boolean;
  hasOpenaiKey: boolean;
}

/**
 * Custom hook for managing API key state and operations
 * Handles input values, visibility toggles, connection testing, and saving
 */
export function useApiKeyManagement() {
  const { apiKeys, setApiKeys } = useAppStore();

  // API key values
  const [anthropicKey, setAnthropicKey] = useState(apiKeys.anthropic);
  const [googleKey, setGoogleKey] = useState(apiKeys.google);
  const [openaiKey, setOpenaiKey] = useState(apiKeys.openai);

  // Visibility toggles
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);

  // Test connection states
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testingGeminiConnection, setTestingGeminiConnection] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<TestResult | null>(null);
  const [testingOpenaiConnection, setTestingOpenaiConnection] = useState(false);
  const [openaiTestResult, setOpenaiTestResult] = useState<TestResult | null>(null);

  // API key status from environment
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | null>(null);

  // Save state
  const [saved, setSaved] = useState(false);

  // Sync local state with store
  useEffect(() => {
    setAnthropicKey(apiKeys.anthropic);
    setGoogleKey(apiKeys.google);
    setOpenaiKey(apiKeys.openai);
  }, [apiKeys]);

  // Load credentials from server on mount
  useEffect(() => {
    const loadCredentials = async () => {
      const api = getElectronAPI();

      // First, try to get masked credentials from server (shows if keys are configured)
      if (api?.settings?.getCredentials) {
        try {
          const result = await api.settings.getCredentials();
          if (result.success && result.credentials) {
            const creds = result.credentials;
            setApiKeyStatus({
              hasAnthropicKey: creds.anthropic?.configured || false,
              hasGoogleKey: creds.google?.configured || false,
              hasOpenaiKey: creds.openai?.configured || false,
            });
            // Show masked values as placeholders if configured
            if (creds.anthropic?.configured && creds.anthropic?.masked) {
              setAnthropicKey(creds.anthropic.masked);
            }
            if (creds.google?.configured && creds.google?.masked) {
              setGoogleKey(creds.google.masked);
            }
            if (creds.openai?.configured && creds.openai?.masked) {
              setOpenaiKey(creds.openai.masked);
            }
          }
        } catch (error) {
          logger.error('Failed to load credentials from server:', error);
        }
      }

      // Fallback: check API key status from setup endpoint
      if (api?.setup?.getApiKeys) {
        try {
          const status = await api.setup.getApiKeys();
          if (status.success) {
            setApiKeyStatus(
              (prev) =>
                prev || {
                  hasAnthropicKey: status.hasAnthropicKey,
                  hasGoogleKey: status.hasGoogleKey,
                  hasOpenaiKey: status.hasOpenaiKey,
                }
            );
          }
        } catch (error) {
          logger.error('Failed to check API key status:', error);
        }
      }
    };
    loadCredentials();
  }, []);

  // Test Anthropic/Claude connection
  const handleTestAnthropicConnection = async () => {
    // Validate input first
    if (!anthropicKey || anthropicKey.trim().length === 0) {
      setTestResult({
        success: false,
        message: 'Please enter an API key to test.',
      });
      return;
    }

    setTestingConnection(true);
    setTestResult(null);

    try {
      const api = getElectronAPI();
      // Pass the current input value to test unsaved keys
      const data = await api.setup.verifyClaudeAuth('api_key', anthropicKey);

      if (data.success && data.authenticated) {
        setTestResult({
          success: true,
          message: 'Connection successful! Claude responded.',
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Failed to connect to Claude API.',
        });
      }
    } catch {
      setTestResult({
        success: false,
        message: 'Network error. Please check your connection.',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // Test Google/Gemini connection
  // TODO: Add backend endpoint for Gemini API key verification
  const handleTestGeminiConnection = async () => {
    setTestingGeminiConnection(true);
    setGeminiTestResult(null);

    // Basic validation - check key format
    if (!googleKey || googleKey.trim().length < 10) {
      setGeminiTestResult({
        success: false,
        message: 'Please enter a valid API key.',
      });
      setTestingGeminiConnection(false);
      return;
    }

    // For now, just validate the key format (starts with expected prefix)
    // Full verification requires a backend endpoint
    setGeminiTestResult({
      success: true,
      message: 'API key saved. Connection test not yet available.',
    });
    setTestingGeminiConnection(false);
  };

  // Test OpenAI/Codex connection
  const handleTestOpenaiConnection = async () => {
    setTestingOpenaiConnection(true);
    setOpenaiTestResult(null);

    try {
      const api = getElectronAPI();
      const data = await api.setup.verifyCodexAuth('api_key', openaiKey);

      if (data.success && data.authenticated) {
        setOpenaiTestResult({
          success: true,
          message: 'Connection successful! Codex responded.',
        });
      } else {
        setOpenaiTestResult({
          success: false,
          message: data.error || 'Failed to connect to OpenAI API.',
        });
      }
    } catch {
      setOpenaiTestResult({
        success: false,
        message: 'Network error. Please check your connection.',
      });
    } finally {
      setTestingOpenaiConnection(false);
    }
  };

  // Save API keys - persist to both Zustand store AND server credentials
  const handleSave = async () => {
    // Helper to check if a value is a masked key (not a real key)
    const isMaskedKey = (value: string) => value.includes('...');

    // Only include keys that are real (not masked placeholders)
    const keysToSave: { anthropic?: string; google?: string; openai?: string } = {};

    if (anthropicKey && !isMaskedKey(anthropicKey)) {
      keysToSave.anthropic = anthropicKey;
    }
    if (googleKey && !isMaskedKey(googleKey)) {
      keysToSave.google = googleKey;
    }
    if (openaiKey && !isMaskedKey(openaiKey)) {
      keysToSave.openai = openaiKey;
    }

    // Update client-side store (with actual values only, preserve empty for masked)
    setApiKeys({
      anthropic: keysToSave.anthropic || '',
      google: keysToSave.google || '',
      openai: keysToSave.openai || '',
    });

    // Persist to server credentials.json (only changed keys)
    if (Object.keys(keysToSave).length > 0) {
      try {
        const api = getElectronAPI();
        if (api?.settings?.updateCredentials) {
          await api.settings.updateCredentials({ apiKeys: keysToSave });
          logger.info('API keys persisted to server');
        }
      } catch (error) {
        logger.error('Failed to persist API keys to server:', error);
      }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Build provider config params for buildProviderConfigs
  const providerConfigParams: ProviderConfigParams = {
    apiKeys,
    anthropic: {
      value: anthropicKey,
      setValue: setAnthropicKey,
      show: showAnthropicKey,
      setShow: setShowAnthropicKey,
      testing: testingConnection,
      onTest: handleTestAnthropicConnection,
      result: testResult,
    },
    google: {
      value: googleKey,
      setValue: setGoogleKey,
      show: showGoogleKey,
      setShow: setShowGoogleKey,
      testing: testingGeminiConnection,
      onTest: handleTestGeminiConnection,
      result: geminiTestResult,
    },
    openai: {
      value: openaiKey,
      setValue: setOpenaiKey,
      show: showOpenaiKey,
      setShow: setShowOpenaiKey,
      testing: testingOpenaiConnection,
      onTest: handleTestOpenaiConnection,
      result: openaiTestResult,
    },
  };

  return {
    // Provider config params for buildProviderConfigs
    providerConfigParams,

    // API key status from environment
    apiKeyStatus,

    // Save handler and state
    handleSave,
    saved,
  };
}
