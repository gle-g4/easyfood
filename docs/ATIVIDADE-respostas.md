# EasyFood — Atividade: Arquitetura em Camadas

## Parte 12 — Pense como Arquiteto

**Por que não deixamos tudo dentro do server.js?**
Porque ele acumularia responsabilidades demais (rotas, validação, acesso a
dados, configuração). Um arquivo assim cresce sem limite, dificulta testes e
faz com que qualquer alteração corra o risco de quebrar algo não relacionado.

**Qual é a responsabilidade do server.js?**
Ligar o servidor — e, neste projeto, também encerrá-lo com elegância quando
recebe SIGTERM (graceful shutdown).

**Qual é a responsabilidade do app.js?**
Montar a aplicação: middlewares, CORS, JSON, arquivos estáticos, registro das
rotas e, por último, os handlers de 404 e de erro.

**Qual é a responsabilidade das Routes?**
Mapear método + caminho para a função do Controller e declarar a política de
acesso da rota (pública, autenticada, restrita a um papel).

**Qual é a responsabilidade do Controller?**
Traduzir HTTP para o Service e de volta: ler os dados já validados, chamar o
Service e escolher o status code correto da resposta.

**Qual é a responsabilidade do Service?**
Concentrar as regras de negócio. Exemplo concreto neste projeto: "não pode
existir outro restaurante com o mesmo nome" é decisão de produto, e por isso
vive no Service — não no banco nem no Controller.

**Qual é a responsabilidade da camada Database?**
Expor uma conexão única com o PostgreSQL. Neste projeto, acrescentamos ainda a
camada **Repository**, que é a única autorizada a montar queries do Prisma.

**Por que o Service não deveria depender de req e res?**
Porque isso o prenderia ao HTTP. Sem essa dependência, o mesmo Service pode ser
chamado por um job agendado, um script de importação ou um teste — e é
testável sem subir um servidor.

**Por que as Routes não acessam diretamente o Prisma?**
Porque misturaria roteamento com acesso a dados, espalhando lógica de negócio
por toda a aplicação e tornando impossível reaproveitar ou testar essa lógica.

**O comportamento externo da API mudou?**
Na refatoração em camadas da aula, não — foi uma refatoração pura. Neste
projeto estendido, sim: adicionamos paginação, autenticação e novos endpoints.
Por isso a API passou a ser **versionada** (`/api/v1`), mantendo os caminhos
antigos funcionando para não quebrar clientes existentes.

**Que vantagem essa organização traz quando o sistema crescer?**
Cada mudança fica confinada. Trocar o ORM afeta o Repository; trocar o provedor
de login afeta um provider; mudar o formato de erro afeta um middleware. Sem
camadas, cada uma dessas mudanças tocaria dezenas de arquivos.

**Que nova complexidade essa organização adiciona?**
Mais arquivos, mais indireção e mais conceitos para quem chega ao projeto. Uma
requisição simples atravessa cinco camadas. O trade-off só compensa porque a
EasyFood vai crescer — em um script de 50 linhas, seria exagero.

---

## Parte 13 — Missão: Evolua a EasyFood

### 1. Organize

Módulo `auth/` criado seguindo o padrão dos demais, com uma subpasta a mais
para os providers:

```
src/modules/auth/
├── providers/
│   ├── auth.provider.js      contrato (Strategy Pattern)
│   ├── cognito.provider.js   implementação AWS Cognito
│   ├── local.provider.js     implementação JWT + bcrypt
│   └── index.js              factory que escolhe pelo .env
├── auth.routes.js
├── auth.controller.js
├── auth.service.js
├── auth.schema.js            validação com Zod
└── auth.middleware.js        authenticate / authorize / optionalAuth
```

### 2. Pesquise

| Opção | Prós | Contras |
|---|---|---|
| **JWT próprio** | Sem dependência externa, sem custo, rápido de começar | Nós viramos responsáveis por guardar senha; sem revogação real de token; MFA e recuperação de conta são código nosso |
| **AWS Cognito** | Senha nunca entra no nosso banco; MFA, verificação de e-mail, login social e revogação prontos; escala sem esforço | Acoplamento a fornecedor; curva de aprendizado; custo acima do nível gratuito |
| **Login com Google** | Sem senha, familiar ao usuário | Exclui quem não usa Google; não cobre cadastro por e-mail sozinho |

### 3. Justifique

**Solução escolhida: AWS Cognito, acessado através de uma abstração de provider.**

A pergunta decisiva não foi "o que é mais fácil de escrever?", e sim **"de qual
problema queremos ser donos?"**. Guardar senha com segurança é um problema já
resolvido, grave quando malfeito, e que não diferencia a EasyFood de ninguém.
Entregar restaurantes e pedidos é o que diferencia.

Com Cognito, nosso PostgreSQL **nunca armazena senha** — um vazamento do banco
deixa de ser um vazamento de credenciais. MFA, confirmação de e-mail, "esqueci
minha senha" e revogação de sessão passam a existir por configuração.

O principal contra dessa escolha é o acoplamento ao fornecedor. Resolvemos isso
confinando **todo** o contato com a AWS em um único arquivo, atrás de um
contrato de cinco métodos. Uma variável de ambiente decide qual implementação
roda. Isso preserva algo que o ADR-003 valoriza: qualquer pessoa da equipe
clona o repositório e roda a API sem conta AWS (`AUTH_PROVIDER=local`).

Ter **duas implementações reais** também é o que torna a abstração honesta —
uma camada criada para um único caso costuma ser a abstração errada.

**Trade-offs assumidos:** uma indireção a mais no módulo de auth; o
comportamento de desenvolvimento difere do de produção (o provider local não
tem confirmação de e-mail nem revogação, e lança `NOT_SUPPORTED` explicitamente
em vez de fingir que funciona); e passa a existir custo acima do nível
gratuito. Registrado no [ADR-004](./ADR-004-autenticacao.md), incluindo os
gatilhos para revisitar a decisão.

### Checklist da atividade

- [x] Estrutura em camadas criada
- [x] `database/prisma.js` criado
- [x] `restaurant.service.js` criado
- [x] `restaurant.controller.js` criado
- [x] `restaurant.routes.js` criado
- [x] `app.js` criado
- [x] `server.js` simplificado
- [x] `GET /restaurants` funcionando
- [x] `POST /restaurants` funcionando
- [x] Módulo `auth/` criado
- [x] Pesquisa sobre autenticação realizada
- [x] Solução escolhida e justificada
- [x] **Opcional: login implementado** — nos dois providers, com cadastro,
      confirmação, refresh, logout e RBAC por grupos

### Além do pedido

- Camada **Repository** (uma a mais que a arquitetura da aula)
- Tratamento de erro centralizado com códigos semânticos e `requestId`
- Validação declarativa com Zod + proteção contra mass assignment
- Paginação, filtros e busca na listagem
- Soft delete e campos de auditoria
- Rate limiting nas rotas de autenticação
- Logs estruturados com mascaramento de dados sensíveis
- Health checks separados (liveness × readiness)
- Graceful shutdown
- API versionada com compatibilidade retroativa
- Smoke test com 32 verificações, rodando sem banco
