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

export function potBedrag(seizoen) {
  return seizoen.inleg * seizoen.deelnemers.filter((d) => d.betaald).length;
}

export function deelStandTekst(seizoen, klassement, namenById, aantalMatchen) {
  const rijen = klassement.map(
    (r) =>
      `${r.plaats}. ${namenById[r.spelerId] ?? "?"} — ${r.punten} ptn` +
      (r.aantalExact > 0 ? ` (${r.aantalExact}× exact)` : "")
  );
  return [
    `🚴 Fits Club Neet Te Snel — ${seizoen.naam}`,
    `Klassement na ${aantalMatchen} match${aantalMatchen === 1 ? "" : "en"}:`,
    ...rijen,
    `💰 In de pot: €${potBedrag(seizoen)}`,
  ].join("\n");
}
