"""Prepara os dados do site a partir das exportações da BV FAPESP.

Uso:
    python scripts/prepare_data.py <bolsas_no_exterior_concluidas.csv> <bolsas_no_exterior_em_andamento.csv>

Gera:
    data/bolsas_fapesp_exterior.csv  uma linha por bolsa, sem nomes nem resumos
    data/bepe.json                   agregados usados pelas visualizações

As exportações da BV trazem 33 campos por linha e só 30 nomes no cabeçalho,
então as colunas são lidas por posição (mapa COLS abaixo).
"""
import csv
import collections
import json
import statistics
import sys
from datetime import date
from pathlib import Path

csv.field_size_limit(10**8)
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data"

COLS = {0: "processo", 4: "instituicao", 5: "cidade", 18: "modalidade", 19: "grande_area", 20: "area",
        22: "assuntos", 23: "inicio", 24: "termino", 26: "inst_exterior", 28: "pais"}

GRUPOS = ["Pesquisa", "BEPE Pós-doutorado", "BEPE Doutorado", "BEPE Mestrado", "BEPE Iniciação Científica", "Outras"]
MODALIDADE_GRUPO = {
    "Bolsas no Exterior - Pesquisa": "Pesquisa",
    "Bolsas no Exterior - Estágio de Pesquisa - Pós-Doutorado": "BEPE Pós-doutorado",
    "Bolsas no Exterior - Estágio de Pesquisa - Doutorado": "BEPE Doutorado",
    "Bolsas no Exterior - Estágio de Pesquisa - Doutorado Direto": "BEPE Doutorado",
    "Bolsas no Exterior - Estágio de Pesquisa - Mestrado": "BEPE Mestrado",
    "Bolsas no Exterior - Estágio de Pesquisa - Iniciação Científica": "BEPE Iniciação Científica",
}
REINO_UNIDO = {"Inglaterra", "Escócia", "País de Gales", "Irlanda do Norte"}
PERIODOS = [(1992, 2001), (2002, 2011), (2012, 2016), (2017, 2021), (2022, 2026)]

# nome na BV -> (ISO 3166-1 numérico, longitude, latitude do ponto usado nos arcos)
PAISES = {
    "Estados Unidos": ("840", -95, 39), "Reino Unido": ("826", -1.8, 52.6), "França": ("250", 2.3, 46.6),
    "Espanha": ("724", -3.7, 40.2), "Alemanha": ("276", 10.4, 51.1), "Portugal": ("620", -8.3, 39.6),
    "Canadá": ("124", -88, 50), "Itália": ("380", 12.6, 42.8), "Austrália": ("036", 140, -28),
    "Países Baixos": ("528", 5.3, 52.2), "Bélgica": ("056", 4.6, 50.6), "Suíça": ("756", 8.2, 46.8),
    "Dinamarca": ("208", 9.6, 56), "Suécia": ("752", 15.5, 61), "Argentina": ("032", -63.6, -34),
    "Japão": ("392", 138.5, 36.2), "Chile": ("152", -71, -33.5), "Áustria": ("040", 14.5, 47.5),
    "México": ("484", -101.5, 22.5), "Irlanda": ("372", -8, 53.3), "Finlândia": ("246", 25.8, 62.5),
    "Noruega": ("578", 9.5, 61), "China": ("156", 110, 33), "Israel": ("376", 34.9, 31.4),
    "Nova Zelândia": ("554", 172.5, -41.5), "Uruguai": ("858", -56, -32.7), "Colômbia": ("170", -74, 4.6),
    "Índia": ("356", 78.9, 21.5), "Coréia do Sul": ("410", 127.8, 36.4), "Cingapura": ("702", 103.8, 1.35),
    "Singapura": ("702", 103.8, 1.35), "África do Sul": ("710", 24.5, -29), "República Tcheca": ("203", 15.4, 49.8),
    "Polônia": ("616", 19.4, 52), "Hungria": ("348", 19.4, 47.1), "Rússia": ("643", 37.6, 55.8),
    "Grécia": ("300", 22.2, 39.3), "Peru": ("604", -75, -9.5), "Cuba": ("192", -79.5, 21.7),
    "Moçambique": ("508", 35.5, -18.5), "Hong Kong": ("344", 114.2, 22.3), "Taiwan": ("158", 121, 23.7),
    "Turquia": ("792", 35, 39), "Costa Rica": ("188", -84, 9.9), "Equador": ("218", -78.4, -1.6),
    "Bolívia": ("068", -64.7, -16.7), "Venezuela": ("862", -66, 7.5), "Estônia": ("233", 25.5, 58.7),
    "Eslovênia": ("705", 14.9, 46.1), "Croácia": ("191", 15.6, 45.4), "Sérvia": ("688", 20.9, 44),
    "Romênia": ("642", 25, 45.9), "Bulgária": ("100", 25.4, 42.7), "Letônia": ("428", 24.6, 56.9),
    "Lituânia": ("440", 23.9, 55.3), "Luxemburgo": ("442", 6.1, 49.8), "Malta": ("470", 14.4, 35.9),
    "Chipre": ("196", 33.2, 35), "Ucrânia": ("804", 31.2, 49), "Bósnia-Herzegovina": ("070", 17.8, 44.2),
    "Egito": ("818", 30.8, 26.8), "Marrocos": ("504", -6.8, 31.8), "Senegal": ("686", -14.5, 14.5),
    "Guiné-Bissau": ("624", -15, 12), "Cabo Verde": ("132", -23.6, 15.1), "Burkina Faso": ("854", -1.6, 12.3),
    "Uganda": ("800", 32.4, 1.4), "Namíbia": ("516", 17.5, -22.5), "Arábia Saudita": ("682", 45, 24),
    "Emirados Árabes Unidos": ("784", 54, 24), "Irã": ("364", 53.7, 32.4), "Jordânia": ("400", 36.2, 31.2),
    "Síria": ("760", 38.5, 35), "Tailândia": ("764", 101, 15.2), "Indonésia": ("360", 113.9, -2.5),
    "Cambodja": ("116", 105, 12.6), "Timor Leste": ("626", 125.7, -8.8), "Fiji": ("242", 178, -17.8),
    "Nova Caledônia": ("540", 165.6, -21.3), "Panamá": ("591", -80, 8.6), "Porto Rico": ("630", -66.5, 18.2),
    "Trinidad E Tobago": ("780", -61.2, 10.5), "Bermuda": ("060", -64.8, 32.3),
}
MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


