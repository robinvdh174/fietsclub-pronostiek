import {
  STANDAARD_REGELS,
  berekenPunten,
  isExact,
  vindDubbel,
  maakKlassement,
  potBedrag,
  deelStandTekst,
  maakStatistieken,
} from "./logic.js";
import { store } from "./store.js";

const scherm = document.getElementById("scherm");

export function esc(tekst) {
  return String(tekst).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

async function haalInstellingen() {
  return (
    (await store.vind("instellingen", "app")) ?? { id: "app", ...STANDAARD_REGELS }
  );
}

async function actiefSeizoen() {
  return (await store.alle("seizoenen")).find((s) => s.status === "actief") ?? null;
}

async function naamMap() {
  const spelers = await store.alle("spelers");
  return Object.fromEntries(spelers.map((s) => [s.id, s.naam]));
}

// Pronostieken van alle afgeronde matchen in een seizoen.
async function seizoenPronos(seizoenId) {
  const [matchen, pronos] = await Promise.all([
    store.alle("matchen"),
    store.alle("pronos"),
  ]);
  const ids = new Set(
    matchen
      .filter((m) => m.seizoenId === seizoenId && m.status === "afgerond")
      .map((m) => m.id)
  );
  return { pronos: pronos.filter((p) => ids.has(p.matchId)), aantalMatchen: ids.size };
}

// Pot van een seizoen: som over alle matchen (open én afgerond).
async function seizoenPot(seizoenId) {
  const [matchen, pronos] = await Promise.all([
    store.alle("matchen"),
    store.alle("pronos"),
  ]);
  const eigen = matchen.filter((m) => m.seizoenId === seizoenId);
  const ids = new Set(eigen.map((m) => m.id));
  return potBedrag(eigen, pronos.filter((p) => ids.has(p.matchId)));
}

const routes = {
  home: renderHome,
  spelers: renderSpelers,
  seizoenen: renderSeizoenen,
  "nieuwe-match": renderNieuweMatch,
  "wijzig-match": renderWijzigMatch,
  matchen: renderMatchen,
  pot: renderPot,
  statistieken: renderStatistieken,
  instellingen: renderInstellingen,
};

const WHATSAPP_ICOON = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;

async function navigeer() {
  const [route, arg] = location.hash.replace(/^#/, "").split("/");
  const render = routes[route] ?? renderHome;
  try {
    await render(arg);
  } catch (fout) {
    scherm.innerHTML = `<p>Er ging iets mis: ${esc(fout.message)}</p>`;
  }
  // zachte overgang tussen schermen
  scherm.classList.remove("verschijn");
  void scherm.offsetWidth;
  scherm.classList.add("verschijn");
  document
    .querySelectorAll("nav a")
    .forEach((a) => a.classList.toggle("actief", a.hash === `#${route}`));
}

async function renderHome() {
  const seizoen = await actiefSeizoen();
  if (!seizoen) {
    scherm.innerHTML = `<h2>Welkom!</h2>
      <p class="stil">Er loopt nog geen seizoen. Zodra er eentje gestart is,
      zie je hier het klassement.</p>`;
    return;
  }
  const namen = await naamMap();
  const [alleMatchen, allePronos] = await Promise.all([
    store.alle("matchen"),
    store.alle("pronos"),
  ]);
  const matchen = alleMatchen.filter((m) => m.seizoenId === seizoen.id);
  const matchIds = new Set(matchen.map((m) => m.id));
  const seizoensPronos = allePronos.filter((p) => matchIds.has(p.matchId));
  const afgerond = matchen
    .filter((m) => m.status === "afgerond")
    .sort((a, b) => a.datum.localeCompare(b.datum));
  const afgerondIds = new Set(afgerond.map((m) => m.id));
  const aantalMatchen = afgerond.length;
  const pot = potBedrag(matchen, seizoensPronos);
  const klassement = maakKlassement(
    seizoen.deelnemers.map((d) => d.spelerId),
    seizoensPronos.filter((p) => afgerondIds.has(p.matchId))
  );

  // Laatste match: uitslag + wie er juist zat.
  const laatste = afgerond.at(-1);
  let laatsteKaart = "";
  if (laatste) {
    const lp = seizoensPronos.filter((p) => p.matchId === laatste.id);
    const noem = (lijst) =>
      lijst.map((p) => esc(namen[p.spelerId] ?? "?")).join(", ");
    const exacte = lp.filter((p) => p.exact);
    const winnaars = lp.filter((p) => !p.exact && p.punten > 0);
    const wie =
      exacte.length || winnaars.length
        ? [
            exacte.length ? `🎯 Exact: ${noem(exacte)}` : "",
            winnaars.length ? `✔ Winnaar juist: ${noem(winnaars)}` : "",
          ]
            .filter(Boolean)
            .join(" · ")
        : "Niemand zat juist.";
    laatsteKaart = `<div class="kaart laatste-match">
      <div class="label">Laatste match · ${laatste.datum.slice(8, 10)}/${laatste.datum.slice(5, 7)}</div>
      <div class="match">${esc(laatste.thuisploeg)} – ${esc(laatste.uitploeg)}
        <span class="score">${laatste.echteThuisScore}–${laatste.echteUitScore}</span></div>
      <div class="wie">${wie}</div>
    </div>`;
  }

  // Stijgers/dalers t.o.v. de stand vóór de laatste match.
  let pijlen = {};
  try {
    const vorig = JSON.parse(localStorage.getItem("stand-vorig") || "null");
    const plaatsen = Object.fromEntries(klassement.map((r) => [r.spelerId, r.plaats]));
    if (vorig?.seizoenId === seizoen.id && aantalMatchen === vorig.aantalMatchen) {
      pijlen = vorig.pijlen ?? {};
    } else {
      if (vorig?.seizoenId === seizoen.id && aantalMatchen > vorig.aantalMatchen) {
        for (const r of klassement) {
          const oud = vorig.plaatsen?.[r.spelerId];
          if (oud && oud !== r.plaats) pijlen[r.spelerId] = oud > r.plaats ? "op" : "neer";
        }
      }
      localStorage.setItem(
        "stand-vorig",
        JSON.stringify({ seizoenId: seizoen.id, aantalMatchen, plaatsen, pijlen })
      );
    }
  } catch { /* geen localStorage — dan geen pijltjes */ }

  scherm.innerHTML = `
    <h2>${esc(seizoen.naam)} <span class="stil">· ${aantalMatchen} match${aantalMatchen === 1 ? "" : "en"}</span></h2>
    ${laatsteKaart}
    <div class="klassement">
      ${klassement
        .map(
          (r, i) => `<div class="rij ${r.plaats === 1 ? "een" : ""}" style="animation-delay:${i * 45}ms">
                  <span class="rug">${r.plaats}</span>
                  <b>${esc(namen[r.spelerId] ?? "?")}</b>
                  ${pijlen[r.spelerId] ? `<span class="pijl ${pijlen[r.spelerId]}">${pijlen[r.spelerId] === "op" ? "▲" : "▼"}</span>` : ""}
                  ${r.aantalExact > 0 ? `<span class="ex">${r.aantalExact}× exact</span>` : ""}
                  <span class="ptn">${r.punten}</span></div>`
        )
        .join("")}
    </div>
    <p class="pot">💰 In de pot: <strong>€${pot}</strong></p>
    <button id="deel" class="deel-knop" title="Deel de stand via WhatsApp"
      aria-label="Deel de stand via WhatsApp">${WHATSAPP_ICOON}</button>`;
  scherm.querySelector("#deel").onclick = () => {
    const tekst = deelStandTekst(seizoen, klassement, namen, aantalMatchen, pot);
    window.open(`https://wa.me/?text=${encodeURIComponent(tekst)}`, "_blank");
  };
}

async function renderStatistieken() {
  const seizoen = await actiefSeizoen();
  if (!seizoen) {
    scherm.innerHTML = `<h2>Statistieken</h2>
      <p class="stil">Er loopt geen seizoen.</p>`;
    return;
  }
  const namen = await naamMap();
  const [alleMatchen, allePronos] = await Promise.all([
    store.alle("matchen"),
    store.alle("pronos"),
  ]);
  const afgerond = alleMatchen
    .filter((m) => m.seizoenId === seizoen.id && m.status === "afgerond")
    .sort((a, b) => a.datum.localeCompare(b.datum));
  const ids = new Set(afgerond.map((m) => m.id));
  const stats = maakStatistieken(
    seizoen.deelnemers.map((d) => d.spelerId),
    afgerond,
    allePronos.filter((p) => ids.has(p.matchId))
  ).sort((a, b) => b.punten - a.punten || b.exact - a.exact);
  scherm.innerHTML = `
    <h2>Statistieken <span class="stil">· ${esc(seizoen.naam)}</span></h2>
    ${
      afgerond.length === 0
        ? `<p class="stil">Nog geen afgeronde matchen — na de eerste uitslag komt hier de vorm van elke speler.</p>`
        : `<p class="stil vorm-legende"><i class="dot exact"></i> exact ·
             <i class="dot tendens"></i> winnaar juist ·
             <i class="dot mis"></i> mis &nbsp;(laatste 5, oud → nieuw)</p>
           ${stats
             .map(
               (s) => `
          <div class="stat-rij">
            <div class="stat-kop"><b>${esc(namen[s.spelerId] ?? "?")}</b>
              <span class="vorm">${s.vorm.map((v) => `<i class="dot ${v}"></i>`).join("")}</span></div>
            <div class="stat-cijfers">${s.gespeeld} match${s.gespeeld === 1 ? "" : "en"} ·
              ${s.exact}× exact · ${s.tendens}× winnaar juist ·
              gem. ${String(s.gemiddelde).replace(".", ",")} ptn</div>
          </div>`
             )
             .join("")}`
    }`;
}

async function renderPot() {
  const seizoen = await actiefSeizoen();
  if (!seizoen) {
    scherm.innerHTML = `<h2>Pot</h2>
      <p class="stil">Er loopt geen seizoen, dus er is ook geen pot.</p>`;
    return;
  }
  const namen = await naamMap();
  const [alleMatchen, allePronos] = await Promise.all([
    store.alle("matchen"),
    store.alle("pronos"),
  ]);
  const matchen = alleMatchen
    .filter((m) => m.seizoenId === seizoen.id)
    .sort((a, b) => b.datum.localeCompare(a.datum));
  const ids = new Set(matchen.map((m) => m.id));
  const pronos = allePronos.filter((p) => ids.has(p.matchId));
  scherm.innerHTML = `
    <h2>Pot — ${esc(seizoen.naam)}</h2>
    <p class="pot">💰 In de pot: <strong>€${potBedrag(matchen, pronos)}</strong></p>
    ${
      matchen.length === 0
        ? `<p class="stil">Nog geen matchen — de pot groeit per match.</p>`
        : matchen
            .map((m) => {
              const eigen = pronos
                .filter((p) => p.matchId === m.id)
                .sort((a, b) =>
                  (namen[a.spelerId] ?? "").localeCompare(namen[b.spelerId] ?? "")
                );
              return `
      <fieldset class="pot-match" data-match="${m.id}">
        <legend>${esc(m.thuisploeg)} – ${esc(m.uitploeg)} · ${m.datum.slice(8, 10)}/${m.datum.slice(5, 7)}</legend>
        <label class="inleg-regel">Inleg per speler (€)
          <input type="number" min="0" step="0.5" class="match-inleg" value="${m.inleg ?? 0}">
        </label>
        ${eigen
          .map(
            (p) => `<label><input type="checkbox" data-prono="${p.id}"
              ${p.inlegBetaald ? "checked" : ""}> ${esc(namen[p.spelerId] ?? "?")}</label>`
          )
          .join("")}
      </fieldset>`;
            })
            .join("")
    }`;
  scherm.querySelectorAll(".match-inleg").forEach(
    (veld) =>
      (veld.onchange = async () => {
        const match = matchen.find(
          (m) => m.id === veld.closest(".pot-match").dataset.match
        );
        match.inleg = veld.valueAsNumber || 0;
        await store.bewaar("matchen", match);
        renderPot();
      })
  );
  scherm.querySelectorAll("input[data-prono]").forEach(
    (vak) =>
      (vak.onchange = async () => {
        const prono = pronos.find((p) => p.id === vak.dataset.prono);
        prono.inlegBetaald = vak.checked;
        await store.bewaar("pronos", prono);
        renderPot();
      })
  );
}
async function renderSpelers() {
  const spelers = (await store.alle("spelers")).sort((a, b) =>
    a.naam.localeCompare(b.naam)
  );
  scherm.innerHTML = `
    <h2>Spelers</h2>
    <form id="nieuwe-speler">
      <input name="naam" placeholder="Naam" required>
      <button>Voeg toe</button>
    </form>
    <ul class="lijst">${spelers
      .map(
        (s) => `
      <li class="${s.actief ? "" : "inactief"}">
        <span>${esc(s.naam)}</span>
        <span class="acties">
          <button class="klein" data-actie="naam" data-id="${s.id}" title="Naam wijzigen">✏️</button>
          <button class="klein" data-actie="weg" data-id="${s.id}" title="Verwijder speler">🗑️</button>
          <button class="klein" data-actie="toggle" data-id="${s.id}">${s.actief ? "Zet inactief" : "Zet actief"}</button>
        </span>
      </li>`
      )
      .join("") || "<li class='stil'>Nog geen spelers.</li>"}
    </ul>`;
  scherm.querySelector("#nieuwe-speler").onsubmit = async (e) => {
    e.preventDefault();
    const naam = e.target.naam.value.trim();
    if (!naam) return;
    await store.bewaar("spelers", { id: store.nieuwId(), naam, actief: true });
    renderSpelers();
  };
  scherm.querySelectorAll("li button").forEach(
    (knop) =>
      (knop.onclick = async () => {
        const speler = await store.vind("spelers", knop.dataset.id);
        if (knop.dataset.actie === "naam") {
          // Namen staan alleen op de spelerskaart (rest verwijst via id),
          // dus een nieuwe naam verschijnt overal vanzelf.
          const nieuw = prompt(`Nieuwe naam voor ${speler.naam}:`, speler.naam);
          if (!nieuw || !nieuw.trim() || nieuw.trim() === speler.naam) return;
          speler.naam = nieuw.trim();
          await store.bewaar("spelers", speler);
        } else if (knop.dataset.actie === "weg") {
          const [pronos, seizoenen] = await Promise.all([
            store.alle("pronos"),
            store.alle("seizoenen"),
          ]);
          const inGebruik =
            pronos.some((p) => p.spelerId === speler.id) ||
            seizoenen.some(
              (z) =>
                z.winnaarSpelerId === speler.id ||
                z.deelnemers.some((d) => d.spelerId === speler.id)
            );
          if (inGebruik)
            return alert(
              `${speler.naam} zit in een seizoen of heeft pronostieken. ` +
                `Zet hem inactief — dan doet hij niet meer mee maar blijft de historiek kloppen.`
            );
          if (!confirm(`${speler.naam} definitief verwijderen?`)) return;
          await store.verwijder("spelers", speler.id);
        } else {
          speler.actief = !speler.actief;
          await store.bewaar("spelers", speler);
        }
        renderSpelers();
      })
  );
}
async function renderSeizoenen() {
  const [seizoenen, spelers, namen] = await Promise.all([
    store.alle("seizoenen"),
    store.alle("spelers"),
    naamMap(),
  ]);
  const actief = seizoenen.find((s) => s.status === "actief");
  const historie = seizoenen
    .filter((s) => s.status === "afgesloten")
    .sort((a, b) => b.startdatum.localeCompare(a.startdatum));
  scherm.innerHTML = `
    <h2>Seizoenen</h2>
    ${
      actief
        ? `<p><strong>${esc(actief.naam)}</strong> loopt (gestart ${actief.startdatum},
             ${actief.deelnemers.length} deelnemers).</p>
           <fieldset><legend>Deelnemers</legend>
             ${spelers
               .filter((s) => s.actief || actief.deelnemers.some((d) => d.spelerId === s.id))
               .sort((a, b) => a.naam.localeCompare(b.naam))
               .map(
                 (s) =>
                   `<label><input type="checkbox" name="lid" value="${s.id}"
                    ${actief.deelnemers.some((d) => d.spelerId === s.id) ? "checked" : ""}> ${esc(s.naam)}</label>`
               )
               .join("")}
             <button id="bewaar-deelnemers" class="klein">Bewaar deelnemers</button>
           </fieldset>
           <button id="sluit-af" class="gevaar">🏁 Seizoen afsluiten</button>`
        : `<form id="nieuw-seizoen">
             <input name="naam" placeholder="Naam (bv. Najaar 2026)" required>
             <fieldset><legend>Deelnemers</legend>
               ${spelers
                 .filter((s) => s.actief)
                 .sort((a, b) => a.naam.localeCompare(b.naam))
                 .map(
                   (s) =>
                     `<label><input type="checkbox" name="deelnemer" value="${s.id}" checked> ${esc(s.naam)}</label>`
                 )
                 .join("") || "<p class='stil'>Voeg eerst spelers toe.</p>"}
             </fieldset>
             <button>Start seizoen</button>
           </form>`
    }
    <h3>Erelijst</h3>
    <ul class="lijst erelijst">${
      historie
        .map(
          (s) =>
            `<li><span class="beker">🏆</span>
             <span class="ere-info"><b>${esc(s.naam)}</b>
               <span class="ere-winnaar">${esc(namen[s.winnaarSpelerId] ?? "—")}</span></span>
             <span class="ere-pot">€${s.potUitbetaald}</span></li>`
        )
        .join("") ||
      "<li class='stil'>Nog geen kampioenen — sluit een seizoen af en de eerste naam hangt hier voor eeuwig.</li>"
    }</ul>`;

  const form = scherm.querySelector("#nieuw-seizoen");
  if (form)
    form.onsubmit = async (e) => {
      e.preventDefault();
      const gekozen = [...form.querySelectorAll("input[name=deelnemer]:checked")];
      if (gekozen.length < 2) return alert("Kies minstens twee deelnemers.");
      await store.bewaar("seizoenen", {
        id: store.nieuwId(),
        naam: form.naam.value.trim(),
        startdatum: new Date().toISOString().slice(0, 10),
        einddatum: null,
        status: "actief",
        deelnemers: gekozen.map((c) => ({ spelerId: c.value })),
        winnaarSpelerId: null,
        potUitbetaald: null,
      });
      location.hash = "#home";
    };

  const deelnemersKnop = scherm.querySelector("#bewaar-deelnemers");
  if (deelnemersKnop)
    deelnemersKnop.onclick = async (e) => {
      e.preventDefault();
      const gekozen = new Set(
        [...scherm.querySelectorAll("input[name=lid]:checked")].map((c) => c.value)
      );
      if (gekozen.size < 2) return alert("Een seizoen heeft minstens twee deelnemers.");
      const matchIds = new Set(
        (await store.alle("matchen"))
          .filter((m) => m.seizoenId === actief.id)
          .map((m) => m.id)
      );
      const pronos = (await store.alle("pronos")).filter((p) => matchIds.has(p.matchId));
      for (const d of actief.deelnemers) {
        if (!gekozen.has(d.spelerId) && pronos.some((p) => p.spelerId === d.spelerId)) {
          return alert(
            `${namen[d.spelerId]} heeft al pronostieken in dit seizoen en kan er niet meer uit.`
          );
        }
      }
      actief.deelnemers = [
        ...actief.deelnemers.filter((d) => gekozen.has(d.spelerId)),
        ...[...gekozen]
          .filter((id) => !actief.deelnemers.some((d) => d.spelerId === id))
          .map((id) => ({ spelerId: id })),
      ];
      await store.bewaar("seizoenen", actief);
      alert("Deelnemers bewaard. Bij een open match kun je hun pronostiek nog invullen via ✏️.");
      renderSeizoenen();
    };

  const sluitKnop = scherm.querySelector("#sluit-af");
  if (sluitKnop)
    sluitKnop.onclick = async () => {
      const { pronos } = await seizoenPronos(actief.id);
      const klassement = maakKlassement(
        actief.deelnemers.map((d) => d.spelerId),
        pronos
      );
      const winnaar = klassement[0];
      const pot = await seizoenPot(actief.id);
      if (
        !confirm(
          `Seizoen afsluiten? Winnaar: ${namen[winnaar?.spelerId] ?? "—"} ` +
            `met ${winnaar?.punten ?? 0} punten — pakt de pot van €${pot}.`
        )
      )
        return;
      Object.assign(actief, {
        status: "afgesloten",
        einddatum: new Date().toISOString().slice(0, 10),
        winnaarSpelerId: winnaar?.spelerId ?? null,
        potUitbetaald: pot,
      });
      await store.bewaar("seizoenen", actief);
      renderSeizoenen();
    };
}
async function renderNieuweMatch() {
  const seizoen = await actiefSeizoen();
  if (!seizoen) {
    scherm.innerHTML = `<h2>Nieuwe match</h2>
      <p class="stil">Er loopt geen seizoen.</p>
      <a class="knop" href="#seizoenen">Start eerst een seizoen</a>`;
    return;
  }
  const [namen, alleMatchen] = await Promise.all([naamMap(), store.alle("matchen")]);
  const deelnemers = seizoen.deelnemers.filter((d) => namen[d.spelerId]);
  // inleg vooraf invullen met die van de vorige match van dit seizoen
  const vorigeInleg =
    alleMatchen
      .filter((m) => m.seizoenId === seizoen.id)
      .sort((a, b) => b.datum.localeCompare(a.datum))[0]?.inleg ?? 0;
  scherm.innerHTML = `
    <h2>Nieuwe match</h2>
    <form id="match-form">
      <input name="datum" type="date" value="${new Date().toISOString().slice(0, 10)}" required>
      <div class="ploegen-rij">
        <input name="thuis" placeholder="Thuisploeg" required>
        <span class="vs">–</span>
        <input name="uit" placeholder="Uitploeg" required>
      </div>
      <label class="inleg-regel">Inleg per speler (€)
        <input name="inleg" type="number" min="0" step="0.5" value="${vorigeInleg}"></label>
      <h3>Pronostieken (niemand hetzelfde!)</h3>
      ${deelnemers
        .map(
          (d) => `
        <div class="prono" data-speler="${d.spelerId}">
          <span>${esc(namen[d.spelerId])}</span>
          <input type="number" min="0" name="t-${d.spelerId}" required> –
          <input type="number" min="0" name="u-${d.spelerId}" required>
          <em class="dubbel-melding"></em>
        </div>`
        )
        .join("")}
      <button>Bewaar match</button>
    </form>`;
  const form = scherm.querySelector("#match-form");
  const leesPronos = () =>
    deelnemers.map((d) => ({
      spelerId: d.spelerId,
      voorspeldThuis: form[`t-${d.spelerId}`].valueAsNumber,
      voorspeldUit: form[`u-${d.spelerId}`].valueAsNumber,
    }));
  const ingevuld = (p) =>
    Number.isFinite(p.voorspeldThuis) && Number.isFinite(p.voorspeldUit);
  const markeerDubbels = () => {
    const pronos = leesPronos().filter(ingevuld);
    let aantal = 0;
    for (const div of form.querySelectorAll(".prono")) {
      const eigen = pronos.find((p) => p.spelerId === div.dataset.speler);
      const dubbel = eigen && vindDubbel(pronos, eigen);
      div.classList.toggle("dubbel", Boolean(dubbel));
      div.querySelector(".dubbel-melding").textContent = dubbel
        ? `zelfde als ${namen[dubbel.spelerId]}!`
        : "";
      if (dubbel) aantal++;
    }
    return aantal;
  };
  form.oninput = markeerDubbels;
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (markeerDubbels() > 0)
      return alert("Twee spelers hebben dezelfde uitslag — dat mag niet. Pas aan.");
    const match = {
      id: store.nieuwId(),
      seizoenId: seizoen.id,
      datum: form.datum.value,
      thuisploeg: form.thuis.value.trim(),
      uitploeg: form.uit.value.trim(),
      inleg: form.inleg.valueAsNumber || 0,
      status: "open",
      echteThuisScore: null,
      echteUitScore: null,
    };
    await store.bewaar("matchen", match);
    for (const p of leesPronos()) {
      await store.bewaar("pronos", {
        id: store.nieuwId(),
        matchId: match.id,
        ...p,
        punten: 0,
        exact: false,
        inlegBetaald: false,
      });
    }
    location.hash = "#matchen";
  };
}

// Open match aanpassen: datum, ploegen en pronostieken. Ook handig als
// iemand alsnog wil meedoen: laat een prono leeg = doet niet mee.
async function renderWijzigMatch(matchId) {
  const match = await store.vind("matchen", matchId);
  if (!match || match.status !== "open") { location.hash = "#matchen"; return; }
  const [seizoen, namen, allePronos] = await Promise.all([
    store.vind("seizoenen", match.seizoenId),
    naamMap(),
    store.alle("pronos"),
  ]);
  const pronos = allePronos.filter((p) => p.matchId === matchId);
  const deelnemers = seizoen.deelnemers.filter((d) => namen[d.spelerId]);
  const bestaande = (spelerId) => pronos.find((p) => p.spelerId === spelerId);
  scherm.innerHTML = `
    <h2>Wijzig match</h2>
    <form id="match-form">
      <input name="datum" type="date" value="${match.datum}" required>
      <div class="ploegen-rij">
        <input name="thuis" placeholder="Thuisploeg" value="${esc(match.thuisploeg)}" required>
        <span class="vs">–</span>
        <input name="uit" placeholder="Uitploeg" value="${esc(match.uitploeg)}" required>
      </div>
      <label class="inleg-regel">Inleg per speler (€)
        <input name="inleg" type="number" min="0" step="0.5" value="${match.inleg ?? 0}"></label>
      <h3>Pronostieken (niemand hetzelfde!)</h3>
      <p class="stil">Laat leeg wie niet meedoet met deze match.</p>
      ${deelnemers
        .map((d) => {
          const p = bestaande(d.spelerId);
          return `
        <div class="prono" data-speler="${d.spelerId}">
          <span>${esc(namen[d.spelerId])}</span>
          <input type="number" min="0" name="t-${d.spelerId}" value="${p ? p.voorspeldThuis : ""}"> –
          <input type="number" min="0" name="u-${d.spelerId}" value="${p ? p.voorspeldUit : ""}">
          <em class="dubbel-melding"></em>
        </div>`;
        })
        .join("")}
      <button>Bewaar wijzigingen</button>
    </form>`;
  const form = scherm.querySelector("#match-form");
  const leesPronos = () =>
    deelnemers.map((d) => ({
      spelerId: d.spelerId,
      voorspeldThuis: form[`t-${d.spelerId}`].valueAsNumber,
      voorspeldUit: form[`u-${d.spelerId}`].valueAsNumber,
    }));
  const ingevuld = (p) =>
    Number.isFinite(p.voorspeldThuis) && Number.isFinite(p.voorspeldUit);
  const markeerDubbels = () => {
    const lijst = leesPronos().filter(ingevuld);
    let aantal = 0;
    for (const div of form.querySelectorAll(".prono")) {
      const eigen = lijst.find((p) => p.spelerId === div.dataset.speler);
      const dubbel = eigen && vindDubbel(lijst, eigen);
      div.classList.toggle("dubbel", Boolean(dubbel));
      div.querySelector(".dubbel-melding").textContent = dubbel
        ? `zelfde als ${namen[dubbel.spelerId]}!`
        : "";
      if (dubbel) aantal++;
    }
    return aantal;
  };
  form.oninput = markeerDubbels;
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (markeerDubbels() > 0)
      return alert("Twee spelers hebben dezelfde uitslag — dat mag niet. Pas aan.");
    const half = leesPronos().find(
      (p) => !ingevuld(p) && (Number.isFinite(p.voorspeldThuis) || Number.isFinite(p.voorspeldUit))
    );
    if (half)
      return alert(`De pronostiek van ${namen[half.spelerId]} is maar half ingevuld.`);
    Object.assign(match, {
      datum: form.datum.value,
      thuisploeg: form.thuis.value.trim(),
      uitploeg: form.uit.value.trim(),
      inleg: form.inleg.valueAsNumber || 0,
    });
    await store.bewaar("matchen", match);
    for (const p of leesPronos()) {
      const oud = bestaande(p.spelerId);
      if (ingevuld(p)) {
        await store.bewaar("pronos", {
          id: oud?.id ?? store.nieuwId(),
          matchId: match.id,
          ...p,
          punten: 0,
          exact: false,
          inlegBetaald: oud?.inlegBetaald ?? false,
        });
      } else if (oud) {
        await store.verwijder("pronos", oud.id);
      }
    }
    location.hash = "#matchen";
  };
}

