# Serverless e FaaS na EasyFood

Resumo conceitual da Aula 8, sempre ligado ao código do projeto.

## O que é Serverless

Serverless **não significa "sem servidor"**: existem servidores, mas **quem
gerencia a infraestrutura é o provedor**. Você entrega o código; o provedor
decide onde e quando executá-lo, escala e cobra pelo uso.

## FaaS (Function as a Service)

Uma **função executada quando um evento acontece**:

```
EVENTO  ->  FUNÇÃO  ->  PROCESSAMENTO  ->  RESULTADO
```

Exemplos de eventos: upload de arquivo, requisição HTTP, mensagem em fila,
agendamento (horário definido).

> Serverless e arquitetura orientada a eventos **não são a mesma coisa**. Uma
> função serverless também pode ser executada por uma requisição HTTP.

## Execução sob demanda

| Servidor tradicional (nosso `server.js`) | Função serverless |
|---|---|
| Instância provisionada mesmo sem requisições | Capacidade alocada sob demanda |
| Sempre ativo, mesmo sem uso | Executa apenas quando necessário |

## Cold start

Quando a função fica um tempo sem executar, o provedor pode descartar o
ambiente. A próxima execução paga um **tempo adicional** para preparar tudo
antes de rodar o código.

- **Cold start:** evento → inicialização do ambiente → execução.
- **Warm start:** evento → execução (ambiente reaproveitado).

Para ver isso funcionando, rode `npm run image:local`: a função é invocada
duas vezes e o terminal mostra a diferença (~900 ms contra ~150 ms no
simulador; os números reais variam por provedor, runtime e tamanho do pacote).

## Trade-offs

| Vantagens | Limitações |
|---|---|
| Escalabilidade gerenciada | Cold start |
| Menos gestão de servidores | Limites de execução (tempo, memória, concorrência) |
| Cobrança associada ao uso | Custos podem crescer com uso alto e constante |
| Boa opção para eventos | Dependência do provedor |

## Quando faz sentido — e quando não

**Faz sentido:** carga irregular ou com picos; trabalho pontual disparado por
evento; tarefa que pode ser assíncrona (processar imagem, gerar relatório,
enviar notificação).

**Não faz sentido (ou exige cuidado):** volume baixo e estável (um servidor
resolve sem a complexidade extra); requisito de latência baixa e previsível
(cold start atrapalha); processos muito longos (limite de tempo); quando a
dependência de um provedor é inaceitável.

## Onde isso aparece no projeto

| Peça | Arquivo |
|---|---|
| Função (lógica pura de otimização + adaptador FaaS) | `src/functions/optimizeImage/handler.js` |
| Simulador de plataforma (cold start, warm, concorrência, timeout) | `src/shared/serverless/simulator.js` |
| Demonstração local | `scripts/optimize-image-local.js` (`npm run image:local`) |
| Testes | `scripts/image-test.js` (`npm run image:test`) |
| Decisão e trade-offs | `docs/ADR-006-processamento-de-imagens.md` |

## Por que um simulador

Não há conta de provedor configurada. Em vez de só descrever Serverless, o
simulador reproduz o que **muda a forma de programar**: latência variável e
limites de execução. Ele **não** simula isolamento por VM, distribuição
geográfica nem cobrança por milissegundo, que não têm efeito observável em
um projeto local.
