# Publicação nas lojas

O identificador é `app.patinha.mobile` no Android e no iOS. O scheme do deep link é `patinha://post/{id}`.

## Google Play

- Conta de desenvolvedor verificada.
- Build de produção pelo EAS: `pnpm dlx eas-cli build --profile production --platform android`.
- Ficha: nome Patinha, categoria social, classificação livre.
- Política de privacidade pública em `https://app.patinha.app` e o mesmo texto da tela Termos e privacidade.
- Declaração de dados: localização aproximada, fotos, identificador da conta e token de notificação.
- Permissões explicadas em português: localização em uso, câmera e fotos.
- Não há compra dentro do app. O Pix de um perfil verificado acontece fora do Patinha.
- Conta de teste para o revisor: `maria@patinha.local` só existe no modo de desenvolvimento. Na produção, crie uma conta de e-mail real e anote a senha no console da Play.
- Capturas do feed, do mapa, da criação de alerta e do perfil, em telefone.

## App Store

- Conta Apple Developer e o app `app.patinha.mobile` no App Store Connect.
- Build de produção: `pnpm dlx eas-cli build --profile production --platform ios` e `pnpm dlx eas-cli submit --platform ios`.
- Sign in with Apple aparece na tela de entrada. Ele só conclui o login quando o Firebase do projeto está configurado. O login por e-mail precisa existir na mesma tela.
- Chave APNs enviada ao Firebase, conforme `docs/notificacoes.md`.
- Política de privacidade e URL de suporte `mailto:contato@patinha.app`.
- O app não vende animal e não processa pagamento.
- Notas de revisão: Belém é a cidade inicial; a localização pública é aproximada; a exclusão da conta está em Ajustes.
- Capturas de 6,7" e 6,5", sem moldura de outra marca.
