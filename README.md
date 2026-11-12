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

## Resumos editoriais nas áreas compactas

Títulos oficiais muito extensos (sobretudo enumerações de PLNs) são resumidos na apresentação em **Agora na Câmara**, **Pautas de Hoje**, **Comissões Hoje**, **Câmara na Semana**, **Radar Legislativo** e na faixa **Na Pauta**. Exemplo: `Apreciação dos PLN's nºs 1, 3, …, 33 e 35, de 2026; e eleição do Conselho de Comunicação Social` vira `Apreciação de 26 PLNs de 2026 e eleição do Conselho de Comunicação Social`. Os componentes usam limites próprios de 85–106 caracteres e o ticker, 116 caracteres com nome do órgão. Os títulos integrais permanecem nos dados originais e são acessíveis como dica de leitura (e link original onde disponível).

## Coleta agendada sem VPS (GitHub Actions + Supabase + Vercel)

**Implementado:** `.github/workflows/coleta-redes.yml` executa o coletor público a cada 30 minutos (minutos 17 e 47 UTC), com disparo manual em **GitHub → Actions → Coleta pública das redes da Câmara → Run workflow**. Além disso, há uma execução agendada diária às **07h11 de Brasília** (10h11 UTC), seguida de auditoria de frescor: a tarefa falha e registra avisos se os seguidores de X, TikTok, Facebook ou YouTube não tiverem leitura válida há mais de 26 horas. O Instagram continua com contador manual até a liberação de API autorizada. Dados de cada rede preservam o timestamp real, independentemente do horário de atualização do painel. O programa `scripts/sync_social.py` reutiliza `api/social_public.py` para consultar posts reais do embed público do Instagram (quando permitido), X e imagens de contingência do canal oficial da Câmara no Telegram, além de consultar perfis públicos confirmados de TikTok, Facebook e YouTube (contagem de inscritos do YouTube arredondada). Nenhuma conta Meta é necessária e nenhum token de rede social é usado.

O workflow guarda `social/snapshot.json` e `social/history.json` na branch **`social-data`**. O JSON mantém `observedAt` para cada fonte; se alguma coleta falhar, seu número anterior permanece com a **data original**, por até sete dias. Variações em 24 horas só são calculadas se existir uma amostra realmente observada cerca de 24 horas antes. Instagram manual de 397.329 seguidores (12/11/2026) permanece identificado como manual; o job **não** finge ter atualizado esse valor.

A Vercel consulta os dados nesta prioridade:
1. Supabase (quando um projeto exclusivo for conectado).
2. Último snapshot da branch `social-data` do GitHub.
3. Função pública `/api/social_public` da própria Vercel (se o snapshot agendado tiver mais de seis horas).
4. Fontes anteriores de contingência.

As fotos alternativas são **publicações do Telegram**, claramente identificadas; não representam os seis últimos posts do Instagram.

### Ativar banco Supabase exclusivo

**Não use os bancos de projetos pessoais existentes.** Crie ou selecione um projeto exclusivo para o painel da Câmara na organização autorizada e execute o arquivo `supabase/migrations/20261112152118_camara_social_snapshots.sql` no SQL Editor. Ele cria `camara_social_snapshots` (leitura pública restrita aos registros institucionais) e `camara_social_follower_history` (histórico privado), ambas com RLS. Apenas a chave de serviço pode escrever.

Configure os seguintes segredos em **GitHub → repositório → Settings → Secrets and variables → Actions → Repository secrets**:

- `SUPABASE_URL`: endereço `https://<ref>.supabase.co` do projeto dedicado.
- `SUPABASE_SERVICE_ROLE_KEY`: chave secreta de escrita desse projeto. Nunca enviar em chat, no Git ou ao navegador.

Configure estes valores em **Vercel → painel-redes-camara → Settings → Environment Variables**, nos ambientes Production e Preview, depois crie novo deployment:

- `PANEL_SUPABASE_URL`: o mesmo endereço (sem segredos).
- `PANEL_SUPABASE_ANON_KEY`: chave **publishable/anon** com acesso somente de leitura via RLS. **Nunca** use a chave de serviço na Vercel nem o prefixo `NEXT_PUBLIC_` para credenciais.

Enquanto o Supabase não estiver provisionado, GitHub Actions + branch `social-data` já funcionam como persistência pública. O coletor ainda depende da disponibilidade das fontes públicas e os agendamentos do GitHub podem atrasar. Se houver um problema, consulte a aba Actions; a data original de cada fonte impede mostrar métricas antigas como novas.

### Testes da coleta

```bash
python -m unittest discover -s tests -p 'test_*.py' -v
npm test
npm run build
```

## Cards com publicações reais do Instagram, sem Meta nem VPS

