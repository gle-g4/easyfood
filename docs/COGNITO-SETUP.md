# Configurando o AWS Cognito para a EasyFood

> **Você não precisa disso para rodar o projeto.** Com `AUTH_PROVIDER=local`
> a API funciona inteira sem AWS. Siga este guia só quando quiser testar o
> provider de produção.

---

## 1. Criar o User Pool

1. Acesse o console da AWS → **Cognito** → **Create user pool**.
2. **Sign-in options:** marque **Email**.
3. **Password policy:** deixe a padrão (mínimo 8 caracteres, com maiúscula,
   minúscula e número). Ela é a mesma que o `auth.schema.js` já valida do
   nosso lado — se você mudar aqui, ajuste o schema também.
4. **MFA:** pode deixar *No MFA* por enquanto. Ativar depois não exige
   nenhuma mudança de código.
5. **Self-service sign-up:** **habilitado** (a API cadastra usuários).
6. **Email:** use *Send email with Cognito* (suficiente para desenvolvimento).
7. Dê um nome ao pool, por exemplo `easyfood-users`.

Ao final, anote o **User pool ID** (formato `us-east-1_XXXXXXXXX`).

## 2. Criar o App Client

1. Dentro do pool, vá em **App integration** → **App clients** → **Create**.
2. Tipo: **Public client** (nosso backend guarda o secret, mas o fluxo usado
   dispensa; se marcar *Confidential*, preencha `COGNITO_CLIENT_SECRET`).
3. **Authentication flows:** marque **ALLOW_USER_PASSWORD_AUTH**.
   Sem isso, o login retorna `InvalidParameterException` — é o erro mais
   comum nessa configuração.
4. Marque também **ALLOW_REFRESH_TOKEN_AUTH** para a rota `/auth/refresh`.

Anote o **Client ID**.

## 3. Criar os grupos (RBAC)

Em **Groups**, crie:

- `admin` — pode excluir restaurantes
- `owner` — dono de restaurante

Os grupos aparecem no token como `cognito:groups` e são lidos pelo middleware
`authorize()`. Para tornar alguém admin, basta adicionar o usuário ao grupo no
console — **nenhuma mudança de código ou banco**.

## 4. Preencher o `.env`

```env
AUTH_PROVIDER=cognito
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
# Só se o App Client tiver sido criado COM secret:
COGNITO_CLIENT_SECRET=
```

Reinicie o servidor. No log de subida deve aparecer:

```
provider de autenticação carregado { provider: 'cognito' }
```

## 5. Testar o fluxo completo

```powershell
# 1. Cadastro — retorna 202 (falta confirmar o e-mail)
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/register" -Method Post `
  -ContentType "application/json" `
  -Body '{"name":"Gleice","email":"seu@email.com","password":"SenhaForte1"}'

# 2. Confirmar com o código de 6 dígitos que chegou no e-mail
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/confirm" -Method Post `
  -ContentType "application/json" `
  -Body '{"email":"seu@email.com","codigo":"123456"}'

# 3. Login — retorna accessToken e refreshToken
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/login" -Method Post `
  -ContentType "application/json" `
  -Body '{"email":"seu@email.com","password":"SenhaForte1"}'
$token = $r.tokens.accessToken

# 4. Usar o token
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/me" `
  -Headers @{ Authorization = "Bearer $token" }
```

## 6. Erros comuns

| Erro | Causa provável |
|---|---|
| `InvalidParameterException` no login | `ALLOW_USER_PASSWORD_AUTH` não habilitado no App Client |
| `NotAuthorizedException: SECRET_HASH was not received` | O App Client tem secret; preencha `COGNITO_CLIENT_SECRET` |
| `USER_NOT_CONFIRMED` | Falta confirmar o código enviado por e-mail |
| `InvalidPasswordException` | Senha fora da política do pool |
| Token sempre inválido | `COGNITO_USER_POOL_ID` ou `COGNITO_REGION` errados |

## 7. Uma observação sobre custo

O nível gratuito do Cognito cobre com folga o estágio atual do projeto. Ainda
assim, vale lembrar do que diz o ADR-004: o custo entrar na conta é um dos
gatilhos para revisitar a decisão. Como toda a integração está confinada em
um arquivo, essa revisão sai barata.