def ler(path, situacao):
    with open(path, encoding="utf-8-sig", newline="") as f:
        for linha in csv.reader(f, delimiter=";"):
            if len(linha) != 33:
                continue
            r = {nome: linha[i].strip() for i, nome in COLS.items()}
            if r["processo"] == "N. Processo":
                continue
            r["situacao"] = situacao
            yield r


def preparar(registros):
    for r in registros:
        yy = int(r["processo"][:2])
        r["ano"] = 1900 + yy if yy > 50 else 2000 + yy
        r["grupo"] = MODALIDADE_GRUPO.get(r["modalidade"], "Outras")
        pais = r["pais"].split(", ")[0]
        pais = "Reino Unido" if pais in REINO_UNIDO else {"Holanda": "Países Baixos", "Singapura": "Cingapura"}.get(pais, pais)
        r["pais_destino"] = pais
        r["universidade"] = r["instituicao"].split(". ")[0]
        r["unidade"] = r["instituicao"].split(". ", 1)[1] if ". " in r["instituicao"] else ""
        r["temas"] = sorted({t.strip() for t in r["assuntos"].split(":") if t.strip()})
        ini = date.fromisoformat(r["inicio"])
        fim = date.fromisoformat(r["termino"]) if r["termino"] else None
        r["ini"] = ini
        r["meses"] = round((fim - ini).days / 30.44, 1) if fim else None
        yield r


def periodo(ano):
    for a, b in PERIODOS:
        if a <= ano <= b:
            return f"{a}–{b}"
    return None


