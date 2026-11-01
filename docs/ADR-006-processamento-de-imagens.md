# ADR-006 — Processamento de imagens fora da API (função serverless)

- **Status:** ACEITO (função implementada e testada localmente; publicação em provedor adiada — ver "Quando revisitar")
- **Data:** 25/10/2026
- **Responsável:** Equipe EasyFood
- **Relacionado a:** ADR-003 (monólito modular), ADR-005 (e-mail)

---

## 1. Contexto

Os restaurantes vão poder enviar uma imagem de perfil/logo. Fotos de celular
chegam com algo como **12 MB e 4000×3000 px**; para a tela basta uma versão de
cerca de **300 KB e 800×600 px**. Precisamos processar a imagem (redimensionar,
comprimir, gerar uma nova versão) **antes de disponibilizá-la**, sem prejudicar
as operações principais da EasyFood (cadastrar e consultar restaurantes).

## 2. Alternativas

### A) Processar dentro da API (ex.: Sharp no próprio Express)
- **Prós:** nenhuma peça nova; simples de desenvolver, testar e depurar.
- **Contras:** o processamento de imagem é trabalho de **CPU e memória**. Em
  Node.js, o que for pesado compete com todas as outras requisições da mesma
  API. Se vários restaurantes enviarem arquivos ao mesmo tempo, **o
  cadastro e a consulta de restaurantes ficam mais lentos para todo mundo**. E
  se o usuário espera o processamento para receber a resposta, o tempo de
  resposta do upload sobe.

### B) Serviço independente (um segundo servidor só para imagens)
- **Prós:** isola o consumo de recursos; escala separado da API.
- **Contras:** é outro servidor para provisionar, monitorar, atualizar e
  pagar **ligado o tempo todo**, mesmo sem nenhum upload. Aumenta a
  complexidade operacional que o ADR-003 quis evitar.

### C) Função serverless (FaaS) acionada por evento de upload
- **Prós:** o provedor gerencia a infraestrutura; a função só roda quando há
  imagem nova; escala sozinha em picos; cobrança proporcional ao uso; a API
  fica livre do trabalho pesado.
- **Contras:** **cold start**, limites de execução (tempo e memória),
  dependência do provedor, custo que pode crescer com volume alto e constante,
  e o resultado fica pronto **depois**, não na hora (assíncrono).

## 3. Decisão

Adotar a alternativa **C**, mantendo a EasyFood como **monólito modular**
(combinar estilos arquiteturais quando faz sentido):

```
Restaurante
   |  POST (upload)
   v
API EasyFood  --- valida tipo e tamanho (<= 5 MB) --- confirma recebimento (202)
   |
   v
Armazenamento (imagem ORIGINAL)
   |  evento: "nova imagem enviada"   (trigger)
   v
Função serverless optimizeImage
   |  redimensiona (800px, sem ampliar) + comprime (WebP, qualidade 80)
   v
Armazenamento (imagem OTIMIZADA)  -->  URL disponível depois
```

O que cada peça faz:

- **API:** continua cuidando de restaurantes. Valida (regra de negócio de
  upload: PNG/JPG/WEBP, até 5 MB), guarda o original e responde.
- **Função:** só otimiza imagens. Não conhece restaurantes, banco nem HTTP.
- **Quem dispara:** o **evento de upload** no armazenamento (não a API
  chamando a função). Assim a API não precisa saber que a função existe.

### O que está implementado hoje e o que está só desenhado

| Item | Situação |
|---|---|
| `optimizeImage(buffer)` — função pura com Sharp | **Implementada e testada** |
| `handler(event)` — adaptador no formato FaaS (evento → arquivo) | **Implementada e testada** |
| Simulador de plataforma (cold start, warm, concorrência, timeout) | **Implementado e testado** |
| Upload na API (`/auth/me/image`, `/dishes/:id/image`, `/restaurants/:id/image`) com Multer e `image.service.js` compartilhado: valida (PNG/JPG/WEBP, até 5 MB), otimiza, guarda o `.webp` e grava `imageUrl` no banco | **Implementado e testado** |
| Modo de execução usado pela API: a mesma função `optimizeImage` roda **em processo** e a resposta já traz a imagem pronta. É o **cenário C** da seção 4 (imagem disponível imediatamente); a atividade exige isso | **Implementado** |
| Modo serverless (evento do storage dispara a função, resposta assíncrona) | **Desenhado e simulado** (`npm run image:local`), não ligado à API |
| Armazenamento em nuvem (S3 ou similar) | **Desenhado, não implementado** (usa disco local) |
| Publicação em provedor real (ex.: AWS Lambda + S3) | **Não feita** |

