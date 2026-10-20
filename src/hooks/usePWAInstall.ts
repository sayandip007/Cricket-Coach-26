import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface CricketCoachAndroidBridge {
  isNativeAndroidApp?: () => boolean;
  getDevicePlatform?: () => string;
  saveSecureData?: (key: string, value: string) => void;
  loadSecureData?: (key: string) => string | null;
  saveCoachProfile?: (name: string, wins: number, teamId: string) => void;
  triggerHapticTap?: (durationMs?: number) => void;
  scanReceiptBase64?: (base64Image: string, callbackJsFn: string) => void;
}

export type MasterstrokeAndroidBridge = CricketCoachAndroidBridge;

declare global {
  interface Window {
    CricketCoachNative?: CricketCoachAndroidBridge;
    MasterstrokeNative?: CricketCoachAndroidBridge;
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroidDevice, setIsAndroidDevice] = useState(false);
  const [isNativeAndroidApk, setIsNativeAndroidApk] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const nativeBridge = window.CricketCoachNative || window.MasterstrokeNative;
    const nativeApk = Boolean(nativeBridge?.isNativeAndroidApp?.());
    setIsNativeAndroidApk(nativeApk);

    const isStandalone =
      nativeApk ||
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    setIsAndroidDevice(/android/.test(userAgent));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    isAndroidDevice,
    isNativeAndroidApk,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
