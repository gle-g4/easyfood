# ADR-004 — Autenticação com AWS Cognito atrás de uma abstração de provider

- **Status:** ACEITO
- **Data:** 21/09/2026
- **Responsável:** Equipe EasyFood
- **Substitui:** nada
- **Relacionado a:** ADR-003 (arquitetura monolítica modular)

---

## Contexto

A EasyFood chegou ao ponto em que precisa saber *quem* está usando a API. Até
agora, `POST /restaurants` era aberto: qualquer pessoa na internet poderia
cadastrar um restaurante. Além disso, os próximos módulos do roadmap (Pedidos,
Avaliações) só fazem sentido com um usuário identificado — um pedido pertence
a alguém.

Restrições do momento, herdadas do ADR-003:

- equipe pequena, sem especialista em segurança;
- produto ainda inicial, com prioridade em velocidade de entrega;
- baixa complexidade operacional é um valor explícito do projeto;
- o projeto precisa continuar fácil de rodar por qualquer pessoa da equipe.

## Decisão

Adotamos **AWS Cognito** como provedor de identidade em produção, **acessado
exclusivamente através de uma abstração de provider** (`src/modules/auth/providers`),
com uma implementação alternativa **local (JWT + bcrypt)** usada em
desenvolvimento e testes.

A escolha do provider é feita por configuração (`AUTH_PROVIDER` no `.env`),
não por código.

## Alternativas consideradas

### A) JWT próprio com bcrypt (a escolha "óbvia")

- **Prós:** zero dependência externa, sem custo, controle total, rápido de
  começar.
- **Contras:** *nós* passamos a ser responsáveis por guardar senhas com
  segurança. Isso inclui política de senha, rotação, recuperação de conta,
  bloqueio por tentativas, e — o ponto mais delicado — um vazamento do
  PostgreSQL passa a significar vazamento de credenciais. Não há revogação
  real de token: um JWT roubado vale até expirar. MFA e login social exigiriam
  implementação própria.

### B) AWS Cognito  ← **escolhida**

- **Prós:** a senha **nunca entra no nosso banco**. Hash, política, MFA,
  verificação de e-mail, "esqueci minha senha", revogação global de sessão e
  login social vêm prontos, por configuração. Escala sem esforço nosso. O
  nível gratuito cobre folgadamente o estágio atual da EasyFood.
- **Contras:** acoplamento a um fornecedor; curva de aprendizado da console
  AWS; dependência de rede para cadastro e login; desenvolvimento local
  passaria a exigir conta AWS. Custo por usuário ativo acima do nível gratuito.

### C) Apenas "Login com Google" (OAuth2 puro)

- **Prós:** nenhuma senha, integração conhecida pelo usuário final.
- **Contras:** exclui quem não tem ou não quer usar conta Google; não atende
  sozinho o cadastro tradicional por e-mail. Vale mais como *complemento* — e
  é exatamente o que o Cognito oferece como Identity Provider federado depois.

## Por que Cognito, e não JWT próprio

A pergunta decisiva não foi "qual é mais fácil de escrever?", e sim
**"qual problema queremos ser donos?"**.

Guardar senha com segurança é um problema já resolvido, com consequências
graves quando malfeito, e que não diferencia a EasyFood de nenhum concorrente.
Entregar restaurantes e pedidos é o que diferencia. Cognito transfere o
problema de menor valor e maior risco para quem já o resolveu.

O argumento de "mas é só um bcrypt" ignora o que vem depois do bcrypt: expiração
de sessão, revogação, MFA, fluxo de recuperação, auditoria de acesso. Cada um
desses é uma sprint que não vamos gastar.

## A abstração: por que não chamar o Cognito direto

Aceitar o Cognito **não significa** espalhá-lo pelo código. Todo o contato com
a AWS está confinado em `cognito.provider.js`, atrás de um contrato
(`auth.provider.js`) com cinco métodos.

Isso resolve o principal contra da opção B — o acoplamento ao fornecedor:

1. **O desenvolvimento local não exige AWS.** `AUTH_PROVIDER=local` e a API
   sobe. Isso mantém a barreira de entrada do projeto praticamente em zero,
   preservando um valor do ADR-003.
2. **Os testes não dependem de serviço externo** pago e com rate limit.
3. **Trocar de provedor é uma decisão isolada.** Se um dia o Cognito deixar de
   servir, escrevemos um `auth0.provider.js` e mudamos uma linha do `.env`.
   Nenhuma regra de negócio muda.
4. **A abstração é honesta.** Ela tem duas implementações reais em uso — não é
   uma camada especulativa criada "por via das dúvidas".

## Consequências

### Positivas

- Nosso banco não armazena senhas quando o provider é o Cognito.
- MFA, verificação de e-mail e login social ficam disponíveis sem código novo.
- Papéis (RBAC) vêm dos **grupos do Cognito** dentro do próprio token; a API
  apenas confere, sem gerenciar permissões por conta própria.
- Validação de token é **local, via JWKS** — sem chamada de rede por
  requisição autenticada e sem custo por verificação.
- O projeto continua rodando sem conta AWS para quem for só desenvolver.

### Negativas (assumidas conscientemente)

- Uma camada de indireção a mais para entender no módulo de auth.
- O comportamento em produção (Cognito) difere do de desenvolvimento (local):
  confirmação de e-mail e revogação de sessão só existem no primeiro. Está
  documentado, mas exige atenção ao testar.
- Cadastro e login dependem da disponibilidade da AWS. *Requisições já
  autenticadas não dependem* — a verificação é local.
- Custo passa a existir acima do nível gratuito.

### Mitigações

- `local.provider.js` lança erro explícito `NOT_SUPPORTED` nas operações que
  não consegue cumprir, em vez de fingir sucesso e mascarar a diferença.
- O espelho local do usuário (`User`) mantém a base de identidades e seus
  relacionamentos no nosso banco, reduzindo o custo de uma eventual saída.

## Quando revisitar esta decisão

- Se o custo do Cognito passar a ser relevante frente à receita.
- Se surgir exigência regulatória de manter dados de identidade em território
  nacional.
- Se precisarmos de fluxos de autenticação que o Cognito não suporte bem.
