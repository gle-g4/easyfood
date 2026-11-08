$ErrorActionPreference = "Stop"
$raiz = "http://localhost:3000"
$base = "$raiz/api/v1"

$sufixo = Get-Date -Format "HHmmss"
$email  = "demo.$sufixo@easyfood.dev"
$senha  = "SenhaForte1"

function Titulo($texto) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor DarkCyan
    Write-Host " $texto" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor DarkCyan
}

function Passo($texto) {
    Write-Host ""
    Write-Host "> $texto" -ForegroundColor Yellow
}

function Pausa {
    Write-Host ""
    Write-Host "   (pressione Enter para continuar...)" -ForegroundColor DarkGray
    Read-Host | Out-Null
}

function Chamar {
    param(
        [Parameter(Mandatory)] [string] $Metodo,
        [Parameter(Mandatory)] [string] $Caminho,
        [string] $Body,
        [string] $Token,
        [string] $UrlBase = $base
    )

    $headers = @{}
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }

    $params = @{
        Uri             = "$UrlBase$Caminho"
        Method          = $Metodo
        Headers         = $headers
        UseBasicParsing = $true
    }
    if ($Body) {
        $params["ContentType"] = "application/json"
        $params["Body"]        = $Body
    }

    $status   = $null
    $conteudo = $null

    try {
        $resp     = Invoke-WebRequest @params
        $status   = [int]$resp.StatusCode
        $conteudo = $resp.Content
    }
    catch [System.Net.WebException] {
        $webResp = $_.Exception.Response
        if (-not $webResp) {
            Write-Host "Falha de conexao. O servidor esta rodando? (node server.js)" -ForegroundColor Red
            exit 1
        }
        $status   = [int]$webResp.StatusCode
        $reader   = New-Object System.IO.StreamReader($webResp.GetResponseStream())
        $conteudo = $reader.ReadToEnd()
    }
    catch {
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $conteudo = $_.ErrorDetails.Message }
        if (-not $status) {
            Write-Host "Falha de conexao. O servidor esta rodando? (node server.js)" -ForegroundColor Red
            Write-Host $_.Exception.Message -ForegroundColor Red
            exit 1
        }
    }

    $cor = "Green"
    if ($status -ge 300) { $cor = "Yellow" }
    if ($status -ge 500) { $cor = "Red" }

    Write-Host "   $Metodo $UrlBase$Caminho" -NoNewline
    Write-Host "  ->  $status" -ForegroundColor $cor

    $json = $null
    if ($conteudo) {
        try {
            $json = $conteudo | ConvertFrom-Json
            $json | ConvertTo-Json -Depth 6 | Write-Host
        } catch {
            Write-Host $conteudo
        }
    }
    return $json
}

function ComoJson($objeto) { return ($objeto | ConvertTo-Json) }

Clear-Host
Titulo "EasyFood API - Demonstracao"
Write-Host "Servidor esperado em $raiz"
Write-Host "E-mail de teste desta execucao: $email"
Pausa

Titulo "1. Health checks"
Passo "Liveness: o processo esta de pe?"
Chamar -Metodo GET -Caminho "/health/live" -UrlBase $raiz | Out-Null
Passo "Readiness: o banco esta acessivel?"
Chamar -Metodo GET -Caminho "/health/ready" -UrlBase $raiz | Out-Null
Pausa

Titulo "2. Validacao de entrada (Zod)"
Passo "Cadastro com senha fraca e e-mail invalido: deve dar 400"
Chamar -Metodo POST -Caminho "/auth/register" -Body (ComoJson @{ name = "Teste"; email = "nao-e-email"; password = "123" }) | Out-Null
Pausa

Titulo "3. Cadastro de usuario"
Passo "Cadastrando usuario valido: deve dar 201"
Chamar -Metodo POST -Caminho "/auth/register" -Body (ComoJson @{ name = "Professor Avaliador"; email = $email; password = $senha }) | Out-Null
Pausa

Passo "Mesmo e-mail de novo: deve dar 409 (conflito)"
Chamar -Metodo POST -Caminho "/auth/register" -Body (ComoJson @{ name = "Duplicado"; email = $email; password = $senha }) | Out-Null
Pausa

