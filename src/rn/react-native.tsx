import React, { forwardRef, CSSProperties, ReactNode } from 'react';

export type ViewStyle = CSSProperties & {
  paddingHorizontal?: number | string;
  paddingVertical?: number | string;
  marginHorizontal?: number | string;
  marginVertical?: number | string;
  elevation?: number;
};

export type TextStyle = ViewStyle & {
  fontVariant?: string[];
  includeFontPadding?: boolean;
};

export type ImageStyle = ViewStyle;
export type StyleProp<T> = T | (T | null | undefined | false)[] | null | undefined | false;

function flattenStyle(style?: StyleProp<ViewStyle | TextStyle>): CSSProperties {
  if (!style) return {};
  const list = Array.isArray(style) ? style : [style];
  const merged: Record<string, unknown> = {};
  for (const item of list) {
    if (Array.isArray(item)) {
      Object.assign(merged, flattenStyle(item));
    } else if (item && typeof item === 'object') {
      Object.assign(merged, item);
    }
  }
  if (merged.paddingHorizontal !== undefined) {
    merged.paddingLeft = merged.paddingHorizontal;
    merged.paddingRight = merged.paddingHorizontal;
    delete merged.paddingHorizontal;
  }
  if (merged.paddingVertical !== undefined) {
    merged.paddingTop = merged.paddingVertical;
    merged.paddingBottom = merged.paddingVertical;
    delete merged.paddingVertical;
  }
  if (merged.marginHorizontal !== undefined) {
    merged.marginLeft = merged.marginHorizontal;
    merged.marginRight = merged.marginHorizontal;
    delete merged.marginHorizontal;
  }
  if (merged.marginVertical !== undefined) {
    merged.marginTop = merged.marginVertical;
    merged.marginBottom = merged.marginVertical;
    delete merged.marginVertical;
  }
  delete merged.elevation;
  delete merged.includeFontPadding;
  return merged as CSSProperties;
}

export const StyleSheet = {
  create<T extends Record<string, ViewStyle | TextStyle | ImageStyle>>(styles: T): T {
    return styles;
  },
  flatten: flattenStyle,
  hairlineWidth: 1,
  absoluteFillObject: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
};

export interface ViewProps {
  style?: StyleProp<ViewStyle>;
  className?: string;
  children?: ReactNode;
  onLayout?: (e: { nativeEvent: { layout: { width: number; height: number; x: number; y: number } } }) => void;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  testID?: string;
}

export const View = forwardRef<HTMLDivElement, ViewProps>(({ style, className = '', children, pointerEvents, testID }, ref) => {
  const baseStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    position: 'relative',
    ...(pointerEvents ? { pointerEvents: pointerEvents === 'box-none' ? 'none' : 'auto' } : {}),
    ...flattenStyle(style),
  };
  return (
    <div ref={ref} style={baseStyle} className={className} data-testid={testID}>
      {children}
    </div>
  );
});
View.displayName = 'View';

export const SafeAreaView = forwardRef<HTMLDivElement, ViewProps>(({ style, className = '', children }, ref) => (
  <View ref={ref} style={[{ flex: 1 }, flattenStyle(style)]} className={className}>
    {children}
  </View>
));
SafeAreaView.displayName = 'SafeAreaView';

export interface TextProps {
  style?: StyleProp<TextStyle>;
  className?: string;
  children?: ReactNode;
  numberOfLines?: number;
  onPress?: () => void;
  selectable?: boolean;
}

export const Text = forwardRef<HTMLSpanElement, TextProps>(
  ({ style, className = '', children, numberOfLines, onPress, selectable = false }, ref) => {
    const lineClampStyle: CSSProperties =
      numberOfLines === 1
        ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
        : numberOfLines && numberOfLines > 1
        ? {
            display: '-webkit-box',
            WebkitLineClamp: numberOfLines,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }
        : {};
    return (
      <span
        ref={ref}
        onClick={onPress}
        style={{
          userSelect: selectable ? 'text' : 'none',
          ...lineClampStyle,
          ...flattenStyle(style),
        }}
        className={className}
      >
        {children}
      </span>
    );
  }
);
Text.displayName = 'Text';

export interface PressableProps {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  className?: string;
  children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
}

