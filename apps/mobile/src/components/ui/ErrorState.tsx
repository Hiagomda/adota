import { Button } from './Button';
import { StateLayout } from './StateLayout';

export interface ErrorStateProps {
  title?: string;
  body?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Row version for a block inside a screen. */
  compact?: boolean;
}

/** Human error message in pt-BR with a retry action. */
export function ErrorState({
  title = 'Algo deu errado',
  body = 'Não consegui carregar agora. Confira sua conexão e tente de novo.',
  onRetry,
  retryLabel = 'Tentar de novo',
  compact = false,
}: ErrorStateProps) {
  return (
    <StateLayout
      pose="sad"
      title={title}
      body={body}
      compact={compact}
      alert
      action={onRetry ? <Button title={retryLabel} icon="refresh-cw" onPress={onRetry} /> : undefined}
    />
  );
}
