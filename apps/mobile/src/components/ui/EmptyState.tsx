import type { MascotPose } from '../../mascot';
import { Button } from './Button';
import { StateLayout } from './StateLayout';

export interface EmptyStateProps {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  pose?: MascotPose;
  /** Row version for a block inside a screen. */
  compact?: boolean;
}

/** Friendly empty screen: mascot, a short text and (optionally) one action. */
export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  pose = 'sad',
  compact = false,
}: EmptyStateProps) {
  return (
    <StateLayout
      pose={pose}
      title={title}
      body={body}
      compact={compact}
      action={
        actionLabel && onAction ? (
          <Button title={actionLabel} variant="secondary" onPress={onAction} />
        ) : undefined
      }
    />
  );
}
