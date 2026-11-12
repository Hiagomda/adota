import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Header } from '../src/components/ui';
import { VersionMark } from '../src/diagnostics/VersionMark';
import { screenColumn, spacing, useTheme } from '../src/theme';

export default function LegalScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <Header title="Termos e privacidade" onBack={() => router.back()} />
          <View style={styles.content}>
            <AppText variant="caption" color="textSecondary">
              Atualizado em 9 de novembro de 2026.
            </AppText>
            <AppText variant="h1">Termos</AppText>
            <AppText color="textSecondary">
              Égua, adota! é uma rede para resgate de animais de rua em Belém. É proibido anunciar
              venda de animal. O app não recebe pagamento: quando um perfil verificado mostra uma
              chave Pix, a transferência acontece fora da plataforma. Quem publica é responsável
              pela veracidade do resgate.
            </AppText>
            <AppText variant="h2">Conversa de adoção</AppText>
            <AppText color="textSecondary">
              Quem quer adotar conversa com quem cuida do animal dentro do app, com o telefone
              oculto. A conversa serve só para combinar a adoção. Não é permitido: vender o animal,
              cobrar taxa, pedir Pix ou qualquer pagamento, pedir código de verificação, senha,
              documento ou dados de cartão, ofender, ameaçar, assediar ou falar em maltratar
              animais. Mensagens com venda, preço ou Pix não são enviadas. Quem quebra as regras
              pode ter a conversa encerrada e a conta suspensa.
            </AppText>
            <AppText color="textSecondary">
              As conversas são monitoradas para a segurança de todos. Um filtro automático procura
              sinais de venda, golpe, contato fora do app, ofensa, ameaça, maus-tratos e assédio e
              manda a conversa para a equipe de moderação revisar. O filtro não pune ninguém
              sozinho: quem decide é uma pessoa da equipe. Antes da primeira mensagem você lê e
              aceita este aviso.
            </AppText>
            <AppText color="textSecondary">
              Se você preferir o WhatsApp, ele só aparece quando a outra pessoa liberou o número. O
              que é combinado fora do app o Égua, adota! não vê e não consegue acompanhar. Denuncie
              abuso pelo botão de denúncia da conversa ou pelo Suporte.
            </AppText>
            <AppText variant="h1">Privacidade</AppText>
            <AppText color="textSecondary">
              Guardamos conta, fotos, textos e a localização do resgate. Quem vê o resgate no app
              recebe a localização aproximada em cerca de 500 metros. O ponto exato só aparece para
              quem vai ajudar, para o autor e para a moderação. Seu WhatsApp só é mostrado se você
              ligar Mostrar meu WhatsApp em Ajustes, e só para quem pede: quem quer adotar um animal
              seu, quem vai ajudar no seu resgate e, se você oferece Casa Amiga, quem cuida de um
              resgate. Você pode excluir a conta em Ajustes. A exclusão anonimiza o perfil e apaga
              telefone, foto e tokens de notificação.
            </AppText>
            <AppText variant="h2">Conversas de adoção e a LGPD</AppText>
            <AppText color="textSecondary">
              O que guardamos: o texto das mensagens, quem enviou, quando, e as categorias que o
              filtro marcou. Também guardamos as mensagens barradas (venda ou Pix), que não chegam à
              outra pessoa, e a data em que você aceitou o aviso de monitoramento.
            </AppText>
            <AppText color="textSecondary">
              Para que usamos: para entregar a conversa e para proteger as pessoas e os animais de
              venda, golpe, assédio e maus-tratos. A base legal é a execução das regras do serviço
              que você aceitou e o legítimo interesse na segurança da comunidade e na prevenção de
              fraudes (art. 7º, incisos V e IX, da Lei 13.709/2018).
            </AppText>
            <AppText color="textSecondary">
              Quem vê: as duas pessoas da conversa. A equipe de moderação abre a conversa quando o
              filtro marca uma mensagem ou quando alguém denuncia, e cada abertura fica registrada
              na auditoria do painel. Não vendemos nem usamos as conversas para propaganda. Podemos
              entregar a conversa às autoridades quando a lei obrigar ou para denunciar crime contra
              pessoa ou animal.
            </AppText>
            <AppText color="textSecondary">
              Por quanto tempo: a conversa é apagada 180 dias depois da última mensagem. Conversa em
              revisão ou com denúncia aberta fica até a equipe decidir. Ao excluir a conta, suas
              mensagens viram &quot;Mensagem apagada&quot;.
            </AppText>
            <AppText color="textSecondary">
              Seus direitos: você pode pedir acesso, correção ou exclusão dos seus dados e a revisão
              por uma pessoa de qualquer decisão tomada a partir do filtro automático. Peça pelo
              Suporte do app ou pelo e-mail contato@eguaadota.com.br.
            </AppText>
            <VersionMark />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  content: { padding: spacing.lg, gap: spacing.md },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
