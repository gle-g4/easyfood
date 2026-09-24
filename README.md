# EasyFood API

Monólito modular em Node.js + Express, com PostgreSQL (Prisma) e autenticação
plugável: **AWS Cognito** em produção, **JWT local** em desenvolvimento.

> A documentação de arquitetura, com a justificativa de cada decisão, está em
> [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

---

## Começando (sem AWS, em 3 minutos)

```bash
npm install
cp .env.example .env          # Windows: copy .env.example .env
# edite o .env e preencha DATABASE_URL (Neon, Docker ou Postgres local)

npx prisma migrate dev --name init
npm run dev
```

O `.env.example` já vem com `AUTH_PROVIDER=local`, então **não é preciso conta
AWS** para rodar o projeto inteiro. Para usar o Cognito, siga
[`docs/COGNITO-SETUP.md`](docs/COGNITO-SETUP.md).

### Verificando que está tudo certo

```bash
npm run smoke
```

Roda 32 verificações do fluxo principal (cadastro, login, permissões, paginação,
rate limit, tratamento de erro) **sem precisar de banco** — ele substitui o
Prisma por um fake em memória.

---

## Endpoints

Base: `/api/v1` (os caminhos antigos `/restaurants` e `/auth` seguem válidos).

### Autenticação

| Método | Rota | Protegida | Descrição |
|---|---|---|---|
| POST | `/auth/register` | — | Cadastro. `201` se ativo, `202` se falta confirmar e-mail |
| POST | `/auth/login` | — | Retorna `accessToken` e `refreshToken` |
| POST | `/auth/confirm` | — | Confirma a conta com código de 6 dígitos (Cognito) |
| POST | `/auth/resend-code` | — | Reenvia o código de confirmação |
| POST | `/auth/refresh` | — | Renova o access token |
| POST | `/auth/logout` | ✅ | Encerra a sessão globalmente (Cognito) |
| GET | `/auth/me` | ✅ | Perfil do usuário autenticado |

### Restaurantes

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/restaurants` | público | Lista paginada com filtros |
| GET | `/restaurants/:id` | público | Detalhe |
| POST | `/restaurants` | autenticado | Cria |
| PATCH | `/restaurants/:id` | autenticado | Atualiza parcialmente |
| DELETE | `/restaurants/:id` | `admin` / `owner` | Desativa (soft delete) |

**Filtros da listagem:** `?pagina=1&limite=10&categoria=Italiana&busca=cantina&notaMinima=4`

### Saúde

| Rota | Descrição |
|---|---|
| `GET /health/live` | O processo está vivo? (não toca no banco) |
| `GET /health/ready` | Dá para receber tráfego? (verifica o banco) |

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

O `requestId` também volta no header `x-request-id` e aparece nos logs do
servidor — é o que liga o que o usuário viu à trilha de execução.

---

## Estrutura

```
easy-food/
├── prisma/schema.prisma
├── docs/
│   ├── ARQUITETURA.md          ← por que cada escolha foi feita
│   ├── ADR-004-autenticacao.md ← decisão sobre Cognito
│   ├── COGNITO-SETUP.md        ← passo a passo na AWS
│   └── ATIVIDADE-respostas.md
├── scripts/smoke-test.js
├── src/
│   ├── config/env.js           ← configuração validada (fail-fast)
│   ├── shared/
│   │   ├── errors/AppError.js
│   │   ├── http/asyncHandler.js
│   │   ├── logger.js
│   │   └── middlewares/        ← requestContext, validate, errorHandler, rateLimit
│   ├── database/prisma.js
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── providers/      ← contrato + cognito + local + factory
│   │   │   ├── auth.{routes,controller,service,schema,middleware}.js
│   │   ├── restaurants/
│   │   │   └── restaurant.{routes,controller,service,repository,schema}.js
│   │   └── health/health.routes.js
│   └── app.js
└── server.js
```

---

## Trocando o provider de autenticação

Uma linha no `.env`:

```env
AUTH_PROVIDER=local     # JWT + bcrypt, sem AWS
AUTH_PROVIDER=cognito   # AWS Cognito
```

Nenhuma regra de negócio muda. O motivo dessa arquitetura está no
[ADR-004](docs/ADR-004-autenticacao.md).

---

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe com reload automático |
| `npm start` | Sobe em modo normal |
| `npm run smoke` | Teste de fumaça (32 verificações, sem banco) |
| `npm run prisma:migrate` | Aplica migrações |
| `npm run prisma:studio` | Abre a interface visual do banco |
