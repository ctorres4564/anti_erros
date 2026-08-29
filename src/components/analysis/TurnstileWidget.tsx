'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';

type TurnstileStatus = 'loading' | 'verified' | 'failed';

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'error-callback': () => void;
      'expired-callback': () => void;
      theme: 'auto';
    }
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

interface TurnstileWidgetProps {
  onChange: (token: string | undefined, status: TurnstileStatus) => void;
  resetSignal?: number;
}

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const isLocalBypassAllowed = process.env.NODE_ENV !== 'production';

export function TurnstileWidget({ onChange, resetSignal = 0 }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<TurnstileStatus>(siteKey ? 'loading' : isLocalBypassAllowed ? 'verified' : 'failed');

  const updateStatus = useCallback(
    (token: string | undefined, nextStatus: TurnstileStatus) => {
      setStatus(nextStatus);
      onChange(token, nextStatus);
    },
    [onChange]
  );

  const renderWidget = useCallback(() => {
    if (!siteKey || !containerRef.current || !window.turnstile || widgetIdRef.current) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme: 'auto',
      callback: (token) => updateStatus(token, 'verified'),
      'error-callback': () => updateStatus(undefined, 'failed'),
      'expired-callback': () => updateStatus(undefined, 'failed'),
    });
  }, [updateStatus]);

  useEffect(() => {
    if (!siteKey) return;

    renderWidget();
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget, updateStatus]);

  useEffect(() => {
    if (resetSignal === 0 || !widgetIdRef.current || !window.turnstile) return;
    window.turnstile.reset(widgetIdRef.current);
    updateStatus(undefined, 'loading');
  }, [resetSignal, updateStatus]);

  const retry = () => {
    if (!siteKey) {
      updateStatus(undefined, isLocalBypassAllowed ? 'verified' : 'failed');
      return;
    }

    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      updateStatus(undefined, 'loading');
      return;
    }

    setStatus('loading');
    renderWidget();
  };

  return (
    <div className="space-y-2 rounded-xl border bg-muted/30 p-4" aria-live="polite">
      {siteKey ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={renderWidget}
          onError={() => updateStatus(undefined, 'failed')}
        />
      ) : null}

      <div ref={containerRef} className="min-h-0 overflow-hidden" />

      {status === 'loading' ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Verificando segurança…
        </p>
      ) : null}

      {status === 'verified' ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {siteKey ? 'Verificação concluída.' : 'Verificação local habilitada.'}
        </p>
      ) : null}

      {status === 'failed' ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            Não foi possível concluir a verificação.
          </p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Tentar novamente
          </button>
        </div>
      ) : null}
    </div>
  );
}
