"""Registra uma coleta da BV FAPESP e mede o que mudou desde a anterior.

Uso, com os dois CSVs da BV (a Action atualiza_semanal.yml faz isso quando sai um lote novo):
    python scripts/coleta_semanal.py <concluidas.csv> <em_andamento.csv>

A data dos dados vem do rodapé dos CSVs. --exportado é o dia da coleta (padrão: hoje).
O script recusa a coleta, sem gravar nada, se a data não avançar ou se muitas bolsas sumirem.
Depois de conferir, refaz os dados do site (prepare_data, painel_bepe_hoje, export_figuras) e grava data/coletas/.

Só a BEPE entra no registro. Os arquivos brutos trazem nomes e ficam fora do repositório: daqui só saem
número do processo, modalidade e datas, todos lidos por posição (ver prepare_data.ler).

A BV não informa a data de concessão. "primeira_coleta" é a coleta em que o processo apareceu pela primeira vez,
ou seja, ele foi publicado entre a coleta anterior e essa. Não é a data em que a FAPESP decidiu.
"""
import argparse
import csv
import subprocess
import sys
from collections import Counter
from datetime import date
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from prepare_data import MODALIDADE_GRUPO, data_exportacao, ler  # noqa: E402

PASTA = AQUI.parent / 'data' / 'coletas'
CURTO = {'BEPE Iniciação Científica': 'IC', 'BEPE Mestrado': 'ME', 'BEPE Doutorado': 'DO', 'BEPE Pós-doutorado': 'PD'}
CAB_COLETAS = ['coleta', 'dados_bv', 'bepe_total', 'novas', 'novas_ic', 'novas_me', 'novas_do', 'novas_pd', 'novas_ja_iniciadas',
               'novas_do_pd_ate_6', 'novas_do_pd_acima_6', 'mudou_inicio', 'mudou_termino', 'sumiram', 'voltaram', 'marcadas']
CAB_REGISTRO = ['processo', 'grupo', 'inicio', 'termino', 'meses', 'primeira_coleta', 'ausente_desde']
CAB_MUDANCAS = ['coleta', 'processo', 'campo', 'antes', 'depois']
CAB_MARCADAS = ['coleta', 'mes_inicio', 'grupo', 'bolsas']
SEIS_MESES = 6.1  # mesma regra do site: "mais de 6 meses" = acima de 6,1
QUEDA_MAXIMA = 0.01  # acima de 1% de bolsas sumidas, a coleta é recusada: costuma ser arquivo errado


def meses(inicio, termino):
    if not termino:
        return ''
    return round((date.fromisoformat(termino) - date.fromisoformat(inicio)).days / 30.44, 1)


def le_exportacao(concluidas, andamento):
    bepe = {}
    for caminho, situacao in ((concluidas, 'Concluída'), (andamento, 'Em andamento')):
        for r in ler(caminho, situacao):
            grupo = MODALIDADE_GRUPO.get(r['modalidade'], '')
            if grupo not in CURTO:
                continue
            if r['processo'] in bepe:
                raise SystemExit(f'Processo repetido na exportação: {r["processo"]}')
            bepe[r['processo']] = {'processo': r['processo'], 'grupo': grupo, 'inicio': r['inicio'], 'termino': r['termino'],
                                   'meses': meses(r['inicio'], r['termino'])}
    if not bepe:
        raise SystemExit('Nenhuma BEPE encontrada. Confira se os arquivos são as exportações de bolsas no exterior.')
    return bepe


def le_csv(nome):
    caminho = PASTA / nome
    if not caminho.exists():
        return []
    with open(caminho, encoding='utf-8', newline='') as f:
        return list(csv.DictReader(f))


def grava(nome, cabecalho, linhas):
    with open(PASTA / nome, 'w', encoding='utf-8', newline='\n') as f:
        w = csv.DictWriter(f, cabecalho, lineterminator='\n')
        w.writeheader()
        w.writerows(linhas)


def marcadas(bepe, coleta, dados_bv):
    c = Counter((b['inicio'][:7], b['grupo']) for b in bepe.values() if b['inicio'] > dados_bv)
    return [{'coleta': coleta, 'mes_inicio': m, 'grupo': g, 'bolsas': n} for (m, g), n in sorted(c.items())]


def compara(bepe, registro, coleta, dados_bv):
    """Devolve novas, mudanças, sumidas e voltas. Não altera nada."""
    antes = {r['processo']: r for r in registro}
    novas = [b for p, b in bepe.items() if p not in antes]
    mudancas, sumiram, voltaram = [], [], []
    for p, r in antes.items():
        b = bepe.get(p)
        if b is None:
            if not r['ausente_desde']:
                sumiram.append(p)
                mudancas.append({'coleta': coleta, 'processo': p, 'campo': 'sumiu', 'antes': '', 'depois': ''})
            continue
        if r['ausente_desde']:
            voltaram.append(p)
            mudancas.append({'coleta': coleta, 'processo': p, 'campo': 'voltou', 'antes': '', 'depois': ''})
        for campo in ('inicio', 'termino'):
            if r[campo] != b[campo]:
                mudancas.append({'coleta': coleta, 'processo': p, 'campo': campo, 'antes': r[campo], 'depois': b[campo]})
    return novas, mudancas, sumiram, voltaram