A função foi escrita de forma que, em uma plataforma real, **só o `handler`
muda** (ler do S3 em vez do disco). A lógica de otimização não é reescrita.

## 4. Escolha por cenário (a mesma arquitetura nos três?)

Atributos considerados: escalabilidade, desempenho (latência), custo,
manutenibilidade e dependência de tecnologia.

| Cenário | Melhor escolha | Raciocínio |
|---|---|---|
| **A — poucas imagens por dia** | **Dentro da API (alternativa A)** | Com baixo volume o impacto de CPU é desprezível. Serverless acrescentaria provedor, permissões e eventos para resolver um problema que ainda não existe: complexidade e dependência sem ganho de escala. É o caso de "comece simples, evolua quando realmente precisar". |
| **B — milhares de imagens, com picos** | **Função serverless (alternativa C)** | É o caso ideal: carga irregular e orientada a evento. Escala automática absorve o pico sem manter servidor ocioso e sem derrubar a API. Cold start em um trabalho assíncrono é irrelevante. |
| **C — imagem disponível imediatamente após o envio** | **Processar de forma síncrona dentro da API (A), ou serverless com mitigações** | Serverless por evento é assíncrono: a imagem otimizada aparece depois. Se "imediato" é requisito, esperar o processamento é obrigatório. Alternativas: processar na API (aceitando o custo de CPU), ou exibir o original redimensionado pelo navegador enquanto a versão otimizada não chega, ou manter instâncias aquecidas (custo extra). |

**Conclusão:** a decisão **depende do cenário**. Serverless não é "sempre
melhor" — é a melhor resposta para carga variável e assíncrona, e a pior
para volume baixo e constante ou para requisito de resposta imediata.

## 5. Consequências

**O que ganhamos**
- A API não gasta CPU/memória com imagens; consultas e cadastros não
  degradam durante picos de upload.
- Escala automática do processamento; sem servidor ocioso.
- Função pequena, de responsabilidade única e testável sem nuvem.

**O que passamos a administrar**
- **Cold start:** a primeira execução após um período parado paga tempo
  extra de inicialização (no simulador, ~900 ms contra ~150 ms com o ambiente
  reaproveitado). Aceitável aqui porque ninguém espera a resposta.
- **Limites de execução:** tempo máximo, memória e concorrência. Na AWS Lambda,
  por exemplo, o tempo máximo é de 15 minutos; imagens enormes ou lotes
  muito grandes podem exigir outro desenho.
- **Assincronia:** o cliente precisa lidar com "imagem em processamento"
  (um status `PENDENTE`/`PRONTA` e uma imagem provisória).
- **Falhas silenciosas:** se a função falhar, ninguém é avisado na hora. É
  preciso monitorar e ter retentativa/fila de mensagens que falharam.
- **Dependência do provedor e custo:** com volume alto e constante o custo por
  execução pode superar o de um servidor dedicado; trocar de provedor exige
  adaptar o `handler` e a infraestrutura de eventos.

## 6. Segurança da função (decisões já implementadas)

- Valida pelo **conteúdo** do arquivo, não pela extensão.
- Aceita só PNG, JPEG e WEBP; teto de 20 MB e de 50 milhões de pixels (evita
  "image bomb": arquivo pequeno com dimensões gigantes que estoura memória).
- `withoutEnlargement`: nunca amplia imagem pequena.
- Aplica a orientação EXIF e **descarta os metadados** (inclusive GPS) na
  saída — foto de celular pode carregar a localização do restaurante ou do dono.

## 7. Quando revisitar

- Quando o volume de uploads justificar publicar em um provedor (hoje, só local).
- Se aparecer requisito de imagem disponível imediatamente (cenário C).
- Se o custo mensal da função passar o de um servidor dedicado.
