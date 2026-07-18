// Enige toegangspunt tot opslag. Nu IndexedDB; later kan een
// PocketBase-implementatie hetzelfde contract invullen (zie spec).

const DB_NAAM = "fietsclub-pronostiek";
const DB_VERSIE = 1;
const STORE_NAMEN = ["spelers", "seizoenen", "matchen", "pronos", "instellingen"];

let dbPromise = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAAM, DB_VERSIE);
    req.onupgradeneeded = () => {
      for (const naam of STORE_NAMEN) {
        if (!req.result.objectStoreNames.contains(naam)) {
          req.result.createObjectStore(naam, { keyPath: "id" });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function inTransactie(storeNaam, modus, werk) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeNaam, modus);
        const req = werk(t.objectStore(storeNaam));
        t.oncomplete = () => resolve(req?.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export const store = {
  nieuwId: () => crypto.randomUUID(),
  alle: (naam) => inTransactie(naam, "readonly", (os) => os.getAll()),
  vind: (naam, id) => inTransactie(naam, "readonly", (os) => os.get(id)),
  bewaar: (naam, record) => inTransactie(naam, "readwrite", (os) => os.put(record)),
  verwijder: (naam, id) => inTransactie(naam, "readwrite", (os) => os.delete(id)),

  async exportAlles() {
    const data = {};
    for (const naam of STORE_NAMEN) data[naam] = await this.alle(naam);
    return {
      app: "fietsclub-pronostiek",
      versie: 1,
      geexporteerd: new Date().toISOString(),
      data,
    };
  },

  async importAlles(dump) {
    if (dump?.app !== "fietsclub-pronostiek" || !dump.data) {
      throw new Error("Geen geldig back-upbestand van deze app.");
    }
    for (const naam of STORE_NAMEN) {
      await inTransactie(naam, "readwrite", (os) => os.clear());
      for (const record of dump.data[naam] ?? []) {
        await this.bewaar(naam, record);
      }
    }
  },
};
