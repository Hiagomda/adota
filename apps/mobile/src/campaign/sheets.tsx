import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { api, messageFrom } from '../api';
import { AppText, BottomSheet, Button, Chip, Input, Notice, Switch } from '../components/ui';
import { belemToday, dayInputValue, newClientKey, parseDayInput } from '../passport/passport';
import { spacing } from '../theme';
import {
  campaignFormError,
  entryFormError,
  moneyInputValue,
  parseMoneyInput,
  type CampaignDetail,
} from './campaign';
import { ReceiptPicker } from './ReceiptPicker';

/**
 * Lançamento do responsável (doação recebida ou despesa) ou aviso "fiz um Pix" de quem doou.
 * A chave contra envio duplo fica a mesma enquanto a folha está aberta.
 */
export function EntrySheet({
  visible,
  mode,
  campaignId,
  token,
  onClose,
  onSaved,
}: {
  visible: boolean;
  mode: 'owner' | 'pledge';
  campaignId: string;
  token: string | null;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [kind, setKind] = useState<'donation' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [occurred, setOccurred] = useState(dayInputValue(belemToday()));
  const [description, setDescription] = useState('');
  const [receiptKey, setReceiptKey] = useState<string | null>(null);
  const [showName, setShowName] = useState(false);
  const [clientKey] = useState(newClientKey);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const owner = mode === 'owner';

  async function save() {
    if (saving) return;
    const amountCents = parseMoneyInput(amount);
    const occurredOn = parseDayInput(occurred);
    const problem = entryFormError({
      amountCents,
      occurredOn,
      today: belemToday(),
      description: owner ? description : undefined,
      needsReceipt: owner,
      hasReceipt: receiptKey !== null,
    });
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (owner) {
        await api(`/campaigns/${campaignId}/entries`, {
          method: 'POST',
          token,
          body: {
            kind,
            amountCents,
            description: description.trim(),
            occurredOn,
            receiptKey,
            clientKey,
          },
        });
        await onSaved(kind === 'expense' ? 'Despesa lançada.' : 'Doação lançada.');
      } else {
        await api(`/campaigns/${campaignId}/pledges`, {
          method: 'POST',
          token,
          body: {
            amountCents,
            occurredOn,
            receiptKey: receiptKey ?? undefined,
            showName,
            clientKey,
          },
        });
        await onSaved('Aviso enviado. O responsável confere no extrato e confirma.');
      }
    } catch (failure) {
      // A mesma chave vai de novo no próximo toque: se o primeiro chegou, não duplica.
      setError(messageFrom(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={owner ? 'Lançar no extrato' : 'Avisar que doei'}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        {owner ? (
          <View style={styles.chips}>
            <Chip
              label="Despesa paga"
              selected={kind === 'expense'}
              onPress={() => setKind('expense')}
            />
            <Chip
              label="Doação recebida"
              selected={kind === 'donation'}
              onPress={() => setKind('donation')}
            />
          </View>
        ) : (
          <AppText color="textSecondary">
            Faça o Pix pelo app do seu banco e conte aqui quanto foi. Só entra no progresso depois
            que o responsável conferir no extrato.
          </AppText>
        )}
        <Input
          label="Valor (R$)"
          placeholder="50,00"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          maxLength={16}
        />
        <Input
          label="Quando (dia/mês/ano)"
          value={occurred}
          onChangeText={setOccurred}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        {owner ? (
          <Input
            label={kind === 'expense' ? 'O que foi pago' : 'De onde veio'}
            placeholder={
              kind === 'expense'
                ? 'Ex.: raio-x da pata, ração 15 kg'
                : 'Ex.: doação em dinheiro na feira'
            }
            value={description}
            onChangeText={setDescription}
            maxLength={200}
          />
        ) : null}
        <ReceiptPicker
          token={token}
          label={owner ? 'Comprovante (obrigatório)' : 'Comprovante do Pix (opcional)'}
          receiptKey={receiptKey}
          onChange={setReceiptKey}
          onError={setError}
        />
        {owner ? null : (
          <Switch
            label="Mostrar meu primeiro nome"
            description="Desligado, aparece como doação anônima. O comprovante só o responsável vê."
            value={showName}
            onValueChange={setShowName}
          />
        )}
        {error ? <Notice tone="error" message={error} /> : null}
        <Button
          title={owner ? 'Lançar' : 'Enviar aviso'}
          fullWidth
          loading={saving}
          onPress={() => void save()}
        />
        {owner ? (
          <AppText variant="caption" color="textSecondary">
            O lançamento não pode ser apagado depois. Se errar, anule com o motivo: fica no
            histórico.
          </AppText>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}

/** Um texto com motivo: recusar aviso, anular lançamento ou encerrar com prestação de contas. */
export function ReasonSheet({
  visible,
  title,
  label,
  placeholder,
  minLength,
  confirmLabel,
  helper,
  destructive,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  label: string;
  placeholder: string;
  minLength: number;
  confirmLabel: string;
  helper?: string;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: (text: string) => Promise<string | null>;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    if (saving) return;
    if (text.trim().length < minLength) {
      setError(`Escreva pelo menos ${minLength} letras.`);
      return;
    }
    setSaving(true);
    setError(null);
    const problem = await onConfirm(text.trim());
    setSaving(false);
    if (problem) setError(problem);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <Input
          label={label}
          placeholder={placeholder}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={minLength >= 20 ? 2000 : 300}
          helper={helper}
        />
        {error ? <Notice tone="error" message={error} /> : null}
        <Button
          title={confirmLabel}
          variant={destructive ? 'destructive' : 'primary'}
          fullWidth
          loading={saving}
          onPress={() => void confirm()}
        />
      </ScrollView>
    </BottomSheet>
  );
}

/** Editar a campanha. Toda mudança pede o motivo, que fica público no histórico. */
export function EditSheet({
  visible,
  campaign,
  token,
  onClose,
  onSaved,
}: {
  visible: boolean;
  campaign: CampaignDetail;
  token: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState(campaign.title);
  const [purpose, setPurpose] = useState(campaign.purpose);
  const [goal, setGoal] = useState(moneyInputValue(campaign.goalCents));
  const [deadline, setDeadline] = useState(dayInputValue(campaign.deadline));
  const [pixKey, setPixKey] = useState(campaign.pixKey ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    const goalCents = parseMoneyInput(goal);
    const day = parseDayInput(deadline);
    const problem = campaignFormError({
      title,
      purpose,
      goalCents,
      deadline: day,
      // A chave atual só volta quando a campanha está recebendo; vazia aqui é "não mudar".
      pixKey: pixKey.trim() || 'sem mudança',
      today: belemToday(),
    });
    if (problem) {
      setError(problem);
      return;
    }
    if (reason.trim().length < 10) {
      setError('Conte por que mudou (pelo menos 10 letras). Fica no histórico.');
      return;
    }
    const body: Record<string, unknown> = { reason: reason.trim() };
    if (title.trim() !== campaign.title) body.title = title.trim();
    if (purpose.trim() !== campaign.purpose) body.purpose = purpose.trim();
    if (goalCents !== campaign.goalCents) body.goalCents = goalCents;
    if (day !== campaign.deadline) body.deadline = day;
    if (pixKey.trim() && pixKey.trim() !== campaign.pixKey) body.pixKey = pixKey.trim();
    if (Object.keys(body).length === 1) {
      setError('Nada mudou na campanha.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/campaigns/${campaign.id}`, { method: 'PATCH', token, body });
      await onSaved();
    } catch (failure) {
      setError(messageFrom(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Editar campanha">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <Input label="Título" value={title} onChangeText={setTitle} maxLength={80} />
        <Input
          label="Para que é o dinheiro"
          value={purpose}
          onChangeText={setPurpose}
          multiline
          maxLength={2000}
        />
        <Input
          label="Meta (R$)"
          value={goal}
          onChangeText={setGoal}
          keyboardType="decimal-pad"
          maxLength={16}
        />
        <Input
          label="Último dia (dia/mês/ano)"
          value={deadline}
          onChangeText={setDeadline}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        <Input
          label="Chave Pix"
          value={pixKey}
          onChangeText={setPixKey}
          autoCapitalize="none"
          maxLength={120}
        />
        <Input
          label="Motivo da mudança"
          placeholder="Ex.: a clínica mandou orçamento novo"
          value={reason}
          onChangeText={setReason}
          maxLength={300}
          helper="Aparece no histórico, com o antes e o depois."
        />
        {error ? <Notice tone="error" message={error} /> : null}
        <Button title="Salvar" fullWidth loading={saving} onPress={() => void save()} />
      </ScrollView>
    </BottomSheet>
  );
}

/** Confirmar um aviso que veio sem comprovante: o responsável anexa o print do extrato. */
export function ConfirmSheet({
  visible,
  campaignId,
  entryId,
  amountLabel,
  token,
  onClose,
  onSaved,
}: {
  visible: boolean;
  campaignId: string;
  entryId: string;
  amountLabel: string;
  token: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [receiptKey, setReceiptKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    if (saving) return;
    if (!receiptKey) {
      setError('Anexe o print do extrato com esse Pix.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/campaigns/${campaignId}/entries/${entryId}/confirm`, {
        method: 'POST',
        token,
        body: { receiptKey },
      });
      await onSaved();
    } catch (failure) {
      setError(messageFrom(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={`Confirmar ${amountLabel}`}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <AppText color="textSecondary">
          Quem avisou não mandou comprovante. Anexe o print do seu extrato mostrando esse Pix: só
          doação com comprovante entra no progresso.
        </AppText>
        <ReceiptPicker
          token={token}
          label="Print do extrato"
          receiptKey={receiptKey}
          onChange={setReceiptKey}
          onError={setError}
        />
        {error ? <Notice tone="error" message={error} /> : null}
        <Button
          title="Confirmar doação"
          fullWidth
          loading={saving}
          onPress={() => void confirm()}
        />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
