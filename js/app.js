import {
  STANDAARD_REGELS,
  berekenPunten,
  isExact,
  vindDubbel,
  maakKlassement,
  potBedrag,
  deelStandTekst,
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
    (await store.vind("instellingen", "app")) ?? {
      id: "app",
      ...STANDAARD_REGELS,
      standaardInleg: 5,
    }
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

const routes = {
  home: renderHome,
  spelers: renderSpelers,
  seizoenen: renderSeizoenen,
  "nieuwe-match": renderNieuweMatch,
  matchen: renderMatchen,
  instellingen: renderInstellingen,
};

async function navigeer() {
  const [route, arg] = location.hash.replace(/^#/, "").split("/");
  const render = routes[route] ?? renderHome;
  try {
    await render(arg);
  } catch (fout) {
    scherm.innerHTML = `<p>Er ging iets mis: ${esc(fout.message)}</p>`;
  }
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
  const { pronos, aantalMatchen } = await seizoenPronos(seizoen.id);
  const klassement = maakKlassement(
    seizoen.deelnemers.map((d) => d.spelerId),
    pronos
  );
  scherm.innerHTML = `
    <h2>${esc(seizoen.naam)} <span class="stil">· ${aantalMatchen} match${aantalMatchen === 1 ? "" : "en"}</span></h2>
    <div class="klassement">
      ${klassement
        .map(
          (r) => `<div class="rij ${r.plaats === 1 ? "een" : ""}">
                  <span class="rug">${r.plaats}</span>
                  <b>${esc(namen[r.spelerId] ?? "?")}</b>
                  ${r.aantalExact > 0 ? `<span class="ex">${r.aantalExact}× exact</span>` : ""}
                  <span class="ptn">${r.punten}</span></div>`
        )
        .join("")}
    </div>
    <p class="pot">💰 In de pot: <strong>€${potBedrag(seizoen)}</strong></p>
    <fieldset><legend>Inleg betaald?</legend>
      ${seizoen.deelnemers
        .map(
          (d, i) =>
            `<label><input type="checkbox" data-i="${i}" ${d.betaald ? "checked" : ""}>
             ${esc(namen[d.spelerId] ?? "?")}</label>`
        )
        .join("")}
    </fieldset>
    <a class="knop" href="#nieuwe-match">➕ Nieuwe match</a>
    <button id="deel">📤 Deel met de groep</button>`;
  scherm.querySelectorAll("fieldset input").forEach(
    (vak) =>
      (vak.onchange = async () => {
        seizoen.deelnemers[vak.dataset.i].betaald = vak.checked;
        await store.bewaar("seizoenen", seizoen);
      })
  );
  scherm.querySelector("#deel").onclick = () => {
    const tekst = deelStandTekst(seizoen, klassement, namen, aantalMatchen);
    window.open(`https://wa.me/?text=${encodeURIComponent(tekst)}`, "_blank");
  };
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
        <button class="klein" data-id="${s.id}">${s.actief ? "Zet inactief" : "Zet actief"}</button>
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
        speler.actief = !speler.actief;
        await store.bewaar("spelers", speler);
        renderSpelers();
      })
  );
}
async function renderSeizoenen() {
  const [seizoenen, spelers, inst, namen] = await Promise.all([
    store.alle("seizoenen"),
    store.alle("spelers"),
    haalInstellingen(),
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
             ${actief.deelnemers.length} deelnemers, inleg €${actief.inleg} p.p.).</p>
           <button id="sluit-af" class="gevaar">🏁 Seizoen afsluiten</button>`
        : `<form id="nieuw-seizoen">
             <input name="naam" placeholder="Naam (bv. Najaar 2026)" required>
             <label>Inleg p.p. (€) <input name="inleg" type="number" min="0" step="0.5" value="${inst.standaardInleg}"></label>
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
    <h3>Historie</h3>
    <ul class="lijst">${
      historie
        .map(
          (s) =>
            `<li><span>${esc(s.naam)}</span>
             <span>🏆 ${esc(namen[s.winnaarSpelerId] ?? "—")} · €${s.potUitbetaald}</span></li>`
        )
        .join("") || "<li class='stil'>Nog geen afgesloten seizoenen.</li>"
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
        inleg: form.inleg.valueAsNumber || 0,
        deelnemers: gekozen.map((c) => ({ spelerId: c.value, betaald: false })),
        winnaarSpelerId: null,
        potUitbetaald: null,
      });
      location.hash = "#home";
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
      const pot = potBedrag(actief);
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
  const namen = await naamMap();
  const deelnemers = seizoen.deelnemers.filter((d) => namen[d.spelerId]);
  scherm.innerHTML = `
    <h2>Nieuwe match</h2>
    <form id="match-form">
      <input name="datum" type="date" value="${new Date().toISOString().slice(0, 10)}" required>
      <input name="thuis" placeholder="Thuisploeg" required>
      <input name="uit" placeholder="Uitploeg" required>
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
      });
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
        <span>${m.datum}<br><strong>${esc(m.thuisploeg)} – ${esc(m.uitploeg)}</strong>
        ${m.status === "afgerond" ? ` <span class="stil">(${m.echteThuisScore}–${m.echteUitScore})</span>` : ""}</span>
        ${m.status === "open" ? `<a class="knop klein" style="width:auto" href="#matchen/${m.id}">Uitslag</a>` : "✅"}
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
    <h3>Puntentelling</h3>
    <form id="regels-form">
      <label>Exact juist <input name="exact" type="number" min="0" value="${inst.exact}"></label>
      <label>Juiste winnaar/gelijk <input name="tendens" type="number" min="0" value="${inst.tendens}"></label>
      <label>Standaard inleg (€) <input name="standaardInleg" type="number" min="0" step="0.5" value="${inst.standaardInleg}"></label>
      <button>Bewaar</button>
    </form>`;
  scherm.querySelector("#regels-form").onsubmit = async (e) => {
    e.preventDefault();
    await store.bewaar("instellingen", {
      id: "app",
      exact: e.target.exact.valueAsNumber,
      tendens: e.target.tendens.valueAsNumber,
      standaardInleg: e.target.standaardInleg.valueAsNumber,
    });
    alert("Bewaard. Geldt voor uitslagen die je vanaf nu invoert.");
  };
}

window.addEventListener("hashchange", navigeer);
navigeer();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
