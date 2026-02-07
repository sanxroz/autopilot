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
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deviceCodeRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      if (typeof pollingRef.current === 'object' && 'clear' in pollingRef.current) {
        (pollingRef.current as any).clear();
      } else {
        clearInterval(pollingRef.current as any);
      }
      pollingRef.current = null;
    }
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      console.log('[OAuth] Checking stored credentials...');
      const result = await invoke<OAuthStatus>('oauth_get_status');
      console.log('[OAuth] Status check result:', JSON.stringify(result));
      console.log('[OAuth] authenticated:', result.authenticated, 'username:', result.username);
      setOAuthStatus(result);
      if (result.authenticated) {
        console.log('[OAuth] User is authenticated, setting status to success');
        setStatus('success');
      } else {
        console.log('[OAuth] User is NOT authenticated');
      }
    } catch (e) {
      console.error('[OAuth] Failed to check status:', e);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    return () => stopPolling();
  }, [checkStatus, stopPolling]);

  const pollForToken = useCallback((deviceCode: string, interval: number) => {
    let pollInterval = (interval || 5) * 1000;
    let completed = false;
    let currentTimeoutId: ReturnType<typeof setTimeout> | null = null;
    
    const schedulePoll = () => {
      if (completed) return;
      currentTimeoutId = setTimeout(poll, pollInterval);
    };
    
    const poll = async () => {
      if (completed) return;
      
      try {
        console.log('[OAuth] Polling for token...');
        const result = await invoke<OAuthStatus>('oauth_poll_for_token', { deviceCode });
        console.log('[OAuth] Success! Got result:', result);
        
        if (completed) return;
        completed = true;
        
        if (currentTimeoutId) {
          clearTimeout(currentTimeoutId);
          currentTimeoutId = null;
        }
        pollingRef.current = null;
        
        setOAuthStatus(result);
        setStatus('success');
        setUserCode(null);
        setVerificationUri(null);
      } catch (e) {
        if (completed) return;
        
        const errorMsg = String(e);
        
        if (errorMsg.includes('authorization_pending')) {
          console.log('[OAuth] Waiting for user authorization...');
          schedulePoll();
          return;
        }
        if (errorMsg.includes('slow_down')) {
          pollInterval = Math.min(pollInterval + 5000, 30000);
          console.log('[OAuth] Slowing down, new interval:', pollInterval / 1000, 's');
          schedulePoll();
          return;
        }
        
        console.error('[OAuth] Fatal error:', errorMsg);
        completed = true;
        if (currentTimeoutId) {
          clearTimeout(currentTimeoutId);
        }
        pollingRef.current = null;
        setStatus('error');
        setError(errorMsg);
      }
    };

    pollingRef.current = { clear: () => { completed = true; if (currentTimeoutId) clearTimeout(currentTimeoutId); } } as any;
    poll();
  }, []);

  const startLogin = useCallback(async () => {
    try {
      setStatus('pending');
      setError(null);

      const response = await invoke<DeviceFlowResponse>('oauth_start_device_flow');

      deviceCodeRef.current = response.device_code;
      setUserCode(response.user_code);
      setVerificationUri(response.verification_uri);

      await open(response.verification_uri);

      setStatus('polling');
      pollForToken(response.device_code, response.interval);
    } catch (e) {
      setStatus('error');
      setError(String(e));
    }
  }, [pollForToken]);

  const logout = useCallback(async () => {
    try {
      stopPolling();
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
