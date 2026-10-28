import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { api, messageFrom } from '../api';
import { AppText, BottomSheet, Button, Chip, Input, Notice, Switch } from '../components/ui';
import { spacing } from '../theme';
import {
  belemToday,
  dayInputValue,
  healthFormError,
  healthKinds,
  newClientKey,
  parseDayInput,
  type HealthKind,
} from './passport';

/** Formulário de um registro de saúde. A chave fica a mesma enquanto a folha está aberta. */
export function HealthSheet({
  visible,
  animalId,
  token,
  onClose,
  onSaved,
}: {
  visible: boolean;
  animalId: string;
  token: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [kind, setKind] = useState<HealthKind>('vaccine');
  const [title, setTitle] = useState('');
  const [occurred, setOccurred] = useState(dayInputValue(belemToday()));
  const [nextDue, setNextDue] = useState('');
  const [notes, setNotes] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [clientKey] = useState(newClientKey);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function chooseKind(value: HealthKind) {
    setKind(value);
    setIsPublic(healthKinds.find((item) => item.value === value)?.publicByDefault ?? false);
  }

  async function save() {
    if (saving) return;
    const occurredOn = parseDayInput(occurred);
    const nextDueOn = nextDue.trim() ? parseDayInput(nextDue) : null;
    const problem = healthFormError({
      title,
      occurredOn,
      nextDueOn,
      nextDueRaw: nextDue,
      today: belemToday(),
    });
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/animals/${animalId}/health`, {
        method: 'POST',
        token,
        body: {
          kind,
          title: title.trim(),
          notes: notes.trim() || undefined,
          occurredOn,
          nextDueOn,
          visibility: isPublic ? 'public' : 'caretakers',
          clientKey,
        },
      });
      await onSaved();
    } catch (failure) {
      // A mesma chave vai de novo no próximo toque: se o primeiro chegou, não duplica.
      setError(messageFrom(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Registro de saúde">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <View style={styles.chips}>
          {healthKinds.map((item) => (
            <Chip
              key={item.value}
              label={item.label}
              selected={kind === item.value}
              onPress={() => chooseKind(item.value)}
            />
          ))}
        </View>
        <Input
          label="O que foi feito"
          placeholder={kind === 'vaccine' ? 'Ex.: V10, antirrábica' : 'Ex.: antipulgas, hemograma'}
          value={title}
          onChangeText={setTitle}
          maxLength={80}
        />
        <Input
          label="Quando (dia/mês/ano)"
          value={occurred}
          onChangeText={setOccurred}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        {kind === 'vaccine' || kind === 'deworming' || kind === 'medication' ? (
          <Input
            label="Próxima dose (opcional)"
            placeholder="dia/mês/ano"
            value={nextDue}
            onChangeText={setNextDue}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
        ) : null}
        <Input
          label="Observações (opcional)"
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={500}
        />
        <Switch
          label="Mostrar para todos"
          description="Desligado, só quem cuida do animal vê este registro."
          value={isPublic}
          onValueChange={setIsPublic}
        />
        {error ? <Notice tone="error" message={error} /> : null}
        <Button
          title="Salvar no passaporte"
          fullWidth
          loading={saving}
          onPress={() => void save()}
        />
        <AppText variant="caption" color="textSecondary">
          Registre só o que aconteceu de fato. Receita e diagnóstico continuam com o veterinário.
        </AppText>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