async function renderMatchen(matchId) {
  if (matchId) return renderUitslag(matchId);
  const seizoen = await actiefSeizoen();
  if (!seizoen) {
    scherm.innerHTML = `<h2>Matchen</h2><p class="stil">Er loopt geen seizoen.</p>
      <a class="knop" href="#seizoenen">Start eerst een seizoen</a>`;
    return;
  }
  const matchen = (await store.alle("matchen"))
    .filter((m) => m.seizoenId === seizoen.id)
    .sort((a, b) => b.datum.localeCompare(a.datum));
  scherm.innerHTML = `
    <h2>Matchen — ${esc(seizoen.naam)}</h2>
    <ul class="lijst">${
      matchen
        .map(
          (m) => `
      <li>
        <span>${m.datum.slice(8, 10)}/${m.datum.slice(5, 7)}<br><strong>${esc(m.thuisploeg)} – ${esc(m.uitploeg)}</strong>
        ${m.status === "afgerond" ? ` <span class="stil">(${m.echteThuisScore}–${m.echteUitScore})</span>` : ""}</span>
        ${m.status === "open"
          ? `<span class="acties"><a class="knop klein" href="#wijzig-match/${m.id}" title="Wijzig match">✏️</a>
             <a class="knop klein" href="#matchen/${m.id}">Uitslag</a></span>`
          : "✅"}
      </li>`
        )
        .join("") || "<li class='stil'>Nog geen matchen.</li>"
    }</ul>
    <a class="knop" href="#nieuwe-match">➕ Nieuwe match</a>`;
}

