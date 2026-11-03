# Partidas

Ensaio visual sobre as **21.032 bolsas no exterior** concedidas pela FAPESP entre 1992 e 2026: quantas foram, em que época do ano começam, para onde foram, de onde saíram e o que foram estudar.

**Site:** https://aikiesan.github.io/data_BEPE/

## O que tem na página

| Trecho | Pergunta | Figuras |
|---|---|---|
| 1 · Ritmo | Quantas bolsas por ano? | barras empilhadas por modalidade, ficha das modalidades |
| 2 · Calendário | Em que mês começam? | relógio radial por modalidade, mapa de calor mês × ano |
| 3 · Destinos | Para onde vão? | mapa por período, ranking dos 10 maiores destinos, matriz grande área × país |
| 4 · Origem | De onde saem? | treemap instituição → unidade, cidades sede |
| 5 · Temas | O que foram estudar? | fatia de cada grande área, 30 áreas, explorador de temas, temas em ascensão, termos novos |
| 6 · Anfitriãs | Quem recebe? | as 100 instituições estrangeiras mais frequentes, com busca |

## Fonte

Exportações CSV da [Biblioteca Virtual da FAPESP](https://bv.fapesp.br/) — bolsas no exterior concluídas e em andamento (Pesquisa no Exterior e as modalidades BEPE), atualizadas em 25/10/2026.

- **Ano** é o do número do processo, ou seja, o ano do pedido.
- **Mês** é o da data de início, porque a exportação não traz a data de concessão.
- **Reino Unido** soma Inglaterra, Escócia, País de Gales e Irlanda do Norte. Bolsas com mais de um país contam no primeiro.
- O CSV publicado em `data/` não traz nomes de pesquisadores nem resumos.

## Estrutura

```
index.html                  página única
assets/css/style.css        tipografia, cores (claro/escuro), layout
assets/js/app.js            todos os gráficos (D3 v7)
data/bepe.json              agregados usados pela página
data/bolsas_fapesp_exterior.csv   base limpa, uma linha por bolsa
scripts/prepare_data.py     gera os dois arquivos acima a partir da BV
.github/workflows/pages.yml publicação no GitHub Pages
```

Sem build: é HTML, CSS e JS estáticos. D3 e TopoJSON vêm do cdnjs; o contorno dos países (world-atlas 110m) vem do jsDelivr.

## Atualizar os dados

1. Exporte da BV FAPESP os CSVs de bolsas no exterior **concluídas** e **em andamento**.
2. Rode:

   ```bash
   python scripts/prepare_data.py caminho/concluidas.csv caminho/andamento.csv
   ```

   O script lê as colunas por posição (a exportação da BV traz 33 campos para 30 cabeçalhos), descarta o rodapé, confere processos duplicados e avisa se surgir um país sem coordenadas no dicionário `PAISES`.
3. Faça commit de `data/` e dê push em `main`.

## Ver localmente

```bash
python -m http.server 8000
```

Depois abra http://localhost:8000.

## Publicação

O workflow `.github/workflows/pages.yml` publica a raiz do repositório a cada push em `main`. Em *Settings → Pages*, a fonte deve estar como **GitHub Actions**.
