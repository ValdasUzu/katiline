# Katilinė – telefono programėlė

Statinė svetainė (PWA): telefone įsidedama į pradžios ekraną kaip programėlė. Ji jungiasi prie debesų MQTT brokerio (EMQX Cloud Serverless) per šifruotą WebSocket ir rodo tą patį, ką ESP web puslapis:
- būseną;
- 14 nustatymų;
- „Heat Now“ mygtuką.

Serverio nereikia – svetainė laikoma GitHub Pages, o duomenys eina per brokerį.

## 1. EMQX Cloud (vieną kartą)

1. [cloud-intl.emqx.com](https://cloud-intl.emqx.com) sukurkite projektą ir jame **EMQX Broker → Serverless**:
   - regionas – pvz. Frankfurt;
   - **Spend Limit 0 $** – viršijus nemokamą kvotą ryšys sustabdomas, mokesčių nėra.
2. **Overview** skiltyje rasite adresą, pvz. `xxxxxxxx.ala.eu-central-1.emqxsl.com`:
   - **8883** – MQTT su TLS, jį naudoja ESP;
   - **8084** – WebSocket su TLS, jį naudoja programėlė.
3. **Access Control → Authentication:** sukurkite du vartotojus:
   - vieną ESP (pvz. `Katiline_esp`);
   - vieną telefonui (pvz. `Katiline_phone`).

   Vardai skiria didžiąsias ir mažąsias raides.
4. ESP puslapyje **MQTT nustatymai → Brokeris 2** įveskite:
   - adresas – be prievado;
   - prievadas – **8883**;
   - **TLS** – įjungtas;
   - ESP vartotojas ir slaptažodis;
   - Home Assistant Discovery – išjungtas.

**Nemokama kvota per mėnesį:** 1 mln. ryšio minučių (vienas nuolat prijungtas ESP – ~43 tūkst.) ir 1 GB duomenų (viena katilinė – ~30–50 MB).

**Keli klientai viename diegime:** **Access Control → Authorization** kiekvienam kliento vartotojui leiskite tik jo temas (`katiline/katiline-xxxx/#`). Kitaip klientai matytų vieni kitų katilines. Kitas variantas – atskiras diegimas kiekvienam klientui.

## 2. GitHub Pages (vieną kartą)

1. [github.com](https://github.com) sukurkite **viešą** saugyklą, pvz. `katiline`.
2. Įkelkite šio aplanko failus. Tai galima padaryti per **Add file → Upload files** arba su git:
   - `index.html`, `app.js`, `sw.js`, `manifest.webmanifest`;
   - `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`.
3. **Settings → Pages → Build and deployment:** Source *Deploy from a branch*, šaka `main`, aplankas `/ (root)` → **Save**.
4. Po minutės svetainė veiks adresu `https://<vartotojas>.github.io/katiline/`.

Atnaujinant programėlę, užtenka įkelti pakeistus failus. Telefonuose nauja versija atsiras kitą kartą atidarius.

## 3. Nuoroda klientui

```
https://<vartotojas>.github.io/katiline/?h=xxxxxxxx.ala.eu-central-1.emqxsl.com&d=katiline-xxxx
```

- `h` – brokerio adresas;
- `d` – įrenginio pavadinimas (ESP puslapyje, „Įrenginys → Pavadinimas“, be `.local`);
- `w` – WebSocket prievadas, jei ne 8084;
- `p` – temų pradžia, jei ne `katiline`.

Klientas įveda tik vartotoją ir slaptažodį. Įsidėti į pradžios ekraną:
- Android Chrome: **⋮ → Įdiegti programą / Pridėti prie pradžios ekrano**;
- iPhone Safari: **Bendrinti → Į pradžios ekraną**.

Su „Prisiminti šiame telefone“ slaptažodis saugomas telefono naršyklėje. „Atsijungti“ jį ištrina.

## Pastabos

- Nustatymų ribas programėlė gauna iš ESP (`.../meta`). Už ribų esančių reikšmių neleidžia išsiųsti, o ESP ir STM jas tikrina dar kartą.
- ESP tą patį nustatymą iš MQTT į STM perduoda ne dažniau kaip kas 60 s. Todėl pakartotinis pakeitimas gali atsinaujinti per minutę.
- `mqtt.js` (5.10.1) įkeliamas iš jsDelivr CDN; telefone jis išsaugomas kartu su programėle.
