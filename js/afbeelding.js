// Tekent de stand als een PNG in de "retro koerstrui"-stijl van de app en
// deelt die afbeelding via de Web Share API (WhatsApp-deelvenster met
// bestand). Browsers zonder bestand-delen vallen terug op de oude
// tekst-link naar wa.me.
import { deelStandTekst } from "./logic.js";

const KLEUR = {
  creme: "#f3eddc",
  papier: "#fbf7ea",
  marine: "#22375a",
  rood: "#be3a2b",
  lichtbruin: "#8c7f60",
  lijn: "#cdbf9c",
};
const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";
const SANS = "'Avenir Next', 'Segoe UI', system-ui, sans-serif";
const CIJFERS = "'Avenir Next Condensed', 'Arial Narrow', 'Segoe UI', sans-serif";

const BREEDTE = 640;
const BAND_HOOGTE = 16;
const KOP_HOOGTE = 96;
const RIJ_HOOGTE = 52;
const VOET_HOOGTE = 70;

function tekenBand(ctx, breedte, bandHoogte) {
  const stroken = [
    [0, 0.42, KLEUR.marine],
    [0.42, 0.5, KLEUR.creme],
    [0.5, 0.79, KLEUR.rood],
    [0.79, 0.86, KLEUR.creme],
    [0.86, 1, KLEUR.marine],
  ];
  for (const [van, tot, kleur] of stroken) {
    ctx.fillStyle = kleur;
    ctx.fillRect(0, bandHoogte * van, breedte, bandHoogte * (tot - van));
  }
}

function stippellijn(ctx, y, breedte) {
  ctx.strokeStyle = KLEUR.lijn;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(24, y);
  ctx.lineTo(breedte - 24, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function tekenStandCanvas(seizoen, klassement, namenById, aantalMatchen, pot) {
  const hoogte =
    BAND_HOOGTE + KOP_HOOGTE + Math.max(klassement.length, 1) * RIJ_HOOGTE + VOET_HOOGTE;
  const schaal = 2; // scherpte op high-dpi schermen
  const canvas = document.createElement("canvas");
  canvas.width = BREEDTE * schaal;
  canvas.height = hoogte * schaal;
  const ctx = canvas.getContext("2d");
  ctx.scale(schaal, schaal);

  ctx.fillStyle = KLEUR.creme;
  ctx.fillRect(0, 0, BREEDTE, hoogte);
  tekenBand(ctx, BREEDTE, BAND_HOOGTE);

  ctx.fillStyle = KLEUR.marine;
  ctx.font = `700 23px ${SERIF}`;
  ctx.textAlign = "left";
  ctx.fillText("🚴 Fits Club Neet Te Snel", 24, BAND_HOOGTE + 38);
  ctx.fillStyle = KLEUR.rood;
  ctx.font = `700 14px ${SANS}`;
  ctx.fillText(
    `${seizoen.naam.toUpperCase()} — NA ${aantalMatchen} MATCH${aantalMatchen === 1 ? "" : "EN"}`,
    24,
    BAND_HOOGTE + 62
  );
  stippellijn(ctx, BAND_HOOGTE + 82, BREEDTE);

  let y = BAND_HOOGTE + KOP_HOOGTE;
  for (const r of klassement) {
    const midY = y + RIJ_HOOGTE / 2;
    const leider = r.plaats === 1;

    ctx.fillStyle = leider ? KLEUR.rood : KLEUR.papier;
    ctx.fillRect(24, midY - 17, 34, 34);
    ctx.lineWidth = 2;
    ctx.strokeStyle = leider ? KLEUR.rood : KLEUR.marine;
    ctx.strokeRect(24, midY - 17, 34, 34);
    ctx.fillStyle = leider ? KLEUR.papier : KLEUR.marine;
    ctx.font = `800 16px ${CIJFERS}`;
    ctx.textAlign = "center";
    ctx.fillText(String(r.plaats), 41, midY + 6);

    ctx.font = `800 20px ${CIJFERS}`;
    const puntenTekst = String(r.punten);
    const puntenBreedte = ctx.measureText(puntenTekst).width;

    if (r.aantalExact > 0) {
      ctx.font = `italic 12px ${SANS}`;
      ctx.fillStyle = KLEUR.lichtbruin;
      ctx.textAlign = "right";
      ctx.fillText(`${r.aantalExact}× exact`, BREEDTE - 24 - puntenBreedte - 10, midY + 5);
    }

    ctx.font = `800 20px ${CIJFERS}`;
    ctx.fillStyle = KLEUR.marine;
    ctx.textAlign = "right";
    ctx.fillText(puntenTekst, BREEDTE - 24, midY + 7);

    ctx.textAlign = "left";
    ctx.fillStyle = KLEUR.marine;
    ctx.font = `600 18px ${SERIF}`;
    ctx.fillText(namenById[r.spelerId] ?? "?", 76, midY + 6);

    stippellijn(ctx, y + RIJ_HOOGTE - 2, BREEDTE);
    y += RIJ_HOOGTE;
  }

  ctx.fillStyle = KLEUR.marine;
  ctx.font = `600 17px ${SERIF}`;
  ctx.textAlign = "left";
  ctx.fillText("💰 In de pot:", 24, y + 34);
  ctx.fillStyle = KLEUR.rood;
  ctx.font = `800 21px ${CIJFERS}`;
  ctx.fillText(`€${pot}`, 148, y + 35);

  return canvas;
}

function canvasNaarBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// Deelt de stand als afbeelding (WhatsApp-deelvenster) en valt terug op de
// oude tekst-link als bestand-delen niet ondersteund wordt of mislukt.
export async function deelStand(seizoen, klassement, namenById, aantalMatchen, pot) {
  try {
    const canvas = tekenStandCanvas(seizoen, klassement, namenById, aantalMatchen, pot);
    const blob = await canvasNaarBlob(canvas);
    if (blob) {
      const bestand = new File([blob], `stand-${seizoen.naam.replace(/\s+/g, "-")}.png`, {
        type: "image/png",
      });
      if (navigator.canShare?.({ files: [bestand] })) {
        await navigator.share({ files: [bestand], title: "Fits Club Neet Te Snel" });
        return;
      }
    }
  } catch (fout) {
    if (fout?.name === "AbortError") return; // gebruiker annuleerde het deelvenster zelf
  }
  const tekst = deelStandTekst(seizoen, klassement, namenById, aantalMatchen, pot);
  window.open(`https://wa.me/?text=${encodeURIComponent(tekst)}`, "_blank");
}
