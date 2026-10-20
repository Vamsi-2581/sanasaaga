# 🌿 Sanakuutio - Suomenkielinen Wordle

**Sanakuutio** on moderni, selaimessa toimiva suomenkielinen Wordle-sanapeli, joka on paketoitu kevyeksi Podman-kontiksi.

Pelissä arvaat 4–8-kirjaimisia suomen kielen sanoja niiden perusmuodossa (substantiiveja, adjektiiveja tai verbejä).

---

## ✨ Ominaisuudet

- **Sanan pituus**: Valitse vapaasti sanan pituus väliltä **4–8 kirjainta** (oletus 5, klassinen Wordle).
- **Sanaluokat**: Rajaa kätketyt sanat sanaluokan mukaan (**Kaikki**, **Substantiivit**, **Adjektiivit** tai **Verbit**).
- **Päivän sana & Vapaa peli**:
  - **Päivän sana**: Päivämäärään perustuva haaste (sama sana kaikille pelaajille kunakin päivänä).
  - **Vapaa peli**: Pelaa rajattomasti satunnaisilla sanoilla.
- **Laadukas sanasto**:
  - Kätketyt sanat ovat suomen kielen perusmuotoisia substantiiveja, adjektiiveja ja verbejä.
  - Hyväksytyt arvaukset kattavat yli **25 000 suomenkielistä sanaa**, joten lailliset sanat eivät jää tunnistamatta.
  - Lähteinä Kotimaisten kielten keskuksen ([Kotus](https://kaino.kotus.fi/sanat/nykysuomi/)) Nykysuomen sanalista sekä Voikon [Joukahainen](https://joukahainen.puimula.org/)-morfologiamalli.
- **Kielitoimiston sanakirja -integraatio**: Kierroksen päätyttyä voit yhdellä klikkauksella avata sanan virallisen määritelmän Kotuksen Kielitoimiston sanakirjasta.
- **Täysi suomalainen näppäimistö**: Ruudulla on virtuaalinen näppäimistö (sis. **Å**, **Ä** ja **Ö**), ja peli tukee suoraa kirjoittamista fyysisellä näppäimistöllä.
- **Tilastot & Jakaminen**:
  - Voittoprosentit, voittoputket ja arvausjakauma tallentuvat selaimeen (`localStorage`).
  - Wordle-tyylinen emoji-tuloksen jako leikepöydälle (🟩🟨⬛).
- **Ulkoasu & Saavutettavuus**:
  - Tumma ja vaalea teema.
  - Korkean kontrastin tila (oranssi ja sininen värisokeille).
  - Valinnainen sanaluokkavihje.
  - Synteettiset ääniefektit Web Audio API:lla (ei ulkoisia äänitiedostoja).

---

## 🚀 Käynnistys Podmanilla

### Vaihtoehto A: Käynnistysskriptillä (helpoin)

```bash
./run.sh
```

Skripti rakentaa kontin (jos sitä ei vielä ole) ja käynnistää sen taustalle. Peli avautuu osoitteessa:
👉 **[http://localhost:8000](http://localhost:8000)** (tai `http://127.0.0.1:8000`)

Voit määrittää haluamasi portin ympäristömuuttujalla:
```bash
PORT=8080 ./run.sh
```

### Vaihtoehto B: Podman-komennoilla suoraan

1. Rakenna kontti:
   ```bash
   podman build -t sanakuutio:latest .
   ```

2. Käynnistä kontti:
   ```bash
   podman run -d --name sanakuutio -p 8000:8000 sanakuutio:latest
   ```

3. Avaa selaimessa:
   ```
   http://localhost:8000
   ```

### Vaihtoehto C: Podman Compose / Docker Compose

```bash
podman-compose up -d
# tai
docker compose up -d
```

---

## 🛠 Hallintakomennot

- **Katso kontin lokit:**
  ```bash
  podman logs -f sanakuutio
  ```

- **Pysäytä kontti:**
  ```bash
  podman stop sanakuutio
  ```

- **Käynnistä uudelleen:**
  ```bash
  podman restart sanakuutio
  ```

---

## 📂 Projektirakenne

```
sanakuutio/
├── app.py                  # FastAPI-taustapalvelin ja pelilogiikka
├── Containerfile           # Podman-konttimäärittely
├── Dockerfile              # Docker-yhteensopiva konttimäärittely
├── docker-compose.yml      # Podman/Docker Compose -määrittely
├── requirements.txt        # Python-riippuvuudet (FastAPI, Uvicorn, Pydantic)
├── run.sh                  # Yhden komennon käynnistysskripti
├── data/
│   └── words.json          # Jäsennelty ja luokiteltu suomen sanasto (4–8 kirj.)
├── scripts/
│   └── prepare_words.py    # Skripti sanaston noutoon ja luokitteluun
└── web/
    ├── templates/
    │   └── index.html      # Saavutettava HTML5-käyttöliittymä
    └── static/
        ├── css/
        │   └── style.css   # Responsiivinen ulkoasu, animaatiot ja teemat
        └── js/
            └── app.js      # Pelimoottori, virtuaalinäppäimistö ja tilastot
```

---

## 📚 Sanaston päivitys

Jos haluat päivittää tai generoida sanaston uudelleen verkosta:

```bash
python3 scripts/prepare_words.py
```

Skripti hakee automaattisesti:
1. Kotuksen nykysuomen sanalistan XML- ja tekstiversion
2. Voikon Joukahainen-tietokannan tarkat sanaluokkatiedot (substantiivit, adjektiivit, verbit)
3. Suomen kielen 50k sanan frekvenssitilaston
ja tuottaa optimoidun `data/words.json`-tiedoston.