def main(concluidas, andamento):
    rs = list(preparar(list(ler(concluidas, "Concluída")) + list(ler(andamento, "Em andamento"))))
    assert len({r["processo"] for r in rs}) == len(rs), "processos repetidos"
    faltando = {r["pais_destino"] for r in rs if r["pais_destino"] and r["pais_destino"] not in PAISES}
    assert not faltando, f"países sem coordenadas: {faltando}"
    anos = list(range(min(r["ano"] for r in rs), max(r["ano"] for r in rs) + 1))
    per_nomes = [f"{a}–{b}" for a, b in PERIODOS]
    C = collections.Counter

    # tabela por bolsa, para download
    with open(OUT / "bolsas_fapesp_exterior.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["processo", "situacao", "ano_pedido", "inicio", "meses", "grupo", "modalidade", "grande_area", "area",
                    "instituicao_br", "unidade_br", "cidade_br", "pais_destino", "instituicao_exterior", "assuntos"])
        for r in sorted(rs, key=lambda r: (r["ano"], r["processo"])):
            w.writerow([r["processo"], r["situacao"], r["ano"], r["inicio"], r["meses"], r["grupo"],
                        r["modalidade"].replace("Bolsas no Exterior - ", ""), r["grande_area"], r["area"],
                        r["universidade"], r["unidade"], r["cidade"], r["pais_destino"], r["inst_exterior"], r["assuntos"]])

    por_ano = C(r["ano"] for r in rs)
    recorde = max(por_ano, key=por_ano.get)

    # ritmo anual
    anos_grupo = [{"ano": a, **{g: 0 for g in GRUPOS}} for a in anos]
    idx = {d["ano"]: d for d in anos_grupo}
    for r in rs:
        idx[r["ano"]][r["grupo"]] += 1
    inicio_ano = C(r["ini"].year for r in rs)

    # calendário (inícios 2012–2025)
    recorte = [r for r in rs if 2012 <= r["ini"].year <= 2025]
    meses = {g: [0] * 12 for g in ["Todas"] + GRUPOS}
    heat = collections.defaultdict(lambda: [0] * 12)
    for r in recorte:
        m = r["ini"].month - 1
        meses["Todas"][m] += 1
        meses[r["grupo"]][m] += 1
        heat[r["ini"].year][m] += 1

    # países
    tot_per = C(periodo(r["ano"]) for r in rs)
    paises = []
    for p, n in C(r["pais_destino"] for r in rs if r["pais_destino"]).most_common():
        iso, lon, lat = PAISES[p]
        sub = [r for r in rs if r["pais_destino"] == p]
        cp = C(periodo(r["ano"]) for r in sub)
        paises.append({"pais": p, "iso": iso, "lon": lon, "lat": lat, "n": n, "share": n / len(rs),
                       "periodos": {k: cp.get(k, 0) for k in per_nomes},
                       "grupos": {g: sum(1 for r in sub if r["grupo"] == g) for g in GRUPOS}})
    for k in per_nomes:
        ordem = sorted(paises, key=lambda d: -d["periodos"][k])
        for i, d in enumerate(ordem):
            d.setdefault("rank", {})[k] = i + 1 if d["periodos"][k] else None

    # grandes áreas
    gas = [g for g, _ in C(r["grande_area"] for r in rs if r["grande_area"]).most_common()]
    ga_ano = [{"ano": a, **{g: 0 for g in gas}} for a in anos]
    gidx = {d["ano"]: d for d in ga_ano}
    for r in rs:
        if r["grande_area"]:
            gidx[r["ano"]][r["grande_area"]] += 1
    areas = [{"area": a, "grande_area": g, "n": n} for (a, g), n in
             C((r["area"], r["grande_area"]) for r in rs if r["area"]).most_common(30)]

    # matriz grande área x país
    top_paises = [d["pais"] for d in paises[:8]]
    matriz = []
    for g in gas:
        sub = [r for r in rs if r["grande_area"] == g]
        cp = C(r["pais_destino"] if r["pais_destino"] in top_paises else "Outros" for r in sub)
        matriz.append({"grande_area": g, "n": len(sub), **{p: cp.get(p, 0) / len(sub) for p in top_paises + ["Outros"]}})

    # instituições no Brasil (árvore universidade > unidade)
    univs = C(r["universidade"] for r in rs if r["universidade"])
    arvore = {"name": "Brasil", "children": []}
    for u, n in univs.most_common(12):
        un = C(r["unidade"] or "Sem unidade registrada" for r in rs if r["universidade"] == u)
        filhos = [{"name": k, "value": v} for k, v in un.most_common(10)]
        resto = n - sum(f["value"] for f in filhos)
        if resto:
            filhos.append({"name": "Demais unidades", "value": resto})
        arvore["children"].append({"name": u, "value": n, "children": filhos})
    outras = len(rs) - sum(n for _, n in univs.most_common(12))
    arvore["children"].append({"name": "Outras instituições", "value": outras,
                               "children": [{"name": "Outras instituições", "value": outras}]})
    cidades = [{"cidade": c, "n": n} for c, n in C(r["cidade"] for r in rs if r["cidade"]).most_common(15)]

    # instituições anfitriãs
    hosts = []
    for h, n in C(r["inst_exterior"] for r in rs if r["inst_exterior"]).most_common(100):
        sub = [r for r in rs if r["inst_exterior"] == h]
        hosts.append({"nome": h, "n": n, "pais": C(r["pais_destino"] for r in sub).most_common(1)[0][0],
                      "area": C(r["grande_area"] for r in sub if r["grande_area"]).most_common(1)[0][0],
                      "primeiro": min(r["ano"] for r in sub), "ultimo": max(r["ano"] for r in sub)})

    # temas
    cont = C(t for r in rs for t in r["temas"])
    top_temas = [t for t, _ in cont.most_common(400)]
    serie = {t: [0] * len(anos) for t in top_temas}
    for r in rs:
        for t in r["temas"]:
            if t in serie:
                serie[t][r["ano"] - anos[0]] += 1
    antes = [r for r in rs if 2012 <= r["ano"] <= 2017]
    depois = [r for r in rs if 2021 <= r["ano"] <= 2026]
    ca, cd = C(t for r in antes for t in r["temas"]), C(t for r in depois for t in r["temas"])
    ascensao = sorted(({"tema": t, "antes": ca.get(t, 0), "depois": n,
                        "share_antes": ca.get(t, 0) / len(antes), "share_depois": n / len(depois),
                        "razao": (n / len(depois)) / ((ca.get(t, 0) + 1) / len(antes))}
                       for t, n in cd.items() if n >= 25), key=lambda d: -d["razao"])
    temas_area = {g: [t for t, _ in C(t for r in rs if r["grande_area"] == g for t in r["temas"]).most_common(8)] for g in gas}

    # modalidades
    modalidades = []
    for g in GRUPOS:
        sub = [r for r in rs if r["grupo"] == g]
        dur = [r["meses"] for r in sub if r["meses"]]
        dest = C(r["pais_destino"] for r in sub if r["pais_destino"]).most_common(1)[0]
        pico = max(range(12), key=lambda i: meses[g][i])
        modalidades.append({"grupo": g, "n": len(sub), "share": len(sub) / len(rs), "desde": min(r["ano"] for r in sub),
                            "mediana_meses": statistics.median(dur) if dur else None, "destino": dest[0],
                            "destino_share": dest[1] / len(sub), "mes_pico": MESES[pico]})

    dados = {
        "meta": {"total": len(rs), "concluidas": sum(r["situacao"] == "Concluída" for r in rs),
                 "andamento": sum(r["situacao"] == "Em andamento" for r in rs), "primeiro_ano": anos[0],
                 "ultimo_ano": anos[-1], "atualizado": "2026-10-25", "paises": len(paises),
                 "anfitrias": len({r["inst_exterior"] for r in rs if r["inst_exterior"]}),
                 "unidades_br": len({r["instituicao"] for r in rs if r["instituicao"]}),
                 "temas": len(cont), "ano_recorde": recorde, "recorde": por_ano[recorde],
                 "media_2022_2025": round(sum(por_ano[a] for a in range(2022, 2026)) / 4),
                 "periodos": per_nomes, "grupos": GRUPOS, "grandes_areas": gas, "top_paises": top_paises},
        "anos": anos_grupo,
        "inicios_por_ano": [{"ano": a, "n": inicio_ano.get(a, 0)} for a in range(anos[0], max(inicio_ano) + 1)],
        "meses": meses,
        "heat": [{"ano": a, "meses": heat[a]} for a in range(2012, 2026)],
        "paises": paises,
        "tot_periodos": {k: tot_per.get(k, 0) for k in per_nomes},
        "ga_ano": ga_ano,
        "areas": areas,
        "matriz": matriz,
        "arvore": arvore,
        "cidades": cidades,
        "anfitrias": hosts,
        "temas": {"anos": anos, "totais_ano": [por_ano.get(a, 0) for a in anos],
                  "lista": [{"tema": t, "n": cont[t], "serie": serie[t]} for t in top_temas]},
        "ascensao": ascensao,
        "temas_area": temas_area,
        "modalidades": modalidades,
    }
    with open(OUT / "bepe.json", "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(rs)} bolsas; bepe.json {(OUT / 'bepe.json').stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
