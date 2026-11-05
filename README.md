# Data BEPE

Leitura crítica, em dados, das **21.032 bolsas no exterior** concedidas pela FAPESP entre 1992 e 2026, e do que muda com as novas regras da BEPE em vigor desde 01/09/2026: iniciação científica e mestrado fora do fluxo contínuo e estágio inicial de 6 meses.

**Site:** https://aikiesan.github.io/data_BEPE/

Duas abas:

- **BEPE hoje** (`index.html`, a principal): o cenário BEPE 2026, com bolsistas no exterior, partidas marcadas, a comparação de 2026 com 2025 pela ordem dos pedidos, as regras de setembro de 2026 e a linha do tempo. É atualizada a cada nova exportação da BV.
- **Histórico** (`historico.html`): o ensaio sobre 35 anos de bolsas, de 1992 a 2026.

## O que tem na página

| Trecho | Pergunta | Figuras |
|---|---|---|
| Em jogo | O que muda com as regras de 2026? | IC e mestrado = 45% das BEPE de 2025 (804 de 1.806); 3 de cada 4 estágios de doutorado e pós-doc planejados para mais de 6 meses |
| 1 · Ritmo | Quantas bolsas por ano? | barras empilhadas por modalidade, ficha das modalidades |
| 2 · Calendário | Em que mês começam? | relógio radial por modalidade, mapa de calor mês × ano |
| 3 · Destinos | Para onde vão? | mapa por período, ranking dos 10 maiores destinos, matriz grande área × país |
| 4 · Origem | De onde saem? | treemap instituição → unidade, cidades sede |
| 5 · Temas | O que foram estudar? | fatia de cada grande área, 30 áreas, explorador de temas, temas em ascensão, termos novos |
| 6 · Anfitriãs | Quem recebe? | as 100 instituições estrangeiras mais frequentes, com busca |
| Gestão | Quem conduz a FAPESP? | Conselho Superior, Conselho Técnico-Administrativo e Assessoria Científica, com busca |
| Fontes e dados | De onde vem cada número? | referências numeradas, tabelas completas e um CSV por figura |

## Fontes

1. FAPESP, Biblioteca Virtual. Bolsas no exterior concluídas, exportação CSV, dados de 25/10/2026. https://bv.fapesp.br/
2. FAPESP, Biblioteca Virtual. Bolsas no exterior em andamento, exportação CSV, dados de 25/10/2026. https://bv.fapesp.br/
3. FAPESP. Assessoria Científica, página atualizada em 28/10/2026. https://fapesp.br/assessoria
4. FAPESP. Conselho Superior da FAPESP, página atualizada em 03/09/2026. https://fapesp.br/32/conselho-superior-da-fapesp
5. FAPESP. Conselho Técnico-Administrativo da FAPESP, consultada em 03/11/2026. https://fapesp.br/73/conselho-tecnico-administrativo-da-fapesp
6. FAPESP. Conselho Superior e Diretoria, página atualizada em 24/04/2026. https://fapesp.br/gestao
7. Natural Earth via world-atlas 2.0.2 (países 1:110m), base dos mapas. https://github.com/topojson/world-atlas
8. Agência FAPESP. Comunicado do Conselho Técnico-Administrativo da FAPESP, 02/09/2026. https://agencia.fapesp.br/comunicado-do-conselho-tecnico-administrativo-da-fapesp/59112
9. FAPESP. Bolsa Estágio de Pesquisa no Exterior (BEPE), norma vigente a partir de 01/09/2026. https://fapesp.br/bolsas/bepe

Cada figura do site cita a sua fonte e tem um link para o CSV com os números que desenha. O dicionário completo está em [`data/LEIAME.md`](data/LEIAME.md).

- **Ano** é o do número do processo, ou seja, o ano do pedido.
- **Mês** é o da data de início, porque a exportação não traz a data de concessão.
- **Reino Unido** soma Inglaterra, Escócia, País de Gales e Irlanda do Norte. Bolsas com mais de um país contam no primeiro.
- O CSV publicado em `data/` não traz nomes de pesquisadores nem resumos.

## Estrutura

