# EasyFood — Documentação de Arquitetura

> Este documento explica **por que** o projeto é do jeito que é. Cada seção
> descreve uma decisão, a alternativa mais óbvia que foi descartada, e o
> trade-off aceito. Onde a escolha se afasta do material de aula, isso está
> dito explicitamente — não por discordância, mas porque o exercício aqui foi
> justamente levar a arquitetura em camadas um passo além.

---

## 1. Visão geral

A EasyFood é um **monólito modular** (ADR-003) em Node.js + Express, com
persistência em PostgreSQL via Prisma (ADR-002) e autenticação delegada ao
AWS Cognito atrás de uma abstração (ADR-004).

```
                       REQUISIÇÃO HTTP
                             |
                             v
                   requestContext  (id + métricas)
                             |
                             v
                      CORS / JSON / estáticos
                             |
                             v
                          app.js
                             |
                     +-------+-------+
                     |               |
                     v               v
               /api/v1/auth   /api/v1/restaurants
                     |               |
                     v               v
                  routes          routes
            (rate limit,     (authenticate,
             validate)        authorize, validate)
                     |               |
                     v               v
                controller      controller
                     |               |
                     v               v
                 service         service          <- regras de negócio
                     |               |
                     v               v
             auth provider      repository        <- acesso a dados
                     |               |
                     v               v
             Cognito / JWT       prisma.js
                                     |
                                     v
                                PostgreSQL

            qualquer erro em qualquer ponto
                             |
                             v
                      errorHandler  (resposta padronizada)
```

---

## 2. Camadas e responsabilidades

| Camada | Arquivo(s) | Responsabilidade | O que NÃO pode fazer |
|---|---|---|---|
| **Server** | `server.js` | Ligar o servidor, encerrar com elegância | Conhecer rotas ou regras |
| **App** | `src/app.js` | Montar middlewares e rotas | Conter lógica de negócio |
| **Routes** | `*.routes.js` | Mapear caminho → controller, declarar proteção | Acessar banco |
| **Controller** | `*.controller.js` | Traduzir HTTP ↔ Service | Conter regra de negócio |
| **Service** | `*.service.js` | Regras de negócio | Conhecer `req`/`res` ou o ORM |
| **Repository** | `*.repository.js` | Acesso a dados | Conter regra de negócio |
| **Database** | `database/prisma.js` | Conexão única com o banco | Qualquer outra coisa |
| **Provider** | `auth/providers/*` | Falar com o provedor de identidade | Conhecer HTTP |

**Regra de ouro do projeto:** a dependência só aponta para baixo. Um Service
nunca importa um Controller. O único arquivo autorizado a importar o Prisma é
o Repository (e o health check, que pinga o banco de propósito).

---

## 3. Decisões que se afastam do material de aula

### 3.1 Camada Repository entre Service e Prisma

**Na aula:** o Service chama `prisma.restaurant.findMany()` diretamente.

**Aqui:** existe um `restaurant.repository.js` no meio.

**Por quê:** o Service é onde moram as *regras*. Quando ele também monta
queries, duas coisas acontecem: fica difícil ler onde termina a regra e começa
o detalhe técnico, e testar o Service passa a exigir um banco de verdade.

Com o Repository, o Service fala a linguagem do domínio (`buscarPorNome`) e o
Repository traduz para Prisma. Trocar o ORM, adicionar cache ou mudar a query
para SQL puro afeta **um arquivo**.

**Trade-off:** mais um arquivo e mais uma indireção. Para um CRUD de duas rotas
é excesso; para o roadmap da EasyFood (pedidos, pagamentos, avaliações) se paga
rápido. Foi uma aposta consciente no crescimento previsto no ADR-003.

### 3.2 Erros centralizados em vez de try/catch por controller

**Na aula:** cada controller tem `try { ... } catch { res.status(500)... }`.

**Aqui:** `AppError` + `asyncHandler` + `errorHandler`.

