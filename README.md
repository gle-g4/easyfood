# EasyFood API

Monólito modular em Node.js + Express, com PostgreSQL (Prisma), autenticação
plugável (**AWS Cognito** em produção, **JWT local** em desenvolvimento),
serviço de e-mail compartilhado e uma função serverless de otimização de
imagens.

> A justificativa de cada decisão está em
> [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) e nos ADRs da pasta `docs/`.

---

## Começando

```bash
npm install
copy .env.example .env        # macOS/Linux: cp .env.example .env
# edite o .env: preencha DATABASE_URL (veja o aviso abaixo)

npx prisma migrate dev --name init
npm run dev
```

O `.env.example` já vem com `AUTH_PROVIDER=local` e `EMAIL_PROVIDER=console`,
então **não é preciso conta AWS nem chave de e-mail** para rodar o projeto.

> **Cuidado ao editar o `.env`:** a linha do banco deve ser
> `DATABASE_URL="postgresql://..."` (URL entre aspas, fechando no final).
> Comentários começam com `#`. Se o `.env` já existe e funciona, **não copie
> o `.env.example` por cima** — só acrescente as linhas novas.
> O `.env` nunca deve ir para o GitHub (já está no `.gitignore`).

### Testes (não precisam de banco nem de internet)

```bash
npm test          # roda os dois conjuntos abaixo
npm run smoke     # 70 verificações da API: auth, regras, RBAC, e-mail, pratos, fotos, rate limit
npm run image:test  # 21 verificações da função de imagem e do simulador FaaS
```

---

## Front-end

Com o servidor rodando, abra **http://localhost:3000**. É uma página única
(HTML + CSS + JS puro, sem build) servida pela própria API:

- cria conta, entra e sai (o token fica só na sessão do navegador);
- lista restaurantes com foto, cadastra restaurante e troca a foto;
- abre o **cardápio** do restaurante com foto, preço e descrição de cada prato;
- cadastra pratos e envia/troca a foto de cada prato;
- mostra o perfil e troca a foto de perfil.

A lista de endpoints da API continua em `/api.html`. Teste do front (simula o
navegador, sem servidor nem banco): `npm run front:test`.

---

## Endpoints

Base: `/api/v1` (os caminhos antigos `/restaurants` e `/auth` seguem válidos).

### Autenticação

| Método | Rota | Protegida | Descrição |
|---|---|---|---|
| POST | `/auth/register` | — | Cadastro. `201` se ativo, `202` se falta confirmar e-mail |
| POST | `/auth/login` | — | Retorna `accessToken` |
| POST | `/auth/confirm` | — | Confirma a conta com código de 6 dígitos (Cognito) |
| POST | `/auth/resend-code` | — | Reenvia o código de confirmação |
| POST | `/auth/refresh` | — | Renova o access token |
| POST | `/auth/logout` | ✅ | Encerra a sessão (Cognito) |
| GET | `/auth/me` | ✅ | Perfil do usuário autenticado (inclui `imageUrl`) |
| POST | `/auth/me/image` | ✅ | Foto do perfil do usuário do token (multipart, campo `image`) |

### Restaurantes

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/restaurants` | público | Lista paginada com filtros |
| GET | `/restaurants/:id` | público | Detalhe |
| POST | `/restaurants` | autenticado | Cria e dispara os e-mails de cadastro |
| PATCH | `/restaurants/:id` | autenticado | Atualiza parcialmente |
| DELETE | `/restaurants/:id` | `admin` / `owner` | Desativa (soft delete) |

| POST | `/restaurants/:id/image` | autenticado | Foto do restaurante (multipart, campo `image`) |

**Filtros:** `?pagina=1&limite=10&categoria=Italiana&busca=cantina&notaMinima=4`

### Pratos

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/dishes?restaurantId=1` | público | Lista paginada (filtros: `restaurantId`, `busca`) |
| GET | `/dishes/:id` | público | Detalhe |
| POST | `/dishes` | autenticado | Cria. Body: `{ restaurantId, name, price, description? }` |
| PATCH | `/dishes/:id` | autenticado | Atualiza parcialmente |
| DELETE | `/dishes/:id` | `admin` / `owner` | Desativa (soft delete) |
| POST | `/dishes/:id/image` | autenticado | Foto do prato (multipart, campo `image`) |
| GET | `/restaurants/:restaurantId/dishes` | público | Cardápio do restaurante (com `imageUrl` de cada prato) |
| POST | `/restaurants/:restaurantId/dishes` | autenticado | Cria prato no restaurante da URL. Body: `{ name, price, description? }` |

### Fotos

Perfil, restaurante e prato usam o **mesmo** `image.service.js`. O upload
(PNG/JPG/WEBP, até 5 MB, campo `image`) é otimizado na hora (800 px, WebP) e a
resposta `200` já traz o `imageUrl` (ex.: `/uploads/<uuid>.webp`), que abre no
navegador. Ao trocar a foto, o arquivo antigo é apagado. O perfil usa sempre o
usuário **do token**; nenhum id é aceito na requisição.

Teste com o `curl.exe` do Windows (no PowerShell 5.1 não há `-Form`):

```
curl.exe -X POST http://localhost:3000/api/v1/auth/me/image -H "Authorization: Bearer $token" -F "image=@C:\caminho\foto.jpg"
```
---

## E-mail (Atividade 6)

Ao cadastrar um restaurante, a API grava no banco **e depois** dispara dois
e-mails pela mesma função `sendEmail()` (boas-vindas e aviso ao comercial). A
falha do e-mail **não** impede o cadastro. Decisão em
[`docs/ADR-005-servico-de-email.md`](docs/ADR-005-servico-de-email.md).

