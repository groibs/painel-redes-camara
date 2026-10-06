# Painel Rede Câmara

Painel em português para uma TV 16:9 conectada por HDMI ao computador. Exibe seguidores por rede, agenda de hoje, programação da semana, publicações recentes do Instagram e resultados nominais do Plenário.

## Abrir

- `/`: dados reais. A agenda e os resultados vêm da API oficial da Câmara. Redes sem conexão mostram “Aguardando conexão”, sem números inventados.
- `/demo`: prévia visual. **Todos os números, eventos, publicações e votos desta página são ilustrativos.** Não há mistura entre demonstração e dados oficiais.

O painel ocupa uma tela de 1920 × 1080 e escala mantendo a proporção. No celular, os blocos ficam empilhados. Use o botão de tela cheia ou F11 no PC da TV.

## Desenvolvimento

Node.js 24 e npm:

```bash
npm ci
npm run dev
```

```bash
npm test
npm run typecheck
npm run build
npm start
```

## Controles

- Engrenagem ou **S**: configurações e fontes.
- **V** ou botão no rodapé: alternar agenda/votação.
- **R**: consultar novamente.
- Setas nas seções: trocar páginas da agenda, semana e feed.
- Rotação automática: alterna as páginas de agenda e publicações a cada 20 segundos; pode ser desligada.

Preferências e último snapshot recebido ficam no navegador, quando o armazenamento local está disponível. Em caso de falha de uma fonte, seu último conteúdo e horário são mantidos. Uma resposta vazia bem-sucedida limpa o conteúdo antigo. A demonstração nunca é salva no cache de dados reais.

## Agenda e votações

Fonte: [Dados Abertos da Câmara](https://dadosabertos.camara.leg.br/swagger/api.html).

- `/eventos`: semana de segunda a domingo, com paginação e horário de Brasília; cache de 5 minutos.
- `/votacoes`: resultados do Plenário (`idOrgao=180`), com data de registro; cache de 1 minuto.
- `/votacoes/{id}`: placar registrado e proposições relacionadas. Votações simbólicas sem placar nominal não são apresentadas como votos zero.

O navegador consulta `/api/painel` a cada minuto por padrão. Esse intervalo pode ser alterado na interface. O cache das fontes evita consultas desnecessárias à API oficial. Os números não são um placar de votação aberta: a API consultada fornece resultados registrados. A data e hora do resultado aparecem na tela.

Para fixar uma votação importante, defina `PANEL_VOTE_ID` no ambiente do servidor. O código também consulta as informações básicas oficiais desse ID.

## Conectar as redes via VPS

A integração de redes foi preparada para receber um snapshot HTTPS do coletor. **O coletor ainda precisa ser conectado às contas autorizadas e publicado na VPS.** A primeira versão não coleta followers por raspagem nem depende de embeds do Instagram.

Configure no servidor/Vercel (nunca no navegador):

```dotenv
PANEL_SOCIAL_SOURCE_URL=https://seu-dominio/painel/social.json
PANEL_SOCIAL_SOURCE_TOKEN=seu-segredo-definido-no-servidor
```

O token é opcional se o endpoint for público. Quando informado, é enviado apenas pelo backend como `Authorization: Bearer ...`. A fonte precisa usar HTTPS, não pode redirecionar, tem timeout e limite de tamanho. Credenciais nunca entram no Git ou no JSON enviado à TV.

Formato da resposta:

```json
{
  "schemaVersion": 1,
  "collectedAt": "2026-10-06T14:00:00-03:00",
  "accounts": [
    {
      "id": "instagram",
      "name": "Instagram",
      "handle": "@conta-oficial",
      "followers": 123456,
      "change24h": 120,
      "updatedAt": "2026-10-06T14:00:00-03:00"
    }
  ],
  "posts": [
    {
      "id": "id-real-da-publicacao",
      "caption": "Texto da publicação",
      "mediaUrl": "https://cdn-autorizado.example/imagem.jpg",
      "permalink": "https://www.instagram.com/p/codigo-real/",
      "publishedAt": "2026-10-06T12:00:00-03:00",
      "type": "image",
      "likes": 120,
      "comments": 10
    }
  ]
}
```

IDs aceitos: `instagram`, `tiktok`, `x`, `facebook`. Cada rede aparece no máximo uma vez. `change24h` deve ser `null` quando não houver histórico de 24h; o painel não inventa crescimento. `likes` e `comments` podem ser `null`. Para vídeos, `mediaUrl` deve apontar para a **thumbnail**, não para o arquivo de vídeo. Tipos: `image`, `video`, `carousel`. Contadores são inteiros não negativos; datas têm fuso explícito. O coletor deve renovar URLs de mídia que expirarem e preservar a data real de cada coleta.

A interface identifica métricas com mais de 30 minutos e mostra as datas das redes nas configurações. “Audiência nas redes” é a soma de seguidores, não pessoas únicas.

O acesso de cada plataforma depende de permissões próprias: Instagram/Facebook pela Meta, TikTok pelo escopo de estatísticas da conta, X pelo aplicativo autorizado. Não existe uma API da Câmara que forneça automaticamente esses quatro conjuntos de métricas.

## Publicação

Projeto Next.js 16.3.8 / React 19.3.0; Vercel usa a branch `main`. Build: `npm run build`. Instalação: `npm ci`. Runtime: Node.js 24. As variáveis opcionais estão em `.env.example`.

## Identidade visual

Direção extraída de **NOVA IDV - PROJETO.pdf**: `#00b142`, `#0095d4`, `#0a2e36`, `#27fb6b`, `#bcffdb`, `#e2ecf1`; superfícies sólidas, contraste alto e formas simples. Marca exportada do material fornecido, em tom neutro.

O guia prevê Gotham/Gotham Condensed. Esta versão usa DM Sans/Barlow Condensed locais como substitutas, pois arquivos webfont licenciados de Gotham não foram fornecidos. Para usar Gotham, adicione os arquivos licenciados e substitua as famílias nas variáveis CSS. O PDF completo não foi colocado no repositório público.
