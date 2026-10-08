# Portabilidade — PULSO

**Fase 18 (pendente → concluída no Linux/pendrive; Windows validado sob
Wine, pendente de máquina Windows real — P-036).** O PULSO deixa de depender da máquina
onde nasceu: o código viaja, os dados permanecem do usuário e cada
ambiente recebe seu próprio pacote.

## 1. Princípio

Há uma separação rígida entre **APLICAÇÃO** e **DADOS DO USUÁRIO**.

```text
APLICAÇÃO (código, assets, runtime)
    ≠
DADOS DO USUÁRIO (banco SQLite — pulso.db)
```

O banco nunca está dentro de `src/`, `assets/` ou em nenhum arquivo de
código-fonte ou asset estático. Ele vive em um diretório resolvido por
abstração (nunca caminho absoluto da máquina de desenvolvimento).

## 2. Estrutura do modo portátil (PULSO-PORTATIL/)

```text
PULSO-PORTATIL/
├── iniciar/                     # scripts de inicialização por SO
│   ├── iniciar-linux.sh         # Linux
│   └── iniciar-windows.bat      # Windows
├── Linux/                       # Aplicação Linux (self-contained)
│   ├── PULSO                    # executável (Electron + assets)
│   ├── resources/app/           # src/, renderer/, config/, assets/
│   └── …
├── Windows/                     # Aplicação Windows (built only on Windows)
│   ├── PULSO.exe
│   └── …
├── data/                        # DADOS DO USUÁRIO (portátil)
│   └── pulso.db                 # banco ÚNICO, compartilhado pelos dois
├── config/                      # configurações portáteis (manuais)
├── backups/                     # cópias de segurança do banco
├── runtime/                     # caches do Electron (descartáveis)
├── pulso-portatil.json          # marcador da raiz do pacote
└── README.txt
```

> A estrutura `Linux/` + `Windows/` é uma adaptação da arquitetura do projeto
> (executável por SO em subpastas). O essencial é:
>
> - `data/pulso.db` fica **junto ao executável** (no caderno do pacote);
> - `iniciar/` sobe até a raiz e executa o executável local.

## 3. Localização dos dados (regra central)

O diretório de dados é resolvido por `src/main/portabilidade.js`, que não
importa o Electron (fica totalmente testável). A ordem de precedência é:

| Ordem | Regras | Diretório de dados final |
|---|---|---|
| 1 | `PULSO_DIRETORIO_DADOS` definido | o caminho explícito (pode ser qualquer lugar) |
| 2 | Modo portátil (`PULSO_PORTABLE=1` **ou** o marcador `pulso-portatil.json` encontrado acima do executável) | `<raiz-do-pacote>/data` |
| 3 | Padrão (instalação no sistema) | `<appData>/pulso` (ex.: `~/.config/pulso` no Linux) |

### DEV vs PROD vs PORTÁVEL

| Cenário | `userData` (Electron) | Banco (`pulso.db`) |
|---|---|---|
| Desenvolvimento | `~/.config/pulso` | `~/.config/pulso/pulso.db` |
| Instalação normal (produção) | `<appData>/pulso` | `<appData>/pulso/pulso.db` |
| Modo portátil | `<pacote>/runtime` (caches dentro do pacote) | `<pacote>/data/pulso.db` |
| Fumaça (teste) | diretório temporário | diretório temporário (`PULSO_PORTABLE=1` força o modo portátil) |

> No modo portátil **nada** é gravado no perfil do sistema operacional:
> o banco vive em `<pacote>/data/` e os caches do Electron em
> `<pacote>/runtime/`. Verificado na validação: o mtime de
> `~/.config/pulso` permaneceu idêntico antes e depois de executar o
> pacote; em `data/` só existem `pulso.db` (+ `-wal`/`-shm`).
> O teste de fumaça **isola** o banco em diretório temporário por padrão
> (para nunca tocar no banco real) — a exceção é `PULSO_PORTABLE=1`, que
> reproduz deliberadamente o modo portátil sobre o pacote.

## 4. Como gerar os pacotes

### 4.1 Linux (portátil)

```bash
git checkout tarefa/fase-18-portabilidade
npm install
npm run build:linux        # → dist/PULSO-0.1.0-linux-portatil.tar.gz
tar -xzf dist/PULSO-0.1.0-linux-portatil.tar.gz -C /caminho
cd /caminho/PULSO-LINUX && ./iniciar/iniciar-linux.sh
```

### 4.2 Windows (portátil)

```bat
npm install
npm run build:windows      # → dist/PULSO-0.1.0-windows-portatil.zip
```

> O build roda em qualquer SO. Em Linux o script extrai automaticamente
> `electron-v<versao>-win32-x64.zip` do cache do Electron
> (`~/.cache/electron/<hash>/`) para `node_modules/electron/dist/win32-x64/`;
> sem o zip no cache ele emite `[build:AVISO]` e gera o pacote sem a pasta
> `Windows/`. Em Windows usa-se o binário nativo de
> `node_modules/electron/dist/`. A **execução** do pacote foi validada sob
> Wine 10 no Ubuntu — executável, launcher `.bat`, resolução portátil e
> SQLite passaram (ver §9); em máquina Windows real, pendente (P-036).