Por padrão (`EMAIL_PROVIDER=console`) o e-mail só aparece no log. Para enviar
de verdade pelo [Resend](https://resend.com):

1. Crie uma conta e uma chave de API.
2. No `.env`: `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY=...` e
   `EMAIL_TO_TEST=` o e-mail **da sua conta Resend** (sem domínio verificado,
   o Resend só entrega para ele).
3. Reinicie, faça login e cadastre um restaurante.

Para provar que a falha do e-mail não derruba o cadastro, use
`EMAIL_SIMULATE_FAILURE=true`: o terminal registra o erro, a API responde
`201` e o restaurante continua no banco.

---

## Função serverless de imagens (Aula 8)

`src/functions/optimizeImage/` redimensiona (800 px, sem ampliar) e converte
para WebP (qualidade 80). Para ver o fluxo evento → função → resultado, com
**cold start × warm start**:

```bash
npm run image:local                         # gera uma foto 4000x3000 de exemplo
npm run image:local -- caminho/minha-foto.jpg
```

Os resultados vão para `storage/` (ignorado pelo Git). Conceitos em
[`docs/SERVERLESS.md`](docs/SERVERLESS.md); decisão e análise de trade-offs em
[`docs/ADR-006-processamento-de-imagens.md`](docs/ADR-006-processamento-de-imagens.md).

> A API processa as fotos **em processo**, com a mesma função `optimizeImage`
> (resposta imediata). O formato **serverless** (função acionada por evento,
> armazenamento em S3, publicação em provedor) está **desenhado no ADR-006 e
> demonstrado com o simulador**, mas não foi publicado em nenhum provedor.

---

## Formato das respostas

Listagem:

```json
{
  "dados": [ { "id": 1, "name": "Sushi Zen", "category": "Japonesa", "rating": 4.9 } ],
  "paginacao": { "pagina": 1, "limite": 10, "total": 2, "totalPaginas": 1,
                 "temProxima": false, "temAnterior": false }
}
```

Erro (sempre com esta forma, em toda a API):

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Já existe um restaurante chamado \"Cantina Roma\".",
    "requestId": "8f66802d-3d29-456a-9341-0ca33ff70c34"
  }
}
```

O `requestId` também volta no header `x-request-id` e aparece nos logs.

---

## Estrutura

```
easy-food/
├── prisma/schema.prisma
├── docs/
│   ├── ARQUITETURA.md                      ← por que cada escolha foi feita
│   ├── ADR-004-autenticacao.md
│   ├── ADR-005-servico-de-email.md
│   ├── ADR-006-processamento-de-imagens.md
│   ├── SERVERLESS.md                       ← conceitos: FaaS, cold start, trade-offs
│   ├── COGNITO-SETUP.md
│   ├── ATIVIDADE-respostas.md              ← aula 5 (camadas e autenticação)
│   └── ATIVIDADES-aulas-6-a-8.md           ← e-mail, desenho da aula 7, aula 8
├── scripts/
│   ├── smoke-test.js                       ← testes da API
│   ├── image-test.js                       ← testes da função de imagem
│   ├── front-test.js                       ← testes do front (jsdom)
│   ├── optimize-image-local.js             ← demo local da função serverless
│   └── demo.ps1                            ← demonstração guiada (PowerShell)
├── public/                                 ← front-end (index.html, app.js, styles.css)
├── src/
│   ├── config/env.js                       ← configuração validada (fail-fast)
│   ├── database/prisma.js
│   ├── functions/optimizeImage/handler.js  ← função serverless
│   ├── shared/                             ← erros, logger, middlewares, simulador FaaS
│   ├── modules/
│   │   ├── auth/                           ← providers: cognito + local
│   │   ├── restaurants/                    ← routes, controller, service, repository, schema
│   │   ├── dishes/                         ← pratos (mesmo padrão em camadas)
│   │   ├── shared/email.service.js         ← sendEmail()
│   │   ├── shared/image.service.js         ← otimiza e guarda imagens (reutilizado)
│   │   ├── shared/upload.middleware.js     ← Multer: recebe e valida o arquivo
│   │   └── health/
│   └── app.js
└── server.js
```

---

## Trocando o provider de autenticação

```env
AUTH_PROVIDER=local     # JWT + bcrypt, sem AWS
AUTH_PROVIDER=cognito   # AWS Cognito
```

Nenhuma regra de negócio muda. Motivo no [ADR-004](docs/ADR-004-autenticacao.md).

---

## Demonstração para apresentação

Com o servidor rodando em uma janela (`node server.js`), abra **outra** janela
do PowerShell na pasta do projeto:

```powershell
.\scripts\demo.ps1
```

Executa o fluxo da API (validação, cadastro, login, rota protegida, regra de
negócio, paginação, RBAC e rate limit) com pausa entre as etapas. Cada execução
usa um e-mail novo, então pode ser repetida.

---

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe com reload automático |
| `npm start` | Sobe em modo normal |
| `npm test` | Roda `smoke` + `image:test` |
| `npm run smoke` | Testes da API (70 verificações, sem banco) |
| `npm run front:test` | Testa o front-end em um navegador simulado (26 verificações) |
| `npm run image:test` | Testes da função de imagem e do simulador (21 verificações) |
| `npm run image:local` | Demo local da função serverless |
| `npm run prisma:migrate` | Aplica migrações |
| `npm run prisma:studio` | Abre a interface visual do banco |
