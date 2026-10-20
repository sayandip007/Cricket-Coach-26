import { Vibration } from './react-native';

export enum ImpactFeedbackStyle {
  Light = 'light',
  Medium = 'medium',
  Heavy = 'heavy',
}

export enum NotificationFeedbackType {
  Success = 'success',
  Warning = 'warning',
  Error = 'error',
}

export async function impactAsync(style: ImpactFeedbackStyle = ImpactFeedbackStyle.Light): Promise<void> {
  const ms = style === ImpactFeedbackStyle.Heavy ? 35 : style === ImpactFeedbackStyle.Medium ? 20 : 10;
  Vibration.vibrate(ms);
}

export async function notificationAsync(type: NotificationFeedbackType = NotificationFeedbackType.Success): Promise<void> {
  const ms = type === NotificationFeedbackType.Error ? 50 : type === NotificationFeedbackType.Warning ? 30 : 18;
  Vibration.vibrate(ms);
}

export async function selectionAsync(): Promise<void> {
  Vibration.vibrate(8);
}
