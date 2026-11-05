# Dados do ensaio "Partidas"

Todos os arquivos são CSV em UTF-8, separados por vírgula, com ponto como separador decimal. Fatias são proporções entre 0 e 1.

## Fontes

| # | Fonte | Endereço | Data |
|---|---|---|---|
| [1] | FAPESP, Biblioteca Virtual. Bolsas no exterior concluídas (exportação CSV) | https://bv.fapesp.br/ | dados de 25/10/2026 |
| [2] | FAPESP, Biblioteca Virtual. Bolsas no exterior em andamento (exportação CSV) | https://bv.fapesp.br/ | dados de 25/10/2026 |
| [3] | FAPESP. Assessoria Científica | https://fapesp.br/assessoria | página atualizada em 28/10/2026 |
| [4] | FAPESP. Conselho Superior da FAPESP | https://fapesp.br/32/conselho-superior-da-fapesp | página atualizada em 03/09/2026 |
| [5] | FAPESP. Conselho Técnico-Administrativo da FAPESP | https://fapesp.br/73/conselho-tecnico-administrativo-da-fapesp | consultada em 03/11/2026 |
| [6] | FAPESP. Conselho Superior e Diretoria | https://fapesp.br/gestao | página atualizada em 24/04/2026 |
| [7] | Natural Earth via world-atlas 2.0.2, países 1:110m (base dos mapas) | https://github.com/topojson/world-atlas | — |

## Tabelas

| Arquivo | Conteúdo | Fonte |
|---|---|---|
| `bolsas_fapesp_exterior.csv` | Uma linha por bolsa: processo, situação, ano do pedido, início, término, duração em meses (dias entre início e término ÷ 30,44, uma casa decimal; "mais de 6 meses" no site = acima de 6,1), modalidade, grande área, área, instituição, unidade e cidade sede, país e instituição de destino, assuntos (separados por `:`). Sem nomes e sem resumos. | [1] [2] |
| `bepe.json` | Agregados que alimentam todos os gráficos da página. | [1] [2] |
| `figuras/fig00_resumo.csv` | Números do topo da página. | [1] [2] |
| `figuras/fig01_bolsas_por_ano_modalidade.csv` | Fig. 1. Bolsas por ano do pedido e modalidade. | [1] [2] |
| `figuras/fig02_ficha_modalidades.csv` | Fig. 2. Total, fatia, primeiro ano, duração mediana, mês de pico e principal destino de cada modalidade. | [1] [2] |
| `figuras/fig03_inicios_por_mes_modalidade.csv` | Fig. 3. Bolsas iniciadas em cada mês, 2012–2025, por modalidade. | [1] [2] |
| `figuras/fig04_inicios_mes_ano.csv` | Fig. 4. Bolsas iniciadas por mês e ano e a fatia de cada mês no ano. | [1] [2] |
| `figuras/fig05_destinos_por_periodo.csv` | Fig. 5 e mapa do topo. Bolsas e fatia por país de destino, total, por período e por modalidade, com código ISO e coordenadas. | [1] [2] [7] |
| `figuras/fig06_posicao_destinos_por_periodo.csv` | Fig. 6. Posição dos 15 maiores destinos em cada período. | [1] [2] |
| `figuras/fig07_grande_area_por_destino.csv` | Fig. 7. Fatia das bolsas de cada grande área por país de destino. | [1] [2] |
| `figuras/fig08_instituicoes_unidades_sede.csv` | Fig. 8. Bolsas por instituição sede e pelas suas 10 maiores unidades. | [1] [2] |
| `figuras/fig09_cidades_sede.csv` | Fig. 9. Bolsas por cidade sede. | [1] [2] |
| `figuras/fig10_grande_area_por_ano.csv` | Fig. 10. Bolsas por grande área e ano do pedido. | [1] [2] |
| `figuras/fig11_areas_mais_frequentes.csv` | Fig. 11. As 30 áreas do conhecimento com mais bolsas. | [1] [2] |
| `figuras/fig12_temas_por_ano.csv` | Fig. 12. Os 400 temas mais citados, ano a ano, com a fatia das bolsas do ano. | [1] [2] |
| `figuras/fig13_temas_em_ascensao.csv` | Fig. 13. Temas com ao menos 5 bolsas em 2012–2017 e 25 em 2021–2026, e o crescimento da sua fatia. | [1] [2] |
| `figuras/fig14_temas_novos.csv` | Fig. 14. Temas com 25 ou mais bolsas em 2021–2026 e nenhuma em 2012–2017. | [1] [2] |
| `figuras/fig15_temas_por_grande_area.csv` | Fig. 15. Os 8 temas mais citados em cada grande área. | [1] [2] |
| `figuras/fig16_instituicoes_anfitrias.csv` | Fig. 16. As 100 instituições estrangeiras que mais receberam bolsistas. | [1] [2] |
| `fapesp_assessoria_cientifica.csv` | Coordenadores, gestores, assessores e comitês científicos da FAPESP: coordenadoria, área, grupo, papel, nome e link do perfil. | [3] |
| `fapesp_gestao.csv` | Integrantes do Conselho Superior e do Conselho Técnico-Administrativo. | [4] [5] [6] |

## Coletas semanais (`coletas/`)

Só BEPE. A exportação da BV não informa a data de concessão: uma bolsa nova foi publicada entre dois lotes da BV, sem que se saiba quando a FAPESP decidiu. Pedidos negados ou sem decisão não aparecem em nenhuma coleta. A primeira coleta é a base, e suas bolsas não contam como novas.

| Arquivo | Conteúdo | Fonte |
|---|---|---|
| `coletas/coletas.csv` | Uma linha por coleta: dia da coleta (`coleta`), data do rodapé dos CSVs da BV (`dados_bv`), total de BEPE, bolsas novas no total e por modalidade (IC, mestrado, doutorado, pós-doutorado), novas que já tinham começado na data dos dados, novas de doutorado e pós-doutorado até 6 meses e acima de 6 meses (acima de 6,1), bolsas com início ou término alterado, sumidas, de volta, e partidas marcadas (início depois da data dos dados). | [1] [2] |
| `coletas/registro.csv` | Uma linha por BEPE: processo, modalidade, início, término, meses, primeira coleta em que apareceu e, se saiu da BV, a coleta em que sumiu (`ausente_desde`). | [1] [2] |
| `coletas/mudancas.csv` | Cada mudança em uma bolsa já vista: coleta, processo, campo (`inicio`, `termino`, `sumiu`, `voltou`), valor anterior e novo. Um término adiado pode indicar prorrogação, mas a BV não informa o motivo. | [1] [2] |
| `coletas/marcadas.csv` | Partidas marcadas em cada coleta, por mês de início e modalidade. Permite ver como cada mês cresce de uma coleta para outra. | [1] [2] |

## Regras de tratamento

- **Ano do pedido**: os dois primeiros dígitos do número do processo.
- **Mês**: o da data de início. A exportação não traz a data de concessão.
- **Modalidade**: Doutorado inclui Doutorado Direto; "Outras" reúne Novas Fronteiras, Capacitação e Doutorado pleno.
- **Destino**: Inglaterra, Escócia, País de Gales e Irlanda do Norte somados como Reino Unido; Holanda como Países Baixos. Bolsas com mais de um país contam no primeiro.
- **Temas**: palavras-chave do campo Assuntos, contadas uma vez por bolsa; sinônimos não foram unidos.
- **Pessoas**: as listas da FAPESP [3]–[5] foram transcritas das páginas oficiais nas datas indicadas e podem mudar. Uma pessoa pode aparecer em mais de um papel.

Visualização independente, sem vínculo oficial com a FAPESP.
