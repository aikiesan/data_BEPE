"""Gera um CSV por figura a partir de data/bepe.json e empacota todos os dados.

Uso: python scripts/export_figuras.py

Escreve data/figuras/figNN_*.csv e data/partidas_dados.zip (todas as tabelas
de data/, mais data/LEIAME.md). Rode depois de prepare_data.py.
"""
import csv
import json
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / 'data'
SAIDA = DADOS / 'figuras'
MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']


def grava(nome, cabecalho, linhas):
    with open(SAIDA / nome, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(cabecalho)
        w.writerows(linhas)
    print(f'{nome}: {len(linhas)} linhas')


def r4(x):
    return round(x, 4)


def em_jogo():
    """BEPE por ano e modalidade, com a duração dos estágios: base da seção "Em jogo"."""
    import statistics
    with open(DADOS / 'bolsas_fapesp_exterior.csv', encoding='utf-8') as f:
        bepe = [r for r in csv.DictReader(f) if r['grupo'].startswith('BEPE')]
    por = {}
    for r in bepe:
        por.setdefault((r['ano_pedido'], r['grupo']), []).append(float(r['meses']) if r['meses'] else None)
    linhas = []
    for (ano, grupo), ms in sorted(por.items()):
        ms_ok = [m for m in ms if m is not None]
        tot_ano = sum(len(v) for (a, _), v in por.items() if a == ano)
        linhas.append([ano, grupo, len(ms), tot_ano, r4(len(ms) / tot_ano),
                       round(statistics.median(ms_ok), 1) if ms_ok else '',
                       sum(m > 6.5 for m in ms_ok), len(ms_ok)])
    grava('fig00b_bepe_por_ano_modalidade.csv',
          ['ano_pedido', 'modalidade', 'bolsas', 'bolsas_bepe_no_ano', 'fatia_do_ano',
           'meses_mediana', 'estagios_acima_de_6_meses', 'estagios_com_duracao'], linhas)


def main():
    d = json.loads((DADOS / 'bepe.json').read_text(encoding='utf-8'))
    SAIDA.mkdir(exist_ok=True)
    grupos = d['meta']['grupos'] if 'grupos' in d['meta'] else [m['grupo'] for m in d['modalidades']]
    periodos = list(d['tot_periodos'])
    col = lambda s: s.replace('–', '_').replace(' ', '_')

    grava('fig00_resumo.csv', ['indicador', 'valor'],
          [[k, v] for k, v in d['meta'].items() if not isinstance(v, (list, dict))])

    grava('fig01_bolsas_por_ano_modalidade.csv', ['ano_pedido', *grupos, 'total'],
          [[a['ano'], *(a[g] for g in grupos), sum(a[g] for g in grupos)] for a in d['anos']])

    grava('fig02_ficha_modalidades.csv',
          ['modalidade', 'bolsas', 'fatia', 'desde', 'duracao_mediana_meses', 'mes_pico', 'principal_destino', 'fatia_principal_destino'],
          [[m['grupo'], m['n'], r4(m['share']), m['desde'], m['mediana_meses'], m['mes_pico'], m['destino'], r4(m['destino_share'])]
           for m in d['modalidades']])

    grava('fig03_inicios_por_mes_modalidade.csv', ['mes', *d['meses']],
          [[mes, *(d['meses'][g][i] for g in d['meses'])] for i, mes in enumerate(MESES)])

    linhas = []
    for h in d['heat']:
        tot = sum(h['meses'])
        for i, n in enumerate(h['meses']):
            linhas.append([h['ano'], MESES[i], n, r4(n / tot) if tot else 0])
    grava('fig04_inicios_mes_ano.csv', ['ano_inicio', 'mes', 'bolsas', 'fatia_do_ano'], linhas)

    grava('fig05_destinos_por_periodo.csv',
          ['pais', 'iso_numerico', 'lon', 'lat', 'bolsas_total', 'fatia_total',
           *[f'bolsas_{col(p)}' for p in periodos], *[f'fatia_{col(p)}' for p in periodos], *[f'bolsas_{col(g)}' for g in grupos]],
          [[p['pais'], p['iso'], p['lon'], p['lat'], p['n'], r4(p['share']),
            *(p['periodos'].get(q, 0) for q in periodos),
            *(r4(p['periodos'].get(q, 0) / d['tot_periodos'][q]) for q in periodos),
            *(p['grupos'].get(g, 0) for g in grupos)] for p in d['paises']])

    grava('fig06_posicao_destinos_por_periodo.csv', ['pais', *[f'posicao_{col(p)}' for p in periodos]],
          [[p['pais'], *(p['rank'].get(q, '') for q in periodos)] for p in d['paises'][:15]])

    paises_matriz = [k for k in d['matriz'][0] if k not in ('grande_area', 'n')]
    grava('fig07_grande_area_por_destino.csv', ['grande_area', 'bolsas', *[f'fatia_{col(p)}' for p in paises_matriz]],
          [[m['grande_area'], m['n'], *(r4(m[p]) for p in paises_matriz)] for m in d['matriz']])

    linhas = []
    for inst in d['arvore']['children']:
        for u in inst.get('children', []):
            linhas.append([inst['name'], inst['value'], u['name'], u['value']])
    grava('fig08_instituicoes_unidades_sede.csv', ['instituicao', 'bolsas_instituicao', 'unidade', 'bolsas_unidade'], linhas)

    grava('fig09_cidades_sede.csv', ['cidade', 'bolsas'], [[c['cidade'], c['n']] for c in d['cidades']])

    areas_ga = [k for k in d['ga_ano'][0] if k != 'ano']
    grava('fig10_grande_area_por_ano.csv', ['ano_pedido', *areas_ga],
          [[a['ano'], *(a[g] for g in areas_ga)] for a in d['ga_ano']])

    grava('fig11_areas_mais_frequentes.csv', ['posicao', 'area', 'grande_area', 'bolsas'],
          [[i + 1, a['area'], a['grande_area'], a['n']] for i, a in enumerate(d['areas'])])

    anos, totais = d['temas']['anos'], d['temas']['totais_ano']
    linhas = []
    for t in d['temas']['lista']:
        for ano, tot, n in zip(anos, totais, t['serie']):
            if n:
                linhas.append([t['tema'], t['n'], ano, n, tot, r4(n / tot) if tot else 0])
    grava('fig12_temas_por_ano.csv', ['tema', 'bolsas_tema_total', 'ano_pedido', 'bolsas_no_ano', 'bolsas_do_ano', 'fatia_do_ano'], linhas)

    cab = ['tema', 'bolsas_2012_2017', 'bolsas_2021_2026', 'fatia_2012_2017', 'fatia_2021_2026', 'crescimento_relativo']
    lin = lambda a: [a['tema'], a['antes'], a['depois'], r4(a['share_antes']), r4(a['share_depois']), r4(a['razao'])]
    grava('fig13_temas_em_ascensao.csv', cab, [lin(a) for a in d['ascensao'] if a['antes'] >= 5])
    grava('fig14_temas_novos.csv', cab, [lin(a) for a in d['ascensao'] if a['antes'] == 0])

    grava('fig15_temas_por_grande_area.csv', ['grande_area', 'posicao', 'tema'],
          [[ga, i + 1, t] for ga, lista in d['temas_area'].items() for i, t in enumerate(lista)])

    grava('fig16_instituicoes_anfitrias.csv', ['posicao', 'instituicao', 'pais', 'grande_area_mais_comum', 'primeiro_ano', 'ultimo_ano', 'bolsas'],
          [[i + 1, h['nome'], h['pais'], h['area'], h['primeiro'], h['ultimo'], h['n']] for i, h in enumerate(d['anfitrias'])])

    em_jogo()

    with zipfile.ZipFile(DADOS / 'partidas_dados.zip', 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(DADOS.rglob('*')):
            if f.is_file() and f.suffix in ('.csv', '.md', '.json'):
                z.write(f, f.relative_to(DADOS))
    print('partidas_dados.zip:', round((DADOS / 'partidas_dados.zip').stat().st_size / 1e6, 1), 'MB')


if __name__ == '__main__':
    main()
