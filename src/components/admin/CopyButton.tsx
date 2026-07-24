'use client';

import { useState } from 'react';

export function CopyButton({ text, label = 'Копировать' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard недоступен */
        }
      }}
    >
      {copied ? '✓ Скопировано' : label}
    </button>
  );
}
