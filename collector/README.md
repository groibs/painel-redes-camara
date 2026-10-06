# Coletor das redes — VPS

Preparado para Python 3.12 / Ubuntu 24.04, sem dependências de terceiros. **Não está instalado nem conectado às contas.** A instalação depende de acesso ao VPS; a coleta depende de credenciais autorizadas das plataformas.

O coletor consulta seguidores a cada 15 minutos e os seis posts mais recentes do Instagram a cada cinco minutos. Guarda métricas, histórico e posts em SQLite, com atualização independente de cada rede. Uma falha preserva o último conteúdo recebido e seu horário original. Respostas vazias bem-sucedidas limpam posts antigos. Uma reinicialização preserva os dados e os intervalos de consulta.

A variação de 24 horas só aparece quando existe uma coleta de pelo menos 24 horas atrás, com tolerância de 30 minutos. O YouTube fornece inscritos arredondados; a variação calculada também reflete essa aproximação. Tokens expirados exigem renovação ou reautorização; este coletor não implementa o fluxo OAuth nem renova credenciais automaticamente.

## Configuração prevista

Após conferir o sistema, as portas e os serviços existentes, `install.py` faz a primeira instalação como root, usando arquivos de uma revisão fixa e verificando seus hashes. Exige Python 3.12 e systemd, cria o usuário sem login e gera a credencial de leitura no arquivo root 0600. Para antes de alterar arquivos quando encontra uma instalação existente ou a porta ocupada. Não altera Caddy, firewall, serviços existentes nem configura o painel. Testa autenticação local e resume somente os domínios do Caddy, sem imprimir sua configuração ou credenciais. HTTP 503 autenticado é esperado até a primeira coleta autorizada.

O instalador não serve para atualizar ou reparar uma instalação existente. Se ocorrer erro depois da criação dos arquivos, conferir o resultado antes de repetir. Autorizações das redes e domínio HTTPS continuam pendentes.

1. Inspecionar serviços, portas, proxy HTTPS e domínio existentes antes de qualquer instalação.
2. Criar usuário de serviço `rede-camara-social`, sem login; colocar `collector.py` em `/opt/rede-camara-social`, pertencendo a root e sem escrita pelo serviço.
3. Configurar `/etc/rede-camara-social.env` diretamente no servidor, pertencendo a root, permissão 0600, seguindo `.env.example`. Definir uma credencial aleatória de leitura com pelo menos 32 caracteres. Nenhuma senha de rede social é necessária.
4. Configurar apenas as redes autorizadas. Meta exige versão válida do app, IDs e tokens de leitura. `INSTAGRAM_LOGIN` admite `instagram` ou `facebook`, conforme o app. TikTok exige `user.info.stats`; YouTube usa chave de API e ID de canal; X usa ID e Bearer Token, sujeito ao plano contratado.
5. Instalar a unidade de serviço fornecida. O processo escuta apenas em `127.0.0.1:8715`; não abrir essa porta na Internet.
6. Adicionar um domínio HTTPS ao proxy existente. O exemplo Caddy é um bloco adicional, não uma substituição da configuração atual.
7. Confirmar coleta real e resposta autenticada antes de configurar na Vercel `PANEL_SOCIAL_SOURCE_URL=https://DOMINIO/snapshot.json` e `PANEL_SOCIAL_SOURCE_TOKEN` com a mesma credencial de leitura. Esses valores ficam no backend.

`GET /snapshot.json` exige `Authorization: Bearer ...`. Sem nenhuma coleta válida, responde 503; nunca publica números fictícios ou zeros para contas ainda não conectadas. O endpoint publica somente o formato esperado por `lib/snapshot.ts`, sem tokens, histórico completo ou detalhes das contas de desenvolvedor.

Logs registram a rede e o tipo de erro, sem URLs, respostas da plataforma ou credenciais. Solicitações não seguem redirecionamentos e têm timeout e limite de resposta. As URLs das imagens do Instagram são renovadas nas coletas de posts; podem expirar quando a fonte fica indisponível por muito tempo.

## Validação local

`python3 -m unittest discover -s collector -p 'test_*.py'`

Os testes usam respostas simuladas, validando conversão de APIs, falhas parciais, persistência, intervalos e histórico de 24 horas. Ainda não comprovam acesso às contas ou funcionamento no VPS.