export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(
  ({ style, className = '', children, onPress, disabled }, ref) => {
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false }) : style;
    const resolvedChildren = typeof children === 'function' ? children({ pressed: false }) : children;
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={onPress}
        style={{
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: 'transparent',
          border: 'none',
          padding: 0,
          textAlign: 'left',
          ...flattenStyle(resolvedStyle),
        }}
        className={className}
      >
        {resolvedChildren}
      </button>
    );
  }
);
Pressable.displayName = 'Pressable';

export const TouchableOpacity = Pressable;

export interface ScrollViewProps extends ViewProps {
  horizontal?: boolean;
  showsVerticalScrollIndicator?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export const ScrollView = forwardRef<HTMLDivElement, ScrollViewProps>(
  ({ style, contentContainerStyle, className = '', horizontal, children }, ref) => (
    <div
      ref={ref}
      style={{
        display: 'flex',
        flexDirection: horizontal ? 'row' : 'column',
        overflowX: horizontal ? 'auto' : 'hidden',
        overflowY: horizontal ? 'hidden' : 'auto',
        ...flattenStyle(style),
        ...flattenStyle(contentContainerStyle),
      }}
      className={className}
    >
      {children}
    </div>
  )
);
ScrollView.displayName = 'ScrollView';

export interface ModalProps {
  visible?: boolean;
  transparent?: boolean;
  animationType?: 'none' | 'slide' | 'fade';
  onRequestClose?: () => void;
  children?: ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ visible = false, transparent = true, children }) => {
  if (!visible) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: transparent ? 'rgba(0,0,0,0.82)' : '#070b13',
      }}
    >
      {children}
    </div>
  );
};

export interface SwitchProps {
  value?: boolean;
  onValueChange?: (val: boolean) => void;
  trackColor?: { false?: string; true?: string };
  thumbColor?: string;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({
  value = false,
  onValueChange,
  trackColor = { false: '#1e293b', true: '#f5b82e' },
  thumbColor = '#070b13',
  disabled = false,
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => onValueChange?.(!value)}
    style={{
      width: 44,
      height: 24,
      borderRadius: 999,
      backgroundColor: value ? trackColor.true || '#f5b82e' : trackColor.false || '#1e293b',
      border: '1px solid rgba(255,255,255,0.14)',
      padding: 2,
      display: 'flex',
      alignItems: 'center',
      justifyContent: value ? 'flex-end' : 'flex-start',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.18s ease',
    }}
  >
    <span
      style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        backgroundColor: value ? thumbColor : '#94a3b8',
        display: 'block',
      }}
    />
  </button>
);

export const StatusBar: React.FC<{ barStyle?: 'light-content' | 'dark-content'; backgroundColor?: string }> = () => null;

export const Dimensions = {
  get(dim: 'window' | 'screen') {
    if (typeof window === 'undefined') {
      return { width: 412, height: 915, scale: 2.75, fontScale: 1 };
    }
    return {
      width: dim === 'screen' ? window.screen.width : window.innerWidth,
      height: dim === 'screen' ? window.screen.height : window.innerHeight,
      scale: window.devicePixelRatio || 2,
      fontScale: 1,
    };
  },
};

export const Platform = {
  OS: (typeof window !== 'undefined' && window.MasterstrokeNative?.isNativeAndroidApp?.() ? 'android' : 'web') as 'android' | 'ios' | 'web',
  Version: 35,
  select<T>(specifics: { android?: T; ios?: T; web?: T; default?: T }): T | undefined {
    const os = this.OS;
    return specifics[os] ?? specifics.android ?? specifics.default;
  },
};

export const Vibration = {
  vibrate(pattern: number | number[] = 15) {
    try {
      const ms = Array.isArray(pattern) ? pattern[0] || 15 : pattern;
      if (typeof window !== 'undefined' && window.MasterstrokeNative?.triggerHapticTap) {
        window.MasterstrokeNative.triggerHapticTap(ms);
      } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignore
    }
  },
  cancel() {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(0);
      }
    } catch {
      // Ignore
    }
  },
};

export const BackHandler = {
  addEventListener(_eventName: 'hardwareBackPress', handler: () => boolean) {
    const listener = (e: PopStateEvent) => {
      if (handler()) {
        e.preventDefault();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', listener);
    }
    return {
      remove() {
        if (typeof window !== 'undefined') {
          window.removeEventListener('popstate', listener);
        }
      },
    };
  },
};

export const AppRegistry = {
  registerComponent(appKey: string, componentProvider: () => React.ComponentType) {
    return { appKey, componentProvider };
  },
};
