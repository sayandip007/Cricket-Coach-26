/**
 * Standard @react-native-async-storage/async-storage module backed by Android EncryptedSharedPreferences
 * (via window.MasterstrokeNative) with automatic LocalStorage fallback.
 */
const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const native = typeof window !== 'undefined' ? (window.CricketCoachNative || window.MasterstrokeNative) : null;
      if (native?.loadSecureData) {
        const nativeVal = native.loadSecureData(key);
        if (nativeVal !== null && nativeVal !== undefined) return nativeVal;
      }
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch {
      // Ignore storage errors
    }
    return null;
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      const native = typeof window !== 'undefined' ? (window.CricketCoachNative || window.MasterstrokeNative) : null;
      if (native?.saveSecureData) {
        native.saveSecureData(key, value);
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch {
      // Ignore storage errors
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch {
      // Ignore storage errors
    }
  },
};

export default AsyncStorage;