async function renderUitslag(matchId) {
  const match = await store.vind("matchen", matchId);
  if (!match) { location.hash = "#matchen"; return; }
  const namen = await naamMap();
  const pronos = (await store.alle("pronos")).filter((p) => p.matchId === matchId);
  scherm.innerHTML = `
    <h2>Uitslag — ${esc(match.thuisploeg)} vs ${esc(match.uitploeg)}</h2>
    <p class="stil">${match.datum} · pronostieken: ${pronos
      .map((p) => `${esc(namen[p.spelerId] ?? "?")} ${p.voorspeldThuis}–${p.voorspeldUit}`)
      .join(" · ")}</p>
    <form id="uitslag-form">
      <div class="prono"><span>${esc(match.thuisploeg)}</span>
        <input name="thuis" type="number" min="0" required> –
        <input name="uit" type="number" min="0" required>
        <span>${esc(match.uitploeg)}</span></div>
      <button>Verwerk uitslag</button>
    </form>`;
  scherm.querySelector("#uitslag-form").onsubmit = async (e) => {
    e.preventDefault();
    const inst = await haalInstellingen();
    const uitslag = {
      thuis: e.target.thuis.valueAsNumber,
      uit: e.target.uit.valueAsNumber,
    };
    for (const p of pronos) {
      p.punten = berekenPunten(p, uitslag, inst);
      p.exact = isExact(p, uitslag);
      await store.bewaar("pronos", p);
    }
    Object.assign(match, {
      status: "afgerond",
      echteThuisScore: uitslag.thuis,
      echteUitScore: uitslag.uit,
    });
    await store.bewaar("matchen", match);
    location.hash = "#home";
  };
}
async function renderInstellingen() {
  const inst = await haalInstellingen();
  scherm.innerHTML = `
    <h2>Instellingen</h2>
    <a class="knop" href="#spelers">👥 Spelers beheren</a>
    <a class="knop" href="#seizoenen">📅 Seizoenen</a>
    <a class="knop" href="#statistieken">📊 Statistieken</a>
    <h3>Puntentelling</h3>
    <form id="regels-form">
      <label>Exact juiste uitslag <input name="exact" type="number" min="0" value="${inst.exact}"></label>
      <label>Winnaar juist gekozen <input name="tendens" type="number" min="0" value="${inst.tendens}"></label>
      <button>Bewaar</button>
    </form>
    <h3>Back-up</h3>
    <div class="backup-rij">
      <button id="export" class="klein">⬇️ Bewaar back-up</button>
      <label class="knop klein">⬆️ Zet terug<input id="import" type="file" accept=".json,application/json" hidden></label>
    </div>
    <p class="stil">Alles staat alleen op deze gsm. Bewaar af en toe een
      back-upbestand (stuur het bv. naar jezelf in WhatsApp) — dan ben je
      nooit iets kwijt als de gsm ooit wordt opgeschoond.</p>`;
  scherm.querySelector("#regels-form").onsubmit = async (e) => {
    e.preventDefault();
    await store.bewaar("instellingen", {
      id: "app",
      exact: e.target.exact.valueAsNumber,
      tendens: e.target.tendens.valueAsNumber,
    });
    alert("Bewaard. Geldt voor uitslagen die je vanaf nu invoert.");
  };
  scherm.querySelector("#export").onclick = async () => {
    const dump = await store.exportAlles();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fietsclub-pronostiek-${dump.geexporteerd.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  scherm.querySelector("#import").onchange = async (e) => {
    const bestand = e.target.files[0];
    if (!bestand) return;
    if (!confirm("Dit vervangt ALLE huidige gegevens door de back-up. Doorgaan?")) return;
    try {
      await store.importAlles(JSON.parse(await bestand.text()));
      alert("Back-up teruggezet.");
      location.hash = "#home";
    } catch (fout) {
      alert(`Terugzetten mislukt: ${fout.message}`);
    }
  };
}

window.addEventListener("hashchange", navigeer);
navigeer();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
