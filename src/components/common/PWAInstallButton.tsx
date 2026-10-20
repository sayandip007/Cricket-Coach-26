import React from 'react';
import { useOnlineStatus } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'banner' | 'compact';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = () => {
  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-amber-500 px-3.5 py-1 text-[11px] font-mono font-bold text-black shadow-lg">
      <span className="h-2 w-2 rounded-full bg-black animate-pulse" />
      OFFLINE MODE — LOCAL CACHE ACTIVE
    </div>
  );
};

