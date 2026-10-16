# A área de atendimento de Belém vale também na API

O lançamento é só em Belém, e até aqui só o app conferia se o ponto da publicação estava dentro da área de atendimento; a API aceitava qualquer coordenada. Decidimos que a API também recusa publicações fora da área, usando o mesmo polígono do app, porque a regra é de negócio e não pode depender do cliente. APKs antigos não são afetados, já que eles mesmos não deixam publicar fora da área. Abrir outra cidade passa a ser uma mudança no polígono compartilhado, não em cada tela.