```
index.html                  aba BEPE hoje (principal)
historico.html              aba Histórico 1992–2026
assets/css/style.css        tipografia, cores, layout
assets/img/bepe-01..12.jpg  fotos ilustrativas do mosaico e das faixas
assets/js/app.js            todos os gráficos (D3 v7)
data/bepe.json              agregados usados pelo histórico
data/painel_bepe_hoje.json  números da aba BEPE hoje
data/bolsas_fapesp_exterior.csv   base limpa, uma linha por bolsa
data/figuras/figNN_*.csv    os números de cada figura (fig00b: BEPE por ano e modalidade, base da seção Em jogo)
data/coletas/               coletas semanais da BV: o que apareceu e mudou, sem nomes
data/fapesp_assessoria_cientifica.csv   Assessoria Científica da FAPESP [3]
data/fapesp_gestao.csv      Conselho Superior e Conselho Técnico-Administrativo [4][5]
data/partidas_dados.zip     tudo acima num arquivo só
data/LEIAME.md              dicionário dos dados e fontes
scripts/prepare_data.py     gera a base limpa e bepe.json a partir da BV
scripts/painel_bepe_hoje.py gera o painel BEPE hoje e os CSVs hoje0N_*
scripts/export_figuras.py   gera os CSVs das figuras e o ZIP
scripts/coleta_semanal.py   registra uma coleta e refaz os dados do site
scripts/verificar_coletas.py confere as coletas e procura exportações brutas
.github/workflows/pages.yml publicação no GitHub Pages
.github/workflows/conferir_dados.yml conferência a cada push
.github/workflows/atualiza_semanal.yml coleta semanal e atualização dos dados
```

Sem build: é HTML, CSS e JS estáticos. As fotos são apenas ilustrativas; direitos dos respectivos autores. D3 e TopoJSON vêm do cdnjs; o contorno dos países (world-atlas 110m) vem do jsDelivr.

## Atualizar os dados

A Action `.github/workflows/atualiza_semanal.yml` roda toda segunda-feira e também pelo botão *Run workflow*. Ela compara a data do arquivo em `media.fapesp.br` com a dos dados do site. Quando há lote novo, baixa os CSVs para uma pasta temporária, roda `scripts/coleta_semanal.py`, confere o resultado e faz o commit de `data/`. Os CSVs brutos trazem nomes e nunca entram no repositório.

Para rodar à mão, com os dois CSVs da BV guardados fora do repositório:

```bash
python scripts/coleta_semanal.py caminho/concluidas.csv caminho/andamento.csv
```

O script lê a data no rodapé dos CSVs e compara com a coleta anterior. Ele recusa o arquivo, sem gravar nada, se a data não avançar ou se mais de 1% das bolsas sumir. Depois refaz os dados do site (`prepare_data.py`, `painel_bepe_hoje.py`, `export_figuras.py`) e grava `data/coletas/`.

Se a mudança merecer nota, acrescente uma linha em `ATUALIZACOES` em `scripts/painel_bepe_hoje.py`; se houver fato novo sobre as regras, acrescente em `EVENTOS`, com a fonte. Se as páginas da FAPESP mudarem, atualize à mão `data/fapesp_assessoria_cientifica.csv` e `data/fapesp_gestao.csv` (e as datas em `data/LEIAME.md` e na seção Fontes do `index.html`).

As coletas medem a publicação na BV, não a decisão da FAPESP: um processo novo foi publicado entre dois lotes, e a BV não informa a data de concessão. A BV nem sempre gera lote novo toda semana, então o intervalo entre coletas pode ser maior. O empenho orçamentário também não está na BV. O dicionário está em [`data/LEIAME.md`](data/LEIAME.md).

## Ver localmente

```bash
python -m http.server 8000
```

Depois abra http://localhost:8000.

## Publicação

O workflow `.github/workflows/pages.yml` publica a raiz do repositório a cada push em `main`. O Pages precisa estar ativado com a fonte **GitHub Actions** antes do primeiro deploy (em *Settings → Pages*, ou com `gh api repos/aikiesan/data_BEPE/pages -X POST -f build_type=workflow`); sem isso o passo `configure-pages` falha com "Not Found".