### 4.3 Pacote portátil completo (fonte com ambas as pastas)

```bash
npm run build:portable     # → out/pack/PULSO-0.1.0-portatil/
```

Os artefatos ficam em `dist/` (ignorados pelo Git).

## 5. Como executar

### Linux (a partir do pacote)
```bash
cd PULSO-PORTATIL
./iniciar/iniciar-linux.sh
# ou
./Linux/PULSO
```

### Windows (a partir do pacote)
```bat
PULSO-PORTATIL\iniciar\iniciar-windows.bat
# ou
PULSO-PORTATIL\Windows\PULSO.exe
```

## 6. Backup e recuperação do banco

Não há sistema completo de backup nesta fase. O objetivo é garantir que o
banco portátil possa ser **copiado normalmente** e restaurado.

```text
PULSO-PORTATIL/
└── data/
    └── pulso.db          ← o banco original
```

### Cópia (recomendada)
```bash
cp -r PULSO-PORTATIL/data/pulso.db backups/          # salvar em backups/
cp -r PULSO-PORTATIL/data backups/pulso-$(date +%F).db   # nome com data
```

### Recuperação
```bash
cp backups/pulso-xxxx.db PULSO-PORTATIL/data/pulso.db
```

> Antes de atualizar, feche o PULSO e faça uma cópia de `data/`. O banco é
> um único arquivo SQLite + (se houver) os arquivos `*-wal` e `*-shm` na mesma
> pasta. Não apague `data/` nem `backups/` durante uma atualização.

## 7. Atualização

- Atualize **apenas** as pastas `Linux/` e `Windows/` (o código).
- **Nunca** substitua `data/`.
- A aplicação aplica as migrações automaticamente ao abrir um banco existente
  (não apaga, não recria o banco do usuário).

Teste de migração:
```text
Banco existente (ex.: data/pulso.db com schema v15)
  ↓ nova versão do PULSO
  ↓ abrir a aplicação
  → migrações aplicadas apenas se houver (0 quando já no schema atual)
  → dados preservados
```

## 8. Variáveis de ambiente (também usadas em produção/teste manuais)

| Variável | Efeito |
|---|---|
| `PULSO_DIRETORIO_DADOS` | Força um diretório de dados explícito (útil em testes manuais e CI). |
| `PULSO_PORTABLE` | Força o modo portátil (`1`). Sem marcador, a raiz é o diretório de trabalho atual (`<cwd>/data`). Usado em testes de fumaça e CI. |

Nenhuma delas é um segredo; elas são apenas de configuração. O repositório
nunca as codifica em caminhos absolutos.

## 9. Validação por plataforma

| Plataforma | Build | Execução | Dados | Migração | Veredito |
|---|---|---|---|---|---|
| Linux | VALIDADO | VALIDADO | VALIDADO (criado, reaberto, movendo) | VALIDADO | 🟢 VALIDADO |
| Windows | VALIDADO (no Ubuntu, via cache win32) | VALIDADO (sob Wine 10: fumaça `ok:true` + app real + launcher `.bat`) | VALIDADO (`data/pulso.db` e `runtime/` no pacote; motivo `marcador`) | VALIDADO (banco criado no Linux aberto pelo `.exe`: `schema v15, 0 migrações`) | 🟡 VALIDADO SOB WINE (falta Windows real — P-036) |
| Pendrive (portátil) | VALIDADO (Linux) | VALIDADO (Linux) | VALIDADO | VALIDADO | 🟢 VALIDADO (Linux) |

> Os vereditos refletem o ambiente atual (Ubuntu, Electron 37.10.3,
> Node 22, Wine 10.0). O Windows foi validado **sob Wine no Ubuntu** —
> executável PE32+, launcher `.bat`, detecção por marcador, gravação de
> `data/` + `runtime/` dentro do pacote e banco compartilhado com o Linux
> passaram; resta executar em uma **máquina Windows real** (P-036).

## 10. Segurança e limitações

- Nenhum banco de desenvolvimento, `.env`, credencial, segredo ou log pessoal
  está empacotado.
- `userData` do Electron e o banco do aplicativo são caminhos distintos;
  no modo portátil **ambos** ficam dentro do pacote (`runtime/` e `data/`)
  e o perfil do usuário não é tocado.
- **Limitações:**
  - O SQLite não é projetado para dois processos escritos ao mesmo tempo.
    Não abra o Linux e o Windows simultaneamente com o mesmo `data/`.
  - Remova o pendrive **somente** depois de fechar o PULSO.
  - O pacote Windows pode ser gerado no Ubuntu (runtime win32 extraído do
    cache do Electron) ou nativamente no Windows; a **execução** em máquina
    Windows real ainda não foi testada (P-036).
  - O AppImage (se utilizada a camada de distribuição) exige ferramentas
    externas (`appimagetool`/`linuxdeployqt`) não presentes neste ambiente;
    o presente `build:linux` produz o pacote portátil tar.gz.
