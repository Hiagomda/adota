import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../../theme';
import { AppText, Avatar, Badge } from '../ui';

export interface ProfileStat {
  value: number;
  label: string;
}

export interface ProfileHeaderProps {
  name: string;
  avatarUrl?: string | null;
  verified?: boolean;
  /** Linha cinza embaixo do nome: cidade, nível de voluntário. */
  subtitle?: string | null;
  /** Até três números ao lado da foto, como publicações e seguidores. */
  stats: ProfileStat[];
  /** Botões embaixo do cabeçalho (seguir, editar, rede). */
  children?: ReactNode;
}

function compact(value: number): string {
  if (value >= 10_000) return `${Math.round(value / 1000)} mil`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace('.', ',')} mil`;
  return String(value);
}

/**
 * Cabeçalho de perfil no estilo do Instagram: foto grande à esquerda e os números ao lado,
 * nome e uma linha de contexto embaixo, e os botões em fila.
 */
export function ProfileHeader({
  name,
  avatarUrl,
  verified = false,
  subtitle,
  stats,
  children,
}: ProfileHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Avatar name={name} uri={avatarUrl} size="xl" ring="story" verified={verified} />
        <View style={styles.stats}>
          {stats.map((stat) => (
            <View
              key={stat.label}
              style={styles.stat}
              accessible
              accessibilityLabel={`${stat.value} ${stat.label}`}
            >
              <AppText variant="h2">{compact(stat.value)}</AppText>
              <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                {stat.label}
              </AppText>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.identity}>
        <View style={styles.nameRow}>
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.name}>
            {name}
          </AppText>
          {verified ? <Badge kind="label" label="Verificado" tone="primary" /> : null}
        </View>
        {subtitle ? (
          <AppText variant="bodySmall" color="textSecondary" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', minWidth: 64 },
  identity: { gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