def novo_registro(bepe, registro, coleta, sumiram):
    linhas = []
    vistos = set()
    for r in registro:
        p = r['processo']
        vistos.add(p)
        b = bepe.get(p)
        if b is None:
            linhas.append({**r, 'ausente_desde': coleta if p in sumiram else r['ausente_desde']})
        else:
            linhas.append({**b, 'primeira_coleta': r['primeira_coleta'], 'ausente_desde': ''})
    linhas += [{**b, 'primeira_coleta': coleta, 'ausente_desde': ''} for p, b in bepe.items() if p not in vistos]
    linhas.sort(key=lambda r: (int(r['processo'][:2]) + (1900 if int(r['processo'][:2]) > 50 else 2000), r['processo']))
    return linhas


def refaz_site(concluidas, andamento):
    for passo in (['prepare_data.py', concluidas, andamento], ['painel_bepe_hoje.py'], ['export_figuras.py']):
        subprocess.run([sys.executable, str(AQUI / passo[0]), *passo[1:]], check=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('concluidas')
    ap.add_argument('andamento')
    ap.add_argument('--exportado', default=date.today().isoformat(), help='dia da coleta (AAAA-MM-DD); padrão: hoje')
    ap.add_argument('--base', action='store_true', help='cria o registro: as bolsas atuais viram a base, sem contar como novas')
    ap.add_argument('--sem-site', action='store_true', help='só registra a coleta, sem refazer os dados do site')
    ap.add_argument('--aceitar-queda', action='store_true', help='grava mesmo com mais de 1%% de bolsas sumidas, depois de conferir')
    a = ap.parse_args()

    coleta, dados_bv = date.fromisoformat(a.exportado).isoformat(), data_exportacao(a.concluidas, a.andamento)
    if dados_bv > coleta:
        raise SystemExit(f'A data dos dados ({dados_bv}) é posterior à da coleta ({coleta}).')
    PASTA.mkdir(parents=True, exist_ok=True)
    coletas, registro = le_csv('coletas.csv'), le_csv('registro.csv')
    bepe = le_exportacao(a.concluidas, a.andamento)
    linha = {c: '' for c in CAB_COLETAS}
    linha.update(coleta=coleta, dados_bv=dados_bv, bepe_total=len(bepe))
    mudancas, sumiram = [], []

    if a.base:
        if coletas or registro:
            raise SystemExit('Já existe registro. --base só serve para a primeira coleta.')
    else:
        if not coletas:
            raise SystemExit('Ainda não existe registro. Rode a primeira coleta com --base.')
        ultima = coletas[-1]
        if coleta <= ultima['coleta']:
            raise SystemExit(f'Já existe coleta de {ultima["coleta"]}. A nova precisa ter data posterior.')
        if dados_bv < ultima['dados_bv']:
            raise SystemExit(f'A data dos dados ({dados_bv}) é anterior à da última coleta ({ultima["dados_bv"]}).')
        novas, mudancas, sumiram, voltaram = compara(bepe, registro, coleta, dados_bv)
        if len(sumiram) > QUEDA_MAXIMA * int(ultima['bepe_total']) and not a.aceitar_queda:
            raise SystemExit(f'{len(sumiram)} bolsas sumiram desde a última coleta. Confira os arquivos; nada foi gravado.')
        por = Counter(CURTO[b['grupo']] for b in novas)
        dp = [b for b in novas if CURTO[b['grupo']] in ('DO', 'PD') and b['meses'] != '']
        linha.update(novas=len(novas), novas_ic=por['IC'], novas_me=por['ME'], novas_do=por['DO'], novas_pd=por['PD'],
                     novas_ja_iniciadas=sum(b['inicio'] <= dados_bv for b in novas),
                     novas_do_pd_ate_6=sum(b['meses'] <= SEIS_MESES for b in dp),
                     novas_do_pd_acima_6=sum(b['meses'] > SEIS_MESES for b in dp),
                     mudou_inicio=sum(m['campo'] == 'inicio' for m in mudancas),
                     mudou_termino=sum(m['campo'] == 'termino' for m in mudancas),
                     sumiram=len(sumiram), voltaram=len(voltaram))
    fut = marcadas(bepe, coleta, dados_bv)
    linha['marcadas'] = sum(m['bolsas'] for m in fut)

    # o registro só é gravado depois do site: se algo falhar antes, a coleta pode ser refeita
    if not a.sem_site:
        refaz_site(a.concluidas, a.andamento)
    grava('registro.csv', CAB_REGISTRO, novo_registro(bepe, registro, coleta, set(sumiram)))
    grava('mudancas.csv', CAB_MUDANCAS, le_csv('mudancas.csv') + mudancas)
    grava('marcadas.csv', CAB_MARCADAS, le_csv('marcadas.csv') + fut)
    grava('coletas.csv', CAB_COLETAS, coletas + [linha])

    print(f'Coleta {coleta}: dados da BV de {dados_bv}, {len(bepe)} BEPE, {linha["marcadas"]} partidas marcadas.')
    if a.base:
        print('Base criada: as bolsas atuais não contam como novas.')
    else:
        print(f'Novas: {linha["novas"]} (IC {linha["novas_ic"]}, mestrado {linha["novas_me"]}, doutorado {linha["novas_do"]}, '
              f'pós-doutorado {linha["novas_pd"]}). Doutorado e pós-doutorado: {linha["novas_do_pd_ate_6"]} até 6 meses, '
              f'{linha["novas_do_pd_acima_6"]} acima.')
        print(f'Mudanças: início {linha["mudou_inicio"]}, término {linha["mudou_termino"]}; sumiram {linha["sumiram"]}, voltaram {linha["voltaram"]}.')
        if dados_bv == coletas[-1]['dados_bv']:
            print('Aviso: a BV ainda informa a mesma data de dados da coleta anterior.')
    print('Nada foi enviado ao GitHub. Confira com git status e faça o commit.')


if __name__ == '__main__':
    main()
