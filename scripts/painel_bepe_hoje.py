"""Gera o painel "BEPE hoje" a partir da base pública (sem nomes).

Uso: python scripts/painel_bepe_hoje.py
Rode depois de prepare_data.py, a cada nova exportação da BV.

Lê   data/bolsas_fapesp_exterior.csv e data/bepe.json (data dos dados)
Gera data/painel_bepe_hoje.json e data/figuras/hoje0N_*.csv

Para registrar uma atualização do painel, acrescente uma linha em ATUALIZACOES.
Para um novo fato sobre as regras, acrescente em EVENTOS (com a fonte).
"""
import csv
import json
from collections import Counter
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / 'data'
FIG = DADOS / 'figuras'
CORTE = 16000          # número de processo onde as curvas de 2026 e 2025 se separam (não corresponde a uma data exata)
BIN = 500
MODS = ['BEPE Iniciação Científica', 'BEPE Mestrado', 'BEPE Doutorado', 'BEPE Pós-doutorado']
CURTO = {'BEPE Iniciação Científica': 'Iniciação científica', 'BEPE Mestrado': 'Mestrado',
         'BEPE Doutorado': 'Doutorado', 'BEPE Pós-doutorado': 'Pós-doutorado'}

EVENTOS = [
    {'data': '2026-08-26', 'titulo': 'FAPESP anuncia novas regras da BEPE',
     'texto': 'Comunicado do Conselho Técnico-Administrativo. Iniciação científica e mestrado saem do fluxo contínuo; estágio inicial passa a 6 meses.', 'ref': 8},
    {'data': '2026-09-01', 'titulo': 'Regras em vigor',
     'texto': 'Só doutorado direto, doutorado e pós-doutorado pedem BEPE a qualquer momento, por 6 meses. A prorrogação por mais 6 meses passa a ser excepcional.', 'ref': 9},
    {'data': '2026-09-28', 'titulo': 'Chamadas para IC e mestrado',
     'texto': 'Chamadas de propostas BEPE Iniciação Científica e BEPE Mestrado, só para quem teve a bolsa no país aprovada até 31/08/2026. Estágio fixo e improrrogável: 4 meses na iniciação científica, 6 no mestrado.', 'ref': 10},
    {'data': '2026-12-11', 'titulo': 'Fim das submissões das chamadas', 'texto': 'Resultado previsto para março de 2027.', 'ref': 10},
    {'data': '2027-01-01', 'rotulo': '1º sem. 2027', 'titulo': 'Chamada para os novos bolsistas',
     'texto': 'Nova chamada prevista para bolsistas de IC e mestrado com bolsa concedida a partir de 01/09/2026.', 'ref': 8},
]
ATUALIZACOES = [
    {'data': '2026-11-03', 'texto': 'Primeira versão do painel, com a exportação da BV de 25/10/2026.'},
    {'data': '2026-11-03', 'texto': 'Revisão de todos os números contra as exportações da BV e as páginas da FAPESP. Corrigidos: duração da chamada de iniciação científica (4 meses), bolsistas no exterior agora (sem os estágios já terminados) e a leitura da numeração dos processos, que não indica o mês do pedido.'},
    {'data': '2026-11-03', 'texto': 'Nova seção Mês a mês: partidas por mês de início em 2026 e 2025, duração dos estágios de doutorado e pós-doutorado e grandes áreas antes e depois do processo 16.000.'},
]


