# EasyFood — Atividade 6 e Aulas 7 e 8

## Atividade 6 — Serviço de envio de e-mail

### Fluxo implementado

```
POST /restaurants
      |
      v
restaurant.controller.js
      |
      v
restaurant.service.js
      |
      +----> repository.criar()          OPERAÇÃO PRINCIPAL (PostgreSQL)
      |
      +----> notificarCadastro()         AÇÃO SECUNDÁRIA (sem await)
                  |
                  +--> emailService.sendEmail()  -> e-mail de boas-vindas
                  +--> emailService.sendEmail()  -> notificação ao comercial
                              |
                              v
                        API de e-mail (Resend)
```

### Checklist

- [x] Uma API de envio de e-mail foi escolhida e configurada — Resend, via `fetch`
- [x] As credenciais estão no `.env` (`EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`)
- [x] A pasta `modules/shared` foi criada
- [x] `email.service.js` foi criado — `src/modules/shared/email.service.js`
- [x] Existe uma função genérica `sendEmail()`
- [x] O serviço recebe destinatário, assunto, header, body e footer
- [x] O cadastro de restaurante dispara um e-mail (dois, na verdade)
- [x] A mesma função envia conteúdos diferentes (boas-vindas e comercial)
- [x] Uma falha no e-mail não impede o cadastro (testado, ver abaixo)
- [x] O restaurante continua sendo salvo no PostgreSQL mesmo se o e-mail falhar

### Como testar a falha (Parte 12)

Em vez de editar o código com um `throw` temporário, a falha é ligada por
variável de ambiente:

```
EMAIL_SIMULATE_FAILURE=true
```

Cadastre um restaurante: o terminal registra
`Erro ao enviar e-mail de boas-vindas`, mas a API responde `201 Created` e o
restaurante aparece em `GET /restaurants`. O `npm run smoke` automatiza isso.

### O que foi testado e o que não foi

- **Testado automaticamente:** os dois e-mails saem com a mesma `sendEmail()`;
  falha simulada não impede o `201` nem a gravação; HTML malicioso no nome do
  restaurante é escapado.
- **Não testado aqui:** o envio real pela API do Resend (exige uma chave de
  API sua). Teste local: coloque a chave no `.env`, use o e-mail da sua conta
  Resend em `EMAIL_TO_TEST` e cadastre um restaurante.

---

## Aula 7 — "Como você faria?" (desenho da proposta)

Pedido da aula: um desenho simples, sem implementar. Cenário: **restaurantes
vão enviar uma imagem/logo**, que precisa ser recebida, redimensionada,
otimizada e disponibilizada em uma nova versão.

```
 Restaurante / App
        |
        | 1. upload (<= 5 MB, PNG/JPG/WEBP)
        v
 API EasyFood (monólito modular)
        |  valida e confirma o recebimento (202)
        v
 Armazenamento  ........ imagem ORIGINAL
        |
        | 2. evento "nova imagem enviada"
        v
 Função serverless optimizeImage
        |  redimensiona (800px) + comprime (WebP)
        v
 Armazenamento  ........ imagem OTIMIZADA  ->  URL pública
```

| Pergunta | Resposta |
|---|---|
| **Onde** o processamento acontece? | Fora da API, em uma função serverless. A API continua cuidando de restaurantes. |
| **Quando** o código executa? | Quando um evento de upload chega ao armazenamento, e só então. |
| **Quem** inicia o processamento? | O **evento do armazenamento** (trigger), não a API: ela nem precisa saber que a função existe. |
| **Como** se encaixa na arquitetura atual? | A EasyFood segue um monólito modular. Acrescenta-se um componente independente, acionado por evento — combinando estilos arquiteturais onde faz sentido. |

---

## Aula 8 — "Como você resolveria?"

| Pergunta | Resposta |
|---|---|
| **Quem recebe a imagem?** | A API EasyFood. Ela valida tipo e tamanho e grava o original. Não processa. |
| **Quem processa?** | A função `optimizeImage`, fora da API. |
| **O usuário precisa esperar?** | Não. A API responde `202 Accepted` ao confirmar o recebimento; a imagem otimizada fica disponível depois. A tela mostra uma imagem provisória enquanto o status é `PENDENTE`. |
| **O que acontece se o processamento falhar?** | O cadastro do restaurante **não é afetado** (mesmo princípio do e-mail: ação secundária). O original continua guardado, o status permanece `PENDENTE`/`FALHOU`, e a falha deve ser registrada e reprocessável (retentativa ou fila de mensagens com falha). |

### Qual solução escolher? (cenários A, B e C)

Resumo; o raciocínio completo está no [ADR-006](./ADR-006-processamento-de-imagens.md).

| Cenário | Escolha | Por quê |
|---|---|---|
| **A** — poucas imagens por dia | Dentro da API | Volume baixo: serverless só adicionaria complexidade e dependência |
| **B** — milhares de imagens, com picos | Função serverless | Carga irregular e por evento; escala sozinha e protege a API |
| **C** — imagem imediatamente disponível | Síncrono na API (ou serverless com mitigações) | Serverless por evento é assíncrono; "imediato" exige esperar o processamento |

**Resposta à pergunta do slide:** não, **não usaria a mesma arquitetura nos
três cenários** — os atributos de qualidade pesam diferente em cada um
(escalabilidade no B, latência no C, custo e manutenibilidade no A).

---

## O que foi implementado nesta etapa