Titulo "4. Login"
Passo "Senha errada: deve dar 401"
Chamar -Metodo POST -Caminho "/auth/login" -Body (ComoJson @{ email = $email; password = "SenhaErrada1" }) | Out-Null
Pausa

Passo "Senha correta: deve devolver um token JWT"
$login = Chamar -Metodo POST -Caminho "/auth/login" -Body (ComoJson @{ email = $email; password = $senha })
$token = $login.tokens.accessToken
Pausa

Titulo "5. Rota protegida"
Passo "/auth/me SEM token: deve dar 401"
Chamar -Metodo GET -Caminho "/auth/me" | Out-Null
Pausa

Passo "/auth/me COM token: deve devolver o perfil"
Chamar -Metodo GET -Caminho "/auth/me" -Token $token | Out-Null
Pausa

Titulo "6. Restaurantes e e-mail (acao secundaria)"
$nomeRestaurante = "Cantina Demo $sufixo"
$corpoRestaurante = ComoJson @{ name = $nomeRestaurante; category = "Italiana"; rating = 4.5 }

Passo "Criar restaurante SEM login: deve dar 401"
Chamar -Metodo POST -Caminho "/restaurants" -Body $corpoRestaurante | Out-Null
Pausa

Passo "Criar restaurante COM login: deve dar 201"
Write-Host "   OLHE O TERMINAL DO SERVIDOR: devem aparecer 2 linhas [EMAIL] Enviado..." -ForegroundColor Magenta
$restaurante = Chamar -Metodo POST -Caminho "/restaurants" -Body $corpoRestaurante -Token $token
Pausa

Passo "Mesmo nome de novo: deve dar 409 (regra de negocio no Service)"
Chamar -Metodo POST -Caminho "/restaurants" -Body $corpoRestaurante -Token $token | Out-Null
Pausa

Passo "Categoria invalida: deve dar 400 (validacao Zod)"
Chamar -Metodo POST -Caminho "/restaurants" -Body (ComoJson @{ name = "Outro $sufixo"; category = "Inexistente"; rating = 4 }) -Token $token | Out-Null
Pausa

Titulo "7. Listagem publica, paginacao e filtros"
Passo "GET publico, sem token"
Chamar -Metodo GET -Caminho "/restaurants?limite=5" | Out-Null
Pausa

Passo "Filtrando por categoria"
Chamar -Metodo GET -Caminho "/restaurants?categoria=Italiana" | Out-Null
Pausa

Titulo "8. Autorizacao por papel (RBAC)"
Passo "Excluir restaurante sendo usuario comum: deve dar 403"
if ($restaurante.id) {
    Chamar -Metodo DELETE -Caminho "/restaurants/$($restaurante.id)" -Token $token | Out-Null
}
Write-Host ""
Write-Host "   (usuario comum nao tem grupo admin nem owner no token)" -ForegroundColor DarkGray
Pausa

Titulo "9. Rate limiting"
Passo "Varias tentativas de login erradas seguidas..."
$corpoErrado = ComoJson @{ email = $email; password = "SenhaErrada1" }
for ($i = 1; $i -le 7; $i++) {
    Write-Host "   tentativa $i" -NoNewline
    try {
        $r = Invoke-WebRequest -Uri "$base/auth/login" -Method POST -ContentType "application/json" -Body $corpoErrado -UseBasicParsing
        Write-Host "  -> $([int]$r.StatusCode)"
    } catch {
        $codigo = "?"
        if ($_.Exception.Response) { $codigo = [int]$_.Exception.Response.StatusCode }
        Write-Host "  -> $codigo"
    }
}
Write-Host ""
Write-Host "   As ultimas tentativas devem mostrar 429 (Too Many Requests)" -ForegroundColor DarkGray
Pausa

Titulo "Fim da demonstracao"
Write-Host "Fluxos exercitados:" -ForegroundColor Green
Write-Host "  - validacao de entrada, cadastro, login, JWT"
Write-Host "  - rota protegida (authenticate)"
Write-Host "  - regra de negocio no Service (nome duplicado)"
Write-Host "  - e-mail como acao secundaria (veja o log do servidor)"
Write-Host "  - paginacao e filtros"
Write-Host "  - autorizacao por papel (authorize)"
Write-Host "  - rate limiting"
Write-Host ""
