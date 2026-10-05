# Notificações

O Android recebe push direto pelo FCM. O iOS recebe pelo FCM, que entrega via APNs. Sem a chave da Apple, o iPhone grava o aviso dentro do app e não mostra a notificação do sistema.

## Chave APNs

1. Em [developer.apple.com](https://developer.apple.com), Certificates, Identifiers & Profiles, Keys, crie uma chave com Apple Push Notifications service.
2. Baixe o arquivo `.p8` uma única vez. Anote o Key ID e o Team ID.
3. No console do Firebase, configurações do projeto, Cloud Messaging, app Apple `app.egua.adota`, envie a chave de autenticação APNs com o Key ID e o Team ID.
4. Coloque `GoogleService-Info.plist` em `apps/mobile/` e `google-services.json` para o Android. Esses arquivos ficam fora do Git.
5. Defina `FIREBASE_PROJECT_ID` na API. Sem esse valor, o worker grava a notificação no app e não chama o FCM.

## Comportamento

Um alerta de resgate publicado procura protetores, ONGs e lares temporários dentro do raio de cada pessoa. Urgência alta entra na fila com prioridade maior. Se ninguém marcar "Eu vou ajudar" em 45 minutos, o alerta é reenviado uma vez com o raio 1,5 vezes maior e fica destacado. Mudança de status avisa o autor e quem segue o alerta. Cada pessoa recebe no máximo 8 avisos de resgate por hora. No horário de silêncio, o aviso fica só na tela Alertas.