**Por quê:** aquele try/catch se repete em todo controller — e cada
desenvolvedor acaba formatando o erro de um jeito. O front nunca sabe o que
esperar. Além disso, é fácil esquecer um catch e deixar a requisição pendurada
sem resposta.

Aqui, o Service **lança** um erro de domínio (`conflict("...")`), e um único
middleware decide como isso vira HTTP. Toda resposta de erro da API tem a
mesma forma:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Já existe um restaurante chamado \"Cantina Roma\".",
    "requestId": "8f66802d-3d29-456a-9341-0ca33ff70c34"
  }
}
```

O `code` é estável e serve para o front tratar programaticamente; a `message` é
para humanos; o `requestId` liga a resposta à trilha de logs.

**Trade-off:** quem lê o controller não vê mais o caminho do erro ali — precisa
saber que existe um handler central. É um conceito a mais para aprender, em
troca de eliminar duplicação e inconsistência.

### 3.3 Validação declarativa com Zod, como middleware

**Na aula:** `if (!name || !category) return res.status(400)...` dentro do controller.

**Aqui:** schemas em `*.schema.js`, aplicados por `validate(schema)`.

**Por quê:** com 3 campos, o `if` funciona. Com 10 campos e regras de formato
(e-mail válido, nota entre 0 e 5, categoria de uma lista), o controller vira
uma parede de condicionais que ninguém quer manter.

O schema descreve o **contrato de entrada** em um lugar só, valida antes do
controller rodar, aplica valores padrão e converte tipos (query string `"2"`
vira número `2`). O controller recebe dados já limpos.

Há um ganho de segurança embutido: o dado validado **substitui** `req.body`,
então é impossível o controller usar por engano um campo que o cliente enviou
mas o schema não previu (*mass assignment*).

**Trade-off:** uma dependência a mais (`zod`) e mais um arquivo por módulo.

### 3.4 Autenticação plugável (Strategy Pattern)

Detalhado no [ADR-004](./ADR-004-autenticacao.md). Em resumo: a maioria das
implementações chama `jwt.sign()` ou o SDK da AWS direto no Service. Aqui o
Service depende de um **contrato**, e a implementação concreta é escolhida por
variável de ambiente.

O resultado prático: `AUTH_PROVIDER=local` roda sem AWS nenhuma;
`AUTH_PROVIDER=cognito` roda em produção. **Zero linha de negócio muda.**

### 3.5 Configuração centralizada e validada (fail-fast)

**Na aula:** `process.env.JWT_SECRET || "dev-secret"` espalhado onde precisar.

**Aqui:** `src/config/env.js` lê tudo em um ponto e **falha na subida** se
faltar algo essencial.

**Por quê:** o padrão `|| "valor-padrão"` esconde erros de configuração. A
aplicação sobe "funcionando" e só quebra quando alguém chama o endpoint certo —
às vezes em produção. Pior: o segredo de desenvolvimento pode ir para produção
sem ninguém notar (o `env.js` bloqueia exatamente esse caso).

Falhar imediatamente, com mensagem dizendo qual variável falta, transforma um
bug silencioso em um erro óbvio de 5 segundos.

### 3.6 Soft delete e campos de auditoria

`DELETE /restaurants/:id` **não apaga** a linha: marca `active = false` e
grava `deletedAt`.

**Por quê:** um pedido antigo aponta para um restaurante. Apagar a linha
quebra o histórico ou obriga a apagar os pedidos junto — perdendo dados
financeiros. Além disso, exclusão acidental vira um desastre irreversível.

`createdAt` / `updatedAt` existem porque "quando isso mudou?" é uma pergunta
que sempre aparece, e adicionar esses campos depois, com a tabela cheia, é bem
mais caro.

**Trade-off:** toda consulta precisa lembrar do filtro `active: true`. Está
concentrado no Repository justamente para ninguém esquecer.

### 3.7 Paginação obrigatória na listagem

**Na aula:** `GET /restaurants` devolve um array com tudo.

**Aqui:** devolve `{ dados, paginacao }`, com teto de 100 itens por página.

**Por quê:** `findMany()` sem limite é uma bomba-relógio. Funciona com 10
registros e derruba a aplicação com 50 mil — carregando tudo na memória e
serializando em JSON. O teto no schema impede que alguém peça `?limite=999999`.

**Trade-off:** a resposta deixa de ser um array simples, então qualquer cliente
existente precisa se adaptar. Por isso a API foi versionada (`/api/v1`).

### 3.8 Observabilidade: request id, logs estruturados, health checks

- **Correlation id:** cada requisição ganha um UUID que aparece em todos os
  seus logs e volta no header `x-request-id` e na resposta de erro. Quando
  alguém relata "deu erro", você pede o id e acha a trilha exata.
- **Log estruturado:** JSON em produção (indexável por CloudWatch, Datadog,
  Loki), legível em desenvolvimento. Campos sensíveis (`password`, `token`,
  `authorization`) são automaticamente mascarados — um vazamento clássico é
  logar o body inteiro de um login.
- **Health checks separados:** `/health/live` (o processo está vivo?) e
  `/health/ready` (dá para mandar tráfego?). Confundir os dois faz um
  orquestrador reiniciar todos os containers quando o banco oscila,
  transformando incidente pequeno em queda total.

### 3.9 Graceful shutdown

**Na aula:** `app.listen(3000, ...)` e pronto.

**Aqui:** o processo escuta `SIGTERM`/`SIGINT`, para de aceitar conexões novas,
espera as em andamento terminarem, fecha o Prisma e só então sai — com timeout
de segurança.

**Por quê:** todo deploy manda `SIGTERM`. Sem tratamento, requisições em voo
são cortadas no meio (o usuário vê erro em um deploy que deveria ser invisível)
e conexões com o PostgreSQL ficam penduradas.

### 3.10 Rate limiting nas rotas de autenticação

Um `/login` sem limite permite testar milhares de senhas por minuto.

A implementação é **em memória, de propósito**: a EasyFood roda em uma
instância só hoje (ADR-003). Adicionar Redis agora violaria o princípio de
baixa complexidade operacional que justificou o monólito. O trade-off está
documentado no próprio arquivo: ao escalar horizontalmente, cada instância terá
seu contador, e será hora de migrar para um store compartilhado. Está isolado
em um módulo para essa troca custar pouco.

### 3.11 API versionada

As rotas vivem em `/api/v1/...`, e os caminhos antigos (`/restaurants`)
continuam montados por compatibilidade.

**Por quê:** um dia um contrato vai precisar mudar de forma incompatível — como
a paginação da seção 3.7. Com versão no caminho, `/v1` segue atendendo clientes
antigos enquanto `/v2` evolui. Sem versão, toda mudança é uma quebra.

### 3.12 Serviço de e-mail compartilhado e ação secundária

`src/modules/shared/email.service.js` expõe uma única função, `sendEmail()`.
O módulo de restaurantes **cria restaurantes**; o e-mail **envia e-mails**. A
chamada ao provedor (Resend) fica confinada em `transportar()`, e o cadastro
grava no banco **antes** de qualquer e-mail: a falha do provedor nunca desfaz
nem impede a operação principal. O envio não usa `await` — a resposta não espera
o provedor. Dados de usuário são escapados antes de entrar no HTML do e-mail.
Detalhes e trade-offs no [ADR-005](./ADR-005-servico-de-email.md).

**Trade-off:** sem fila, um e-mail que falha é perdido (fica só no log).

### 3.13 Função serverless para imagens (monólito + FaaS)

O processamento de imagem é trabalho de CPU/memória e não deve competir com as
requisições da API. A EasyFood continua um monólito modular e ganha uma
**função independente** (`src/functions/optimizeImage`) pensada para rodar sob
demanda, acionada por um evento de upload. A função é separada em duas camadas:
`optimizeImage(buffer)` (pura) e `handler(event)` (adaptador FaaS) — em uma
plataforma real só o handler muda.

Há também um **simulador de plataforma** (`src/shared/serverless/simulator.js`)
que reproduz cold start, warm start, limite de concorrência e timeout, para que
os trade-offs sejam observados e não só lidos (`npm run image:local`).

**Trade-offs:** cold start, limites de execução, resultado assíncrono e
dependência de provedor. A escolha depende do cenário (volume, picos, exigência
de resposta imediata). Análise completa no
[ADR-006](./ADR-006-processamento-de-imagens.md) e conceitos em
[SERVERLESS.md](./SERVERLESS.md).

---

## 4. Segurança — decisões pontuais

| Decisão | Motivo |
|---|---|
| Senha nunca no nosso banco (com Cognito) | Vazamento do PostgreSQL não vira vazamento de credenciais |
| `x-powered-by` desabilitado | Não anunciar a stack de graça |
| Limite de 100kb no body | Evita requisições gigantes que esgotam memória |
| CORS por lista explícita | `origin: true` em produção libera qualquer site |
| `trust proxy` configurado | Sem isso o rate limiter vê todos os usuários como o IP do balanceador |
| Erro de login genérico | "E-mail ou senha inválidos" não revela quais e-mails existem |
| Stack trace só em dev | Stack em produção entrega estrutura interna a um atacante |
| Campos sensíveis mascarados no log | Impede o vazamento clássico via arquivo de log |
| `escapeHtml` em dados de usuário no e-mail | Impede HTML injection/phishing com a marca da EasyFood |
| Imagem validada pelo conteúdo, com teto de bytes e de pixels | Impede arquivo disfarçado e "image bomb" |
| Metadados EXIF/GPS descartados na imagem otimizada | Foto de celular pode carregar a localização |
| Política de senha espelhando o Cognito | Erro 400 rápido da nossa API, uma chamada a menos à AWS |

---

## 5. O que foi deliberadamente **não** feito

Documentar o que ficou de fora é tão importante quanto justificar o que entrou.

- **Microserviços.** O ADR-003 decidiu monólito modular, e nada mudou no
  contexto. Separar agora traria custo operacional sem benefício.
- **Redis para rate limit e cache.** Só faz sentido com mais de uma instância.
- **Injeção de dependência com container.** O `require` direto resolve bem
  nesta escala; um container adicionaria abstração sem problema real a resolver.
- **Testes unitários com framework.** Há um smoke test que cobre o fluxo
  principal ponta a ponta. Um framework (Jest/Vitest) é o próximo passo natural,
  mas o smoke test já prova que a arquitetura é testável — ele substitui o
  banco inteiro por um fake **sem alterar uma linha do projeto**, o que só é
  possível porque a camada Database está isolada.
- **Refresh token no provider local.** Assumido como limitação explícita, com
  erro `NOT_SUPPORTED`. Fingir que funciona seria pior do que admitir.

---

## 6. Histórico de decisões

| ADR | Decisão | Status |
|---|---|---|
| ADR-001 | Armazenamento em memória (array) | Substituído |
| ADR-002 | Persistência com PostgreSQL | Aceito |
| ADR-003 | Arquitetura monolítica modular | Aceito |
| [ADR-004](./ADR-004-autenticacao.md) | Cognito atrás de abstração de provider | Aceito |
| [ADR-005](./ADR-005-servico-de-email.md) | Serviço de e-mail compartilhado, ação secundária | Aceito |
| [ADR-006](./ADR-006-processamento-de-imagens.md) | Processamento de imagens em função serverless | Aceito |

Como registrado na aula: uma decisão substituída **não estava errada** — o
contexto mudou.