def grava(nome, cab, linhas):
    with open(FIG / nome, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(cab)
        w.writerows(linhas)


def sigla(nome):
    return nome[nome.rfind('(') + 1:-1] if nome.endswith(')') and '(' in nome else nome


def main():
    meta = json.loads((DADOS / 'bepe.json').read_text(encoding='utf-8'))['meta']
    ref = meta['atualizado']
    with open(DADOS / 'bolsas_fapesp_exterior.csv', encoding='utf-8') as f:
        bepe = [r for r in csv.DictReader(f) if r['grupo'] in MODS]
    for r in bepe:
        r['seq'] = int(r['processo'][3:8])
        r['ano'] = int(r['ano_pedido'])
        r['m'] = float(r['meses']) if r['meses'] else None
    ano = max(r['ano'] for r in bepe)
    ant = ano - 1
    mx = max(r['seq'] for r in bepe if r['ano'] == ano)
    andamento = [r for r in bepe if r['situacao'] == 'Em andamento']
    fora = [r for r in andamento if r['inicio'] <= ref and (not r['termino'] or r['termino'] >= ref)]
    iniciar = [r for r in andamento if r['inicio'] > ref]
    atuais = fora + iniciar   # sem os poucos registros "em andamento" com término já passado
    cont = lambda a, lo, hi: sum(1 for r in bepe if r['ano'] == a and lo <= r['seq'] < hi)

    kpis = {
        'no_exterior': len(fora), 'a_iniciar': len(iniciar), 'ano': ano, 'ano_anterior': ant,
        'pedidos_ano': cont(ano, 0, 10**6), 'pedidos_ant_mesmo_ponto': cont(ant, 0, mx + 1),
        'pedidos_ant_total': cont(ant, 0, 10**6),
        'antes_corte': cont(ano, 0, CORTE), 'antes_corte_ant': cont(ant, 0, CORTE),
        'depois_corte': cont(ano, CORTE, mx + 1), 'depois_corte_ant': cont(ant, CORTE, mx + 1),
        'max_seq': mx, 'corte': CORTE,
    }

    # curva acumulada pela numeração do processo
    acum = {}
    for a in range(ano - 3, ano + 1):
        seqs = sorted(r['seq'] for r in bepe if r['ano'] == a)
        if not seqs:
            continue
        topo = mx if a == ano else seqs[-1]
        pts, i = [], 0
        for b in range(0, topo + BIN, BIN):
            while i < len(seqs) and seqs[i] <= b:
                i += 1
            pts.append([min(b, topo), i])
        acum[str(a)] = pts
    grava('hoje02_acumulado_por_numero_processo.csv', ['ano_pedido', 'numero_processo_ate', 'bepe_acumuladas'],
          [[a, s, n] for a, pts in acum.items() for s, n in pts])

    # modalidades antes e depois do corte, ano atual x anterior
    mods = []
    for m in MODS:
        f = lambda a, lo, hi: sum(1 for r in bepe if r['ano'] == a and r['grupo'] == m and lo <= r['seq'] < hi)
        mods.append({'modalidade': CURTO[m], 'antes': f(ano, 0, CORTE), 'antes_ant': f(ant, 0, CORTE),
                     'depois': f(ano, CORTE, mx + 1), 'depois_ant': f(ant, CORTE, mx + 1)})
    grava('hoje03_modalidades_antes_depois.csv',
          ['modalidade', f'{ano}_ate_{CORTE - 1}', f'{ant}_ate_{CORTE - 1}', f'{ano}_de_{CORTE}_a_{mx}', f'{ant}_de_{CORTE}_a_{mx}'],
          [[d['modalidade'], d['antes'], d['antes_ant'], d['depois'], d['depois_ant']] for d in mods])

    # quem está fora agora ou vai sair
    top = lambda key, n, fn=lambda x: x: [[fn(k), v] for k, v in Counter(r[key] for r in atuais).most_common(n)]
    agora = {
        'paises': top('pais_destino', 10), 'areas': top('grande_area', 9),
        'instituicoes': top('instituicao_br', 8, sigla),
        'modalidades': [[CURTO[m], sum(r['grupo'] == m for r in atuais)] for m in MODS],
    }
    grava('hoje04_bolsistas_atuais.csv', ['recorte', 'categoria', 'bolsas'],
          [[k, c, n] for k, v in agora.items() for c, n in v])

    # inícios por mês (em andamento + a iniciar)
    ini = Counter(r['inicio'][:7] for r in atuais)
    meses = sorted(ini)
    inicios = [[m, ini[m], m > ref[:7]] for m in meses if m >= f'{ant}-11']
    grava('hoje05_inicios_por_mes.csv', ['mes_inicio', 'bolsas', 'futuro'], inicios)

    # duração das bolsas atuais
    fx = lambda m: '≤3' if m <= 3.05 else '3–6' if m <= 6.1 else '6–9' if m <= 9.1 else '9–12'
    dur = []
    for m in MODS:
        v = [r['m'] for r in atuais if r['grupo'] == m and r['m'] is not None]
        c = Counter(fx(x) for x in v)
        dur.append({'modalidade': CURTO[m], 'n': len(v), 'faixas': [c[k] for k in ['≤3', '3–6', '6–9', '9–12']],
                    'acima6': sum(x > 6.1 for x in v)})
    grava('hoje06_duracao_bolsas_atuais.csv', ['modalidade', 'bolsas', 'ate_3_meses', '3_a_6', '6_a_9', '9_a_12', 'acima_de_6_meses'],
          [[d['modalidade'], d['n'], *d['faixas'], d['acima6']] for d in dur])

    # mês a mês: estágios por mês de início, ano atual x anterior, por modalidade
    sig = {'BEPE Iniciação Científica': 'ic', 'BEPE Mestrado': 'me', 'BEPE Doutorado': 'do', 'BEPE Pós-doutorado': 'pd'}
    ini_m = Counter((r['inicio'][:7], sig[r['grupo']]) for r in bepe)
    mensal = []
    for mm in range(1, 13):
        lin = {'mes': mm}
        for a, k in ((ano, 'atual'), (ant, 'ant')):
            ch = f'{a}-{mm:02d}'
            lin[k] = {g: ini_m[(ch, g)] for g in sig.values()}
        lin['futuro'] = f'{ano}-{mm:02d}' > ref[:7]
        mensal.append(lin)
    grava('hoje07_inicios_por_mes_ano.csv',
          ['mes', 'modalidade', f'inicios_{ano}', f'inicios_{ant}', f'{ano}_ainda_por_comecar'],
          [[d['mes'], g, d['atual'][g], d['ant'][g], d['futuro']] for d in mensal for g in sig.values()])

    # duração dos estágios de doutorado e pós-doutorado por mês de início
    dur_m = []
    for a in (ant, ano, ano + 1):
        for mm in range(1, 13):
            ch = f'{a}-{mm:02d}'
            if ch > f'{ano + 1}-03':
                break
            lin = {'mes': ch}
            for g, k in (('BEPE Doutorado', 'do'), ('BEPE Pós-doutorado', 'pd')):
                v = [r['m'] for r in bepe if r['grupo'] == g and r['inicio'][:7] == ch and r['m'] is not None]
                lin[k] = [len(v), sum(x > 6.1 for x in v)]
            lin['futuro'] = ch > ref[:7]
            dur_m.append(lin)
    grava('hoje08_duracao_doutorado_posdoc_por_mes.csv',
          ['mes_inicio', 'doutorado', 'doutorado_acima_de_6_meses', 'pos_doutorado', 'pos_doutorado_acima_de_6_meses', 'ainda_por_comecar'],
          [[d['mes'], *d['do'], *d['pd'], d['futuro']] for d in dur_m])

    # grandes áreas antes e depois do corte
    gas = [g for g, _ in Counter(r['grande_area'] for r in bepe if r['grande_area']).most_common()]
    areas_corte = []
    for g in gas:
        f = lambda a, lo, hi: sum(1 for r in bepe if r['ano'] == a and r['grande_area'] == g and lo <= r['seq'] < hi)
        areas_corte.append({'modalidade': g, 'antes': f(ano, 0, CORTE), 'antes_ant': f(ant, 0, CORTE),
                            'depois': f(ano, CORTE, mx + 1), 'depois_ant': f(ant, CORTE, mx + 1)})
    areas_corte.sort(key=lambda d: -d['depois_ant'])
    grava('hoje09_grandes_areas_antes_depois.csv',
          ['grande_area', f'{ano}_ate_{CORTE - 1}', f'{ant}_ate_{CORTE - 1}', f'{ano}_de_{CORTE}_a_{mx}', f'{ant}_de_{CORTE}_a_{mx}'],
          [[d['modalidade'], d['antes'], d['antes_ant'], d['depois'], d['depois_ant']] for d in areas_corte])

    # resumo para o texto
    jaini = [d for d in mensal if not d['futuro']]
    pdpos = [r for r in bepe if r['grupo'] == 'BEPE Pós-doutorado' and r['ano'] == ano and r['seq'] >= CORTE and r['m'] is not None]
    dopd_fut = [r for r in bepe if r['grupo'] in ('BEPE Doutorado', 'BEPE Pós-doutorado') and r['inicio'] > ref and r['m'] is not None]
    kpis.update({
        'ini_ate_ref': sum(sum(d['atual'].values()) for d in jaini), 'ini_ate_ref_ant': sum(sum(d['ant'].values()) for d in jaini),
        'ini_meses_maior': sum(sum(d['atual'].values()) > sum(d['ant'].values()) for d in jaini), 'ini_meses': len(jaini),
        'ic_dez': mensal[11]['atual']['ic'], 'ic_dez_ant': mensal[11]['ant']['ic'],
        'ic_verao': sum(1 for r in bepe if r['grupo'] == 'BEPE Iniciação Científica' and f'{ano}-12' <= r['inicio'][:7] <= f'{ano + 1}-02'),
        'ic_verao_ant': sum(1 for r in bepe if r['grupo'] == 'BEPE Iniciação Científica' and f'{ant}-12' <= r['inicio'][:7] <= f'{ano}-02'),
        'ini_ate_ref_pedido_ano': sum(1 for r in bepe if r['ano'] == ano and f'{ano}-01' <= r['inicio'][:7] <= ref[:7]),
        'ini_ate_ref_pedido_ant': sum(1 for r in bepe if r['ano'] == ant and f'{ano}-01' <= r['inicio'][:7] <= ref[:7]),
        'pd_depois_n': len(pdpos), 'pd_depois_acima6': sum(x['m'] > 6.1 for x in pdpos),
        'dopd_fut_n': len(dopd_fut), 'dopd_fut_acima6': sum(x['m'] > 6.1 for x in dopd_fut),
    })

    grava('hoje01_indicadores.csv', ['indicador', 'valor'], [[k, v] for k, v in kpis.items()])
    painel = {'dados_de': ref, 'gerado_em': date.today().isoformat(), 'kpis': kpis, 'acumulado': acum,
              'modalidades': mods, 'agora': agora, 'inicios': inicios, 'duracao': dur,
              'mensal': mensal, 'duracao_mensal': dur_m, 'areas_corte': areas_corte,
              'eventos': EVENTOS, 'atualizacoes': ATUALIZACOES}
    (DADOS / 'painel_bepe_hoje.json').write_text(json.dumps(painel, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(json.dumps(kpis, ensure_ascii=False))


if __name__ == '__main__':
    main()