| Item | Situação |
|---|---|
| Serviço de e-mail compartilhado + uso no cadastro | Implementado e testado |
| Função `optimizeImage` (Sharp) + handler FaaS | Implementada e testada |
| Simulador de cold start / warm / concorrência / timeout | Implementado e testado |
| ADR-005 (e-mail) e ADR-006 (imagens) | Escritos |
| Módulo de pratos (`/dishes`) com criação corrigida | Implementado e testado |
| Foto de perfil, de restaurante e de prato (Multer + `image.service.js` compartilhado, resposta imediata) | Implementado e testado (armazenamento em disco local) |
| Armazenamento em nuvem (S3), gatilho por evento de storage, deploy em Lambda | **Não implementado** (desenhado no ADR-006) |

### Correção da criação de pratos

Antes, um `restaurantId` inexistente chegava ao banco e estourava a chave estrangeira (erro genérico), e o mesmo prato podia ser cadastrado várias vezes. Agora `criar()` verifica **antes de gravar**: restaurante existe (`404` claro), nome único dentro do restaurante (`409`), preço positivo com 2 casas (`400`). O preço é `Decimal` no banco e **número** no JSON (o Prisma o serializaria como texto).

**Limitação conhecida:** qualquer usuário autenticado pode enviar foto para qualquer restaurante/prato — ainda não existe vínculo "dono" entre usuário e restaurante. Próximo passo natural: campo `ownerId` e checagem de posse.


---

## Atividade 8 — Correção de pratos e upload de imagens

### Parte 1 — Correção do cadastro de pratos

O repositório do professor não foi comparado aqui (o link não estava disponível). Para identificar o que ele alterou, rode na pasta do projeto:

```
git remote add professor URL_DO_REPOSITORIO_DO_PROFESSOR
git fetch professor
git diff main professor/main --stat
git diff main professor/main -- src/modules/dishes
```

A rota pedida na atividade existe: `POST /restaurants/:restaurantId/dishes`. Nesta implementação, o `restaurantId` vem **da URL** (não do corpo) e o Service confere antes de gravar: restaurante existe (`404`), nome único no restaurante (`409`), preço positivo com 2 casas (`400`); o preço é `Decimal` no banco e número no JSON.

### Checklist

- [x] Cadastro de pratos funcionando (`201`, associado ao restaurante da URL)
- [x] Usuário autenticado adiciona imagem ao perfil (`POST /auth/me/image`, usuário vem do token)
- [x] Pratos recebem imagens (`POST /dishes/:id/image`)
- [x] Imagens otimizadas com Sharp (800 px, WebP)
- [x] Processamento reutilizado: perfil, prato e restaurante usam `image.service.js`
- [x] Caminhos guardados no PostgreSQL (`imageUrl` em `User`, `Dish` e `Restaurant`)
- [x] Imagens acessíveis pelo navegador (`/uploads/<uuid>.webp`)
- [x] Rotas de upload protegidas com JWT (`401` sem token)
- [x] Funcionalidades anteriores continuam passando nos testes

| Teste | Resultado |
|---|---|
| Cadastrar um prato | `201 Created` |
| Foto do perfil autenticado | `200`, `perfil.imageUrl` preenchido |
| Foto para um prato | `200`, `imageUrl` no prato |
| Consultar dados atualizados | `GET /auth/me` e `GET /restaurants/:id/dishes` devolvem o caminho |
| Abrir a URL da imagem | WebP de 800 px |
| Upload sem JWT | `401` |
| Arquivo inválido / acima de 5 MB | `400` / `413` |
| Prato inexistente | `404` |

### Parte 6 — Pense como arquiteto

- **Por que reutilizar o mesmo serviço de imagens?** Perfil, prato e restaurante precisam da mesma coisa: validar, otimizar, guardar e apagar a antiga. Duas cópias divergiriam (uma ganharia a validação de tamanho, a outra não). Com um serviço, uma correção vale para todos.
- **Controller x Service:** o Controller traduz HTTP (lê `req`, escolhe o status, devolve `res`). O Service aplica as regras (o prato existe? qual era a imagem anterior?). O Service não conhece HTTP.
- **Por que não processar nas rotas?** A rota só mapeia caminho e proteção. Imagem processada na rota não seria reaproveitável nem testável sem subir o servidor, e misturaria três responsabilidades.
- **Como o middleware protege a foto do perfil?** `authenticate` valida o JWT antes do upload e coloca a identidade em `req.user`. O Service usa `req.user.sub`, nunca um id enviado pelo cliente, então ninguém troca a foto de outra pessoa. Como `authenticate` roda antes do Multer, uma requisição sem token é recusada sem ler o arquivo.
- **Se o processamento falhar?** Arquivo inválido: `400` e nada é gravado. Arquivo grande: `413`. Falha inesperada: `500` registrado no log. Em todos os casos o banco não é atualizado e a foto anterior continua valendo. Se gravar o novo arquivo funcionar mas o banco falhar, o arquivo novo é apagado, para não sobrar lixo.
- **Dá para adicionar funcionalidades sem mexer em tudo?** Sim: foi o que esta atividade fez. Foi criado um `upload.middleware.js` e um `image.service.js`, e três módulos passaram a usá-los sem mudar as regras uns dos outros.

**Trade-off assumido:** processar na própria API usa CPU/memória do servidor. É adequado ao volume atual e à exigência de resposta imediata; se os uploads crescerem, o caminho é a função serverless descrita no [ADR-006](./ADR-006-processamento-de-imagens.md).
