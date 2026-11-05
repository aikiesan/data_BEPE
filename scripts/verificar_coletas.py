"""Confere data/coletas e garante que nenhum CSV bruto da BV, com nomes, entrou no repositório.

Roda nas Actions e pode rodar à mão: python scripts/verificar_coletas.py
"""
import csv
import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
PASTA = RAIZ / 'data' / 'coletas'
# cabeçalhos da exportação da BV que nunca podem aparecer em um CSV do repositório
PROIBIDOS = ('N. Processo', 'Beneficiário', 'Pesquisador Responsável', 'Pesquisadores Principais', 'Pesquisadores Associados',
             'Supervisor', 'Resumo (Português)', 'Pesquisador responsável no exterior')
GRUPOS = {'BEPE Iniciação Científica', 'BEPE Mestrado', 'BEPE Doutorado', 'BEPE Pós-doutorado'}
CABECALHOS = {
    'coletas.csv': 'coleta,dados_bv,bepe_total,novas,novas_ic,novas_me,novas_do,novas_pd,novas_ja_iniciadas,novas_do_pd_ate_6,novas_do_pd_acima_6,mudou_inicio,mudou_termino,sumiram,voltaram,marcadas',
    'registro.csv': 'processo,grupo,inicio,termino,meses,primeira_coleta,ausente_desde',
    'mudancas.csv': 'coleta,processo,campo,antes,depois',
    'marcadas.csv': 'coleta,mes_inicio,grupo,bolsas',
}
DATA = re.compile(r'^\d{4}-\d{2}-\d{2}$')
PROCESSO = re.compile(r'^\d{2}/\d{5}-\d$')
erros = []


def le(nome):
    with open(PASTA / nome, encoding='utf-8', newline='') as f:
        return list(csv.DictReader(f))


def data_ok(valor, vazio=False):
    return (vazio and valor == '') or bool(DATA.match(valor))


def sem_brutos():
    arquivos = subprocess.run(['git', 'ls-files', '*.csv'], cwd=RAIZ, capture_output=True, text=True, encoding='utf-8', check=True).stdout.split('\n')
    for nome in filter(None, arquivos):
        with open(RAIZ / nome, encoding='utf-8-sig', errors='replace') as f:
            cabecalho = f.readline()
        achados = [p for p in PROIBIDOS if p in cabecalho]
        if achados:
            erros.append(f'{nome}: cabeçalho de exportação bruta da BV ({", ".join(achados)})')


def coletas():
    extras = {p.name for p in PASTA.iterdir()} - set(CABECALHOS)
    if extras:
        erros.append(f'data/coletas tem arquivos não previstos: {sorted(extras)}')
    for nome, cab in CABECALHOS.items():
        with open(PASTA / nome, encoding='utf-8') as f:
            if f.readline().strip() != cab:
                erros.append(f'{nome}: colunas diferentes do previsto')
    if erros:
        return
    linhas = le('coletas.csv')
    datas = [r['coleta'] for r in linhas]
    if not datas or datas != sorted(set(datas)) or not all(map(data_ok, datas)):
        erros.append('coletas.csv: datas vazias, fora de ordem ou repetidas')
    conhecidas = set(datas)
    registro = le('registro.csv')
    if len({r['processo'] for r in registro}) != len(registro):
        erros.append('registro.csv: processo repetido')
    for r in registro:
        if not (PROCESSO.match(r['processo']) and r['grupo'] in GRUPOS and data_ok(r['inicio']) and data_ok(r['termino'], True)
                and r['primeira_coleta'] in conhecidas and data_ok(r['ausente_desde'], True)):
            erros.append(f'registro.csv: linha inválida no processo {r["processo"]!r}')
            break
    for m in le('mudancas.csv'):
        if not (m['coleta'] in conhecidas and PROCESSO.match(m['processo']) and m['campo'] in ('inicio', 'termino', 'sumiu', 'voltou')
                and data_ok(m['antes'], True) and data_ok(m['depois'], True)):
            erros.append(f'mudancas.csv: linha inválida no processo {m["processo"]!r}')
            break
    for m in le('marcadas.csv'):
        if not (m['coleta'] in conhecidas and m['grupo'] in GRUPOS and m['bolsas'].isdigit()):
            erros.append('marcadas.csv: linha inválida')
            break
    ativos = sum(not r['ausente_desde'] for r in registro)
    if linhas and ativos != int(linhas[-1]['bepe_total']):
        erros.append(f'registro.csv tem {ativos} bolsas ativas e coletas.csv informa {linhas[-1]["bepe_total"]}')


sem_brutos()
coletas()
if erros:
    print('\n'.join(erros))
    sys.exit(1)
print('Coletas conferidas: sem nomes e sem exportações brutas no repositório.')