O coletor público utiliza primeiro a página de incorporação fornecida pelo próprio Instagram, `https://www.instagram.com/camaradosdeputados/embed/`. Essa página atualmente contém dados estruturados das seis publicações mais recentes de `@camaradosdeputados`: miniaturas originais, legenda, tipo, data e links para as publicações. O parser lê o JSON de inicialização sem executar scripts de terceiros. Publicações fixadas identificáveis são ignoradas; se restarem menos de seis, não são fabricadas outras.

Os cards exibem novamente **ÚLTIMOS POSTS NO INSTAGRAM**. Fotos e vídeos usam as miniaturas oficiais do Instagram e, ao clicar, abrem a postagem original. O Instagram pode mudar essa estrutura ou bloquear a consulta, portanto a coleta é de melhor esforço e **não substitui a API Meta oficial**.

O mesmo embed divulga uma contagem de seguidores que pode estar atrasada. **Não a tratamos como atual**. Até que exista uma contagem confiável, o painel preserva os **397.329 seguidores informados manualmente em 12/11/2026**, identificados como manuais e sem variação fictícia em 24 horas.

Quando o embed falha e não há dados recentes disponíveis do Instagram, o coletor recorre a fotos do [canal público oficial da Câmara no Telegram](https://t.me/CamaradosDeputados), com o cabeçalho **PUBLICAÇÕES DA CÂMARA · TELEGRAM**. Essas fotos nunca são apresentadas como posts do Instagram.

## Coleta do Instagram sem VPS (Vercel)

**Fonte confiável (recomendada):** autorize a conta profissional da Câmara na API oficial da Meta e configure em **Vercel → Project → Settings → Environment Variables**: `INSTAGRAM_USER_ID`, `INSTAGRAM_ACCESS_TOKEN`, `META_API_VERSION` e `INSTAGRAM_LOGIN` (`facebook` se for login com Página vinculada, `instagram` se for Instagram Login). Não compartilhe tokens no chat e nunca use `NEXT_PUBLIC_`. Sem essas credenciais, somente as fontes públicas podem ser consultadas, e elas podem ser bloqueadas. A Vercel precisa de um novo deployment após a configuração.


O projeto também contém a função Python `/api/social_public`. Na Vercel, o painel passa a consultá-la automaticamente pelo endereço de deployment (`VERCEL_URL`) quando `PANEL_SOCIAL_SOURCE_URL` não estiver configurado. A função prioriza o embed público do Instagram para recuperar até seis publicações originais, sem credenciais. O contador do embed não é usado como uma atualização automática de seguidores porque pode estar defasado.

A conexão usa a própria infraestrutura serverless da Vercel, sem daemon ou VPS. **Esta coleta pública é sujeita a bloqueio e mudanças do Instagram**: se indisponível, o painel pode usar `PANEL_SOCIAL_FALLBACK_PANEL_URL` como contingência e identifica dados antigos; nunca inventa números ou variação em 24 horas. Outros perfis não são garantidos por esta função. Uma integração autorizada via Meta Graph API, com credenciais mantidas no backend, continua sendo a alternativa recomendada para coleta confiável.

Em instalações fora da Vercel, `PANEL_PUBLIC_SOCIAL_URL` pode definir um endpoint HTTPS confiável com o caminho `/api/social_public`. Com `PANEL_SOCIAL_SOURCE_URL` configurado, o snapshot autorizado mantém prioridade sobre a coleta pública.

## Fonte legada opcional (compatibilidade)

O coletor antigo por HTTPS continua suportado, mas **a VPS não é mais necessária**: o fluxo padrão é GitHub Actions → snapshot persistente → Vercel. Use este endpoint apenas se houver um serviço legado autorizado.

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

Gotham Condensed fornecida pelo usuário é carregada localmente em WOFF2 nos pesos Book, Medium, Bold e Black. É aplicada nos títulos, chamadas, marca do painel e faixa inferior. Textos corridos e legendas usam DM Sans. O grafismo superior mantém os dois módulos com diagonais de 30° da capa do guia, em #00b142; a marca institucional foi extraída do PDF e usa #0a2e36. Logos das redes usam vetores, sem caracteres de fonte ou ícones genéricos. O PDF completo não foi colocado no repositório.

## Fotografias

Imagens de arquivo do [Portal da Câmara dos Deputados](https://www.camara.leg.br/historia-e-arquivo/): plenário, Saulo Cruz/Câmara dos Deputados; Congresso Nacional, Brito Junior/Câmara dos Deputados. A foto do destaque é identificada como arquivo, sem sugerir transmissão ao vivo. As fotografias dos cards são usadas somente na demonstração do feed.

## Coletor no VPS

O diretório `collector/` contém a implementação em Python, testes e configuração de serviço. A coleta ainda depende de instalação no servidor, domínio HTTPS e credenciais autorizadas; nenhuma rede foi ativada por este commit. Veja `collector/README.md`.
