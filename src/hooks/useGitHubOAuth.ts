import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import type { DeviceFlowResponse, OAuthStatus, OAuthFlowState } from '../types/github';

interface UseGitHubOAuthReturn {
  status: OAuthFlowState;
  oauthStatus: OAuthStatus | null;
  userCode: string | null;
  verificationUri: string | null;
  error: string | null;
  startLogin: () => Promise<void>;
  logout: () => Promise<void>;
  checkStatus: () => Promise<void>;
}

export function useGitHubOAuth(): UseGitHubOAuthReturn {
  const [status, setStatus] = useState<OAuthFlowState>('idle');
  const [oauthStatus, setOAuthStatus] = useState<OAuthStatus | null>(null);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [verificationUri, setVerificationUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<{ clear: () => void } | null>(null);
  const deviceCodeRef = useRef<string | null>(null);
  const loginInProgressRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      pollingRef.current.clear();
      pollingRef.current = null;
    }
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const result = await invoke<OAuthStatus>('oauth_get_status');
      setOAuthStatus(result);
      if (result.authenticated) {
        setStatus('success');
      }
    } catch {}
  }, []);

  useEffect(() => {
    checkStatus();
    return () => stopPolling();
  }, [checkStatus, stopPolling]);

  const pollForToken = useCallback((deviceCode: string, interval: number, expiresIn: number) => {
    let pollInterval = (interval || 5) * 1000;
    let completed = false;
    let currentTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let expirationTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      completed = true;
      if (currentTimeoutId) clearTimeout(currentTimeoutId);
      if (expirationTimeoutId) clearTimeout(expirationTimeoutId);
      pollingRef.current = null;
    };
    
    const schedulePoll = () => {
      if (completed) return;
      currentTimeoutId = setTimeout(poll, pollInterval);
    };

    if (expiresIn > 0) {
      expirationTimeoutId = setTimeout(() => {
        if (completed) return;
        cleanup();
        loginInProgressRef.current = false;
        setStatus('error');
        setError('Device code expired. Please try again.');
      }, expiresIn * 1000);
    }
    
    const poll = async () => {
      if (completed) return;
      
      try {
        const result = await invoke<OAuthStatus>('oauth_poll_for_token', { deviceCode });
        
        if (completed) return;
        cleanup();
        loginInProgressRef.current = false;
        
        setOAuthStatus(result);
        setStatus('success');
        setUserCode(null);
        setVerificationUri(null);
      } catch (e) {
        if (completed) return;
        
        const errorMsg = String(e);
        
        if (errorMsg.includes('authorization_pending')) {
          schedulePoll();
          return;
        }
        if (errorMsg.includes('slow_down')) {
          pollInterval = Math.min(pollInterval + 5000, 30000);
          schedulePoll();
          return;
        }
        
        cleanup();
        loginInProgressRef.current = false;
        setStatus('error');
        setError(errorMsg);
      }
    };

    pollingRef.current = { clear: cleanup };
    poll();
  }, []);

  const startLogin = useCallback(async () => {
    if (loginInProgressRef.current) return;
    loginInProgressRef.current = true;

    try {
      stopPolling();
      setStatus('pending');
      setError(null);

      const response = await invoke<DeviceFlowResponse>('oauth_start_device_flow');

      deviceCodeRef.current = response.device_code;
      setUserCode(response.user_code);
      setVerificationUri(response.verification_uri);

      await open(response.verification_uri);

      setStatus('polling');
      pollForToken(response.device_code, response.interval, response.expires_in);
    } catch (e) {
      loginInProgressRef.current = false;
      setStatus('error');
      setError(String(e));
    }
  }, [pollForToken, stopPolling]);

  const logout = useCallback(async () => {
    try {
      stopPolling();
      loginInProgressRef.current = false;
      await invoke('oauth_logout');
      setOAuthStatus({ authenticated: false, username: null, avatar_url: null });
      setStatus('idle');
      setUserCode(null);
      setVerificationUri(null);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [stopPolling]);

  return {
    status,
    oauthStatus,
    userCode,
    verificationUri,
    error,
    startLogin,
    logout,
    checkStatus,
  };
}
