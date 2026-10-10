import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, size, spacing, typography, useTheme } from '../../theme';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

export interface SearchBarProps {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  placeholder = 'Buscar por bairro ou animal',
  accessibilityLabel = 'Buscar',
  style,
}: SearchBarProps) {
  const { colors, shadows } = useTheme();
  return (
    <View
      style={[
        styles.bar,
        shadows.sm,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
    >
      <Icon name="search" color={colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.textDisabled}
        accessibilityLabel={accessibilityLabel}
        returnKeyType="search"
        autoCorrect={false}
        style={[styles.input, typography.body, { color: colors.text }]}
      />
      {value.length > 0 ? (
        <IconButton
          icon="x"
          iconSize="md"
          accessibilityLabel="Limpar busca"
          onPress={() => onChangeText('')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: size.control,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, paddingVertical: spacing.sm },
});
