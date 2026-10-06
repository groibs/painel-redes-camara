# Painel Rede Câmara

Painel em português para uma TV 16:9 conectada por HDMI ao computador. Exibe seguidores por rede, agenda de hoje, programação da semana, publicações recentes do Instagram e resultados nominais do Plenário.

## Abrir

- `/`: dados reais. A agenda e os resultados vêm da API oficial da Câmara. Redes sem conexão mostram “Aguardando conexão”, sem números inventados.
- `/demo`: prévia visual. **Todos os números, eventos, publicações e votos desta página são ilustrativos.** Não há mistura entre demonstração e dados oficiais.

A composição segue a referência visual fornecida: cabeçalho claro e relógio grande; contadores verticais e feed à esquerda; destaque do plenário, resumo do dia e comissões ao centro; pautas e semana à direita. A faixa “Na pauta” mostra os destaques da agenda recebida. Os indicadores são calculados a partir dos eventos do dia, e “em andamento” usa a situação da fonte.

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
- `/votacoes`: resultados do Plenário nos últimos 30 dias (`idOrgao=180`), com data de registro; cache de 1 minuto.
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

IDs aceitos: `instagram`, `tiktok`, `x`, `youtube`, `facebook`. Cada rede aparece no máximo uma vez. `change24h` deve ser `null` quando não houver histórico de 24h; o painel não inventa crescimento. `likes` e `comments` podem ser `null`. Para vídeos, `mediaUrl` deve apontar para a **thumbnail**, não para o arquivo de vídeo. Tipos: `image`, `video`, `carousel`. Contadores são inteiros não negativos; datas têm fuso explícito. O coletor deve renovar URLs de mídia que expirarem e preservar a data real de cada coleta.

A interface identifica métricas com mais de 30 minutos e mostra as datas das redes nas configurações. “Audiência nas redes” é a soma de seguidores, não pessoas únicas.

O acesso de cada plataforma depende de permissões próprias: Instagram/Facebook pela Meta, TikTok pelo escopo de estatísticas da conta, X pelo aplicativo autorizado e YouTube pela API de dados do canal. Não existe uma API da Câmara que forneça automaticamente esses conjuntos de métricas.

## Publicação

Projeto Next.js 16.3.8 / React 19.3.0; Fonte de código: branch `main`. A conta Rebelde recebeu a publicação por envio direto dos arquivos; publicações automáticas dependem da vinculação do GitHub na Vercel. Build: `npm run build`. Instalação: `npm ci`. Runtime: Node.js 24. As variáveis opcionais estão em `.env.example`.

Há também um empacotamento portátil para publicar a mesma interface e API da Câmara em um Worker:

```bash
npm run build
node scripts/build-portable-preview.mjs
```

O resultado fica em `dist/server/index.js`, com os assets locais incorporados. O empacotamento mantém `/` e `/demo` separados e recebe as mesmas variáveis opcionais pelo ambiente do Worker. Configure o token do coletor como segredo no provedor; ele permanece no servidor. Sem o coletor configurado, as redes ficam aguardando conexão.

## Identidade visual

Direção extraída de **NOVA IDV - PROJETO.pdf**: `#00b142`, `#0095d4`, `#0a2e36`, `#27fb6b`, `#bcffdb`, `#e2ecf1`; superfícies sólidas, contraste alto e formas simples. Marca exportada do material fornecido, em tom neutro.

O guia prevê Gotham/Gotham Condensed. Esta versão usa DM Sans/Barlow Condensed locais como substitutas, pois arquivos webfont licenciados de Gotham não foram fornecidos. Para usar Gotham, adicione os arquivos licenciados e substitua as famílias nas variáveis CSS. O PDF completo não foi colocado no repositório público.

## Fotografias

Imagens de arquivo do [Portal da Câmara dos Deputados](https://www.camara.leg.br/historia-e-arquivo/): plenário, Saulo Cruz/Câmara dos Deputados; Congresso Nacional, Brito Junior/Câmara dos Deputados. A foto do destaque é identificada como arquivo, sem sugerir transmissão ao vivo. As fotografias dos cards são usadas somente na demonstração do feed.
