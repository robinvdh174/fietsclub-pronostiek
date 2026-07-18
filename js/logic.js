// Pure spellogica: punten, klassement, dubbels, deel-tekst.
// Geen DOM en geen opslag — draait ook onder Node (tests).

export const STANDAARD_REGELS = { exact: 3, tendens: 1 };

export function isExact(prono, uitslag) {
  return (
    prono.voorspeldThuis === uitslag.thuis &&
    prono.voorspeldUit === uitslag.uit
  );
}

export function berekenPunten(prono, uitslag, regels = STANDAARD_REGELS) {
  if (isExact(prono, uitslag)) return regels.exact;
  const tendensJuist =
    Math.sign(prono.voorspeldThuis - prono.voorspeldUit) ===
    Math.sign(uitslag.thuis - uitslag.uit);
  return tendensJuist ? regels.tendens : 0;
}

export function vindDubbel(pronos, kandidaat) {
  return (
    pronos.find(
      (p) =>
        p.spelerId !== kandidaat.spelerId &&
        p.voorspeldThuis === kandidaat.voorspeldThuis &&
        p.voorspeldUit === kandidaat.voorspeldUit
    ) ?? null
  );
}

export function maakKlassement(deelnemerIds, pronos) {
  const rijen = deelnemerIds.map((spelerId) => {
    const eigen = pronos.filter((p) => p.spelerId === spelerId);
    return {
      spelerId,
      punten: eigen.reduce((som, p) => som + p.punten, 0),
      aantalExact: eigen.filter((p) => p.exact).length,
      aantalMatchen: eigen.length,
    };
  });
  rijen.sort((a, b) => b.punten - a.punten || b.aantalExact - a.aantalExact);
  let plaats = 0;
  rijen.forEach((rij, i) => {
    if (
      i === 0 ||
      rij.punten !== rijen[i - 1].punten ||
      rij.aantalExact !== rijen[i - 1].aantalExact
    ) {
      plaats = i + 1;
    }
    rij.plaats = plaats;
  });
  return rijen;
}

// De pot groeit per match: elke match heeft een inleg per speler, en per
// speler wordt bijgehouden of die voor die match betaald heeft.
export function potBedrag(matchen, pronos) {
  const inlegPerMatch = new Map(matchen.map((m) => [m.id, m.inleg ?? 0]));
  return pronos.reduce(
    (som, p) => som + (p.inlegBetaald ? inlegPerMatch.get(p.matchId) ?? 0 : 0),
    0
  );
}

// Statistieken per speler over de afgeronde matchen (chronologisch
// aangeleverd, oud → nieuw). Vorm = resultaat van de laatste vijf.
export function maakStatistieken(deelnemerIds, matchenChronologisch, pronos) {
  const volgorde = new Map(matchenChronologisch.map((m, i) => [m.id, i]));
  return deelnemerIds.map((spelerId) => {
    const eigen = pronos
      .filter((p) => p.spelerId === spelerId && volgorde.has(p.matchId))
      .sort((a, b) => volgorde.get(a.matchId) - volgorde.get(b.matchId));
    const punten = eigen.reduce((som, p) => som + p.punten, 0);
    const exact = eigen.filter((p) => p.exact).length;
    const tendens = eigen.filter((p) => !p.exact && p.punten > 0).length;
    return {
      spelerId,
      gespeeld: eigen.length,
      punten,
      exact,
      tendens,
      gemiddelde: eigen.length ? Math.round((punten / eigen.length) * 10) / 10 : 0,
      vorm: eigen
        .slice(-5)
        .map((p) => (p.exact ? "exact" : p.punten > 0 ? "tendens" : "mis")),
    };
  });
}

export function deelStandTekst(seizoen, klassement, namenById, aantalMatchen, pot) {
  const rijen = klassement.map(
    (r) =>
      `${r.plaats}. ${namenById[r.spelerId] ?? "?"} — ${r.punten} ptn` +
      (r.aantalExact > 0 ? ` (${r.aantalExact}× exact)` : "")
  );
  return [
    `🚴 Fits Club Neet Te Snel — ${seizoen.naam}`,
    `Klassement na ${aantalMatchen} match${aantalMatchen === 1 ? "" : "en"}:`,
    ...rijen,
    `💰 In de pot: €${pot}`,
  ].join("\n");
}
