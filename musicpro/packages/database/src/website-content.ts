export const WEBSITE_HUB_SETTING_KEY = "website_hub_content";

export type WebsiteLink = {
  label: string;
  href: string;
};

export type WebsiteAppItem = {
  name: string;
  text: string;
  href: string;
  cta: string;
};

export type WebsiteSocialItem = {
  name: string;
  handle: string;
  href: string;
};

export type WebsiteHubContent = {
  seo: { title: string; description: string };
  nav: {
    brand: string;
    scuola: string;
    sale: string;
    eventi: string;
    app: string;
    rewavier: string;
    contatti: string;
    iscriviti: string;
    iscrivitiHref: string;
  };
  hero: {
    kicker: string;
    title: string;
    lede: string;
    cta1: WebsiteLink;
    cta2: WebsiteLink;
  };
  scuola: {
    kicker: string;
    title: string;
    p1: string;
    p2: string;
    cta1: WebsiteLink;
    cta2: WebsiteLink;
    listTitle: string;
    instruments: string[];
  };
  propedeutica: {
    kicker: string;
    title: string;
    quote: string;
    p1: string;
    p2: string;
    cta: string;
    image: string;
    imageAlt: string;
  };
  sale: {
    kicker: string;
    title: string;
    p1: string;
    p2: string;
    cta1: WebsiteLink;
    cta2: WebsiteLink;
    listTitle: string;
    bullets: string[];
    image: string;
    imageAlt: string;
  };
  apps: {
    kicker: string;
    title: string;
    lede: string;
    items: WebsiteAppItem[];
  };
  rewavier: {
    kicker: string;
    title: string;
    p1: string;
    p2: string;
    p3: string;
    cta: WebsiteLink;
  };
  cervellone: {
    kicker: string;
    title: string;
    p1: string;
    p2: string;
    image: string;
    imageAlt: string;
    cta1: WebsiteLink;
    cta2: WebsiteLink;
    cta3: WebsiteLink;
  };
  chi: {
    kicker: string;
    title: string;
    p1: string;
    image: string;
    imageAlt: string;
  };
  reviews: {
    kicker: string;
    title: string;
    lede: string;
    items: string[];
    cta1: WebsiteLink;
    cta2: WebsiteLink;
  };
  socials: {
    kicker: string;
    title: string;
    lede: string;
    items: WebsiteSocialItem[];
  };
  sede: {
    kicker: string;
    title: string;
    lede: string;
    legal: string;
    address: string;
    email: string;
    phone: string;
    phoneHref: string;
    cta1: WebsiteLink;
    mapsGoogle: WebsiteLink;
    mapsApple: WebsiteLink;
    image1: string;
    image2: string;
    image1Alt: string;
    image2Alt: string;
  };
  contact: {
    kicker: string;
    submit: string;
    name: string;
    email: string;
    subject: string;
    body: string;
  };
  footer: {
    legal: string;
    shopLabel: string;
    shopHref: string;
    privacyLabel: string;
    privacyHref: string;
  };
  pages: {
    kids: {
      seoTitle: string;
      seoDescription: string;
      kicker: string;
      title: string;
      subtitle: string;
      quote: string;
      p1: string;
      p2: string;
      activitiesTitle: string;
      activities: string[];
      cta: string;
    };
    canto: {
      seoTitle: string;
      seoDescription: string;
      kicker: string;
      title: string;
      p1: string;
      p2: string;
      cta1: WebsiteLink;
      cta2: WebsiteLink;
    };
    prenota: {
      seoTitle: string;
      seoDescription: string;
      kicker: string;
      title: string;
      lede: string;
      q1: string;
      a1: string;
      q2: string;
      a2: string;
      q3: string;
      a3: string;
      cta1: WebsiteLink;
      cta2: WebsiteLink;
    };
  };
};

export const DEFAULT_WEBSITE_HUB_CONTENT: WebsiteHubContent = {
  seo: {
    title: "MusicPro — scuola di musica e sale prove a Carasco",
    description:
      "Associazione Culturale MusicPro a Carasco: scuola di musica, sale prove, studio di registrazione e serate. Ora anche con app dedicate.",
  },
  nav: {
    brand: "MusicPro",
    scuola: "Scuola",
    sale: "Sale",
    eventi: "Eventi",
    app: "App",
    rewavier: "ReWavier",
    contatti: "Contatti",
    iscriviti: "Iscriviti",
    iscrivitiHref: "https://iscrizione.musicproeventi.it",
  },
  hero: {
    kicker: "Associazione Culturale · Carasco (GE)",
    title: "Scuola di musica\ne sale prove.",
    lede: "Corsi per tutti i livelli, tre sale allestite e lo studio. Le serate ci sono. Da quest’anno scuola, prenotazioni e eventi hanno anche un’app: più sotto ti diciamo quale aprire, e perché.",
    cta1: { label: "La scuola", href: "#scuola" },
    cta2: { label: "Le sale", href: "#sale" },
  },
  scuola: {
    kicker: "Corsi di musica per tutti",
    title: "Hai sempre sognato di imparare a suonare o cantare?",
    p1: "La scuola è per tutti i livelli. I docenti costruiscono un percorso adatto a te, alla tua personalità e alle tue ambizioni. Tra associati e allievi ci sono bambini, adulti, pensionati, ragazzi, dilettanti e professionisti.",
    p2: "Il primo passo è semplice: passa in sede, chiedi i corsi e iscriviti. Oppure apri il modulo da qui.",
    cta1: { label: "Iscriviti alla scuola", href: "https://iscrizione.musicproeventi.it" },
    cta2: { label: "Apri MusicPro School", href: "https://school.musicproeventi.it" },
    listTitle: "Strumenti",
    instruments: [
      "Canto",
      "Batteria",
      "Basso",
      "Chitarra",
      "Piano e tastiere elettroniche",
      "Propedeutica musicale, dai 2 ai 6 anni",
    ],
  },
  propedeutica: {
    kicker: "Per i più piccoli",
    title: "Propedeutica musicale",
    quote: "«La musica è un gioco da bambini.» — François Delalande",
    p1: "Imparare ad ascoltare e ascoltarsi attraverso i giochi musicali. La musica è, innanzitutto, un’esperienza: il bambino si esprime con corpo, voce e ritmo, e si abitua all’ascolto di sé e dei suoni intorno.",
    p2: "Stimolazione sonora, gesto, movimento, danza, vocalità, drammatizzazione e segno grafico. Si sviluppano senso ritmico, orecchio melodico e intonazione, insieme ad attenzione, coordinazione e creatività.",
    cta: "Chiedi una prova",
    image: "img/propedeutica.png",
    imageAlt: "Propedeutica musicale a MusicPro",
  },
  sale: {
    kicker: "Sale prova",
    title: "Hai una band? Tre sale, allestite per davvero.",
    p1: "Le sale devono essere pulite, comode, funzionanti e… belle. Prenoti dallo slot libero. Puoi anche acquistare crediti a un prezzo più vantaggioso.",
    p2: "C’è anche il recording studio: multitraccia, più sale in contemporanea.",
    cta1: { label: "Prenota una sala", href: "https://prenotazioni.musicproeventi.it" },
    cta2: { label: "Shop crediti", href: "https://www.shop.musicproeventi.it/" },
    listTitle: "Agli associati",
    bullets: [
      "Tre sale prova completamente attrezzate",
      "Studio di registrazione multitraccia",
      "Crediti spendibili in prenotazione",
      "Annulli o sposti sopra le 24 ore",
    ],
    image: "img/sale.jpg",
    imageAlt: "Le tre sale prova MusicPro",
  },
  apps: {
    kicker: "Novità",
    title: "Ora scuola, sale e serate hanno un’app.",
    lede: "Non è un altro MusicPro. È lo stesso lavoro, ciascuno su un indirizzo suo: prenoti la sala, entri in area riservata, vedi le prossime serate. Prima si veniva in sede o si scriveva. Adesso puoi farlo dal telefono. ReWavier è un’altra cosa: la trovi sotto.",
    items: [
      {
        name: "MusicPro Prenotazioni",
        text: "Sala prove, crediti e quota associativa. Tocchi lo slot, la sala è tua.",
        href: "https://prenotazioni.musicproeventi.it",
        cta: "Apri Prenotazioni",
      },
      {
        name: "MusicPro School",
        text: "Lezioni, presenze e area riservata. Per associati e docenti.",
        href: "https://school.musicproeventi.it",
        cta: "Apri School",
      },
      {
        name: "MusicPro Eventi",
        text: "Serate, squadre e posto al tavolo. Il Cervellone e gli altri format.",
        href: "https://eventi.musicproeventi.it",
        cta: "Apri Eventi",
      },
    ],
  },
  rewavier: {
    kicker: "Fuori dall’associazione",
    title: "ReWavier. La prima app che non è nata per la sede.",
    p1: "Prenotazioni, School e Eventi servono chi entra in MusicPro: sale, lezioni, serate. ReWavier è la prima volta che costruiamo uno strumento per chi suona e ascolta, anche se non è associato.",
    p2: "Non è un social e non è un programma da studio. È un taccuino attaccato alla linea del tempo della canzone. Ascolti, tocchi +, la traccia si ferma. Scrivi l’errore, l’accordo, la nota per lo studente. Il segnalino resta sull’onda, con l’orario esatto.",
    p3: "I nostri docenti la usano già in lezione. È nata lì: per segnare un passaggio senza perdere il punto. Ora la apri anche tu, in sala o a casa.",
    cta: { label: "Scopri ReWavier", href: "https://eventi.musicproeventi.it/ReWavier/" },
  },
  cervellone: {
    kicker: "Il Cervellone",
    title: "MusicPro è agenzia di zona del Cervellone.",
    p1: "È un format di intrattenimento sulla scia dei quiz televisivi. Si gioca nei locali affiliati e lo conducono i nostri animatori. La serata più vicina la trovi su Instagram, Facebook o nell’app Eventi.",
    p2: "Va bene per feste private, matrimoni, compleanni, baby shower, team building, fiere, piazze, enti, associazioni, hotel, villaggi e campeggi. Il gioco si personalizza: grandi e piccoli.",
    image: "img/cervellone.jpg",
    imageAlt: "Il Cervellone Genova",
    cta1: { label: "Vedi le serate", href: "https://eventi.musicproeventi.it" },
    cta2: { label: "Instagram Cervellone", href: "https://www.instagram.com/ilcervellonegenova/" },
    cta3: { label: "Facebook Cervellone", href: "https://www.facebook.com/ilcervelloneagenova" },
  },
  chi: {
    kicker: "Chi siamo",
    title: "Esistiamo per condividere la musica.",
    p1: "Siamo un’associazione: creiamo spazi ed eventi, accresciamo e diffondiamo la cultura musicale. Concerti, manifestazioni, festival, seminari. Cinque ambienti a Carasco, di cui tre sale prova e lo studio.",
    image: "img/vintage.jpg",
    imageAlt: "Sala e strumenti MusicPro",
  },
  reviews: {
    kicker: "Chi è già passato",
    title: "4,7 su Google.",
    lede: "Quattordici recensioni. Sale, scuola e studio, dalle voci di chi le usa.",
    items: [
      "«Una delle migliori salette della zona, strumentazione professionale e vintage. Personale eccezionale. Registrazioni multitraccia di qualità discografica.»",
      "«Fantastica sala prove attrezzatissima, materiali di alta qualità, personale gentilissimo. La migliore della zona.»",
      "«Ottima scuola di musica.»",
    ],
    cta1: {
      label: "Leggi su Google",
      href: "https://search.google.com/local/reviews?placeid=ChIJvT5fAfp5MhMRfkQ3cIwerI4",
    },
    cta2: {
      label: "Lascia una recensione",
      href: "https://search.google.com/local/writereview?placeid=ChIJvT5fAfp5MhMRfkQ3cIwerI4",
    },
  },
  socials: {
    kicker: "I canali",
    title: "Quello che succede, lo vedi qui.",
    lede: "Concerti, lezioni, serate e vita di sala. Stessi tre posti, ogni settimana.",
    items: [
      { name: "Instagram", handle: "@musicproeventi", href: "https://www.instagram.com/musicproeventi/" },
      { name: "Facebook", handle: "MusicPro Eventi", href: "https://www.facebook.com/musicproeventi" },
      { name: "YouTube", handle: "MusicPro", href: "https://www.youtube.com/channel/UCJ6ubmJot2vGjyU9hA56BGw" },
    ],
  },
  sede: {
    kicker: "Dove siamo",
    title: "Zona Loreto 42,\nCarasco.",
    lede: "Cinque ambienti, tre sale prove, studio di registrazione e la scuola.",
    legal: "Associazione Culturale M.P. – Il Cervellone Genova",
    address: "Zona Loreto 42, 16042 Carasco (GE)",
    email: "info@musicproeventi.it",
    phone: "328 215 7015",
    phoneHref: "tel:+393282157015",
    cta1: { label: "Diventa associato", href: "https://iscrizione.musicproeventi.it" },
    mapsGoogle: { label: "Google Maps", href: "https://goo.gl/maps/2M1eB8atjzWH8yNb9" },
    mapsApple: {
      label: "Apple Mappe",
      href: "https://maps.apple.com/?address=Via%20Loreto%2042,%2016042%20Carasco%20GE,%20Italia&ll=44.358669,9.342145&q=Associazione%20Culturale%20MusicPro",
    },
    image1: "img/sede-1.jpg",
    image2: "img/sede-2.jpg",
    image1Alt: "Ingresso e ambienti MusicPro",
    image2Alt: "Sala e strumenti in sede MusicPro",
  },
  contact: {
    kicker: "Contattaci",
    submit: "Invia",
    name: "Nome",
    email: "Email",
    subject: "Oggetto",
    body: "Messaggio",
  },
  footer: {
    legal: "Associazione Culturale M.P. – Il Cervellone Genova · P.IVA 02535720995",
    shopLabel: "Shop",
    shopHref: "https://www.shop.musicproeventi.it/",
    privacyLabel: "Privacy",
    privacyHref: "privacy.html",
  },
  pages: {
    kids: {
      seoTitle: "Propedeutica musicale — MusicPro",
      seoDescription:
        "Propedeutica musicale a Carasco per bambini fino ai 6 anni: ascolto, voce, ritmo e gioco.",
      kicker: "Per i più piccoli",
      title: "Propedeutica musicale",
      subtitle: "Per bambini fino ai 6 anni",
      quote: "«La musica è un gioco da bambini.» — François Delalande",
      p1: "Imparare ad ascoltare e ascoltarsi attraverso i giochi musicali. La musica è, innanzitutto, un’esperienza: il bambino si esprime con corpo, voce e ritmo, e si abitua all’ascolto di sé e dei suoni intorno.",
      p2: "Attraverso l’integrazione di vari linguaggi espressivi (stimolazione sonora, gesto, movimento, danza, vocalità, drammatizzazione, espressione grafico-pittorica) si sviluppa il senso ritmico, l’orecchio melodico e l’intonazione, insieme ad attenzione, coordinazione e creatività.",
      activitiesTitle: "Attività",
      activities: [
        "Educazione all’ascolto: esplorazione dei suoni intorno e degli strumenti, attenzione uditiva, riconoscimento timbrico, percezione melodica.",
        "Vocalità: voce, respirazione e intonazione, giochi cantati, canzoni semplici.",
        "Strumentario ritmico-melodico: percussioni, sequenze imitatorie, partiture informali (strumentario Orff).",
        "Applicazione creativa: songwriting in forma elementare, disegno con ascolto di brani.",
        "Applicazione tattile agli strumenti: conoscenza, esplorazione, riconoscimento.",
        "Alfabetizzazione musicale: primi elementi del codice, suoni della scala e pentagramma.",
      ],
      cta: "Chiedi una prova",
    },
    canto: {
      seoTitle: "Canto — MusicPro",
      seoDescription: "Corso di canto a Carasco, per tutti i livelli. Scuola di musica MusicPro.",
      kicker: "Scuola di musica",
      title: "Canto",
      p1: "Il canto è uno dei corsi della scuola. Il percorso si costruisce sul livello, sulla voce e su quello che vuoi fare: da chi inizia a chi canta già.",
      p2: "Il primo passo è lo stesso degli altri strumenti: iscriviti, oppure scrivici per una prova in sede.",
      cta1: { label: "Iscriviti", href: "https://iscrizione.musicproeventi.it" },
      cta2: { label: "Chiedi una prova", href: "index.html#scrivi" },
    },
    prenota: {
      seoTitle: "Come si prenota una sala — MusicPro",
      seoDescription: "Come prenotare le sale prove MusicPro: app Prenotazioni, crediti e annulli.",
      kicker: "Sale prova",
      title: "Come si prenota?",
      lede: "Le regole delle sale, in tre risposte. Prenoti dall’app Prenotazioni.",
      q1: "Come si prenota?",
      a1: "Dall’app Prenotazioni. Devi essere iscritto all’associazione e in regola con la quota dell’anno. La quota la versi nella stessa app.",
      q2: "Posso acquistare pacchetti di ore?",
      a2: "No. Si acquistano crediti nello shop di Prenotazioni. Ogni credito vale 1 €. Più crediti prendi, meno li paghi.",
      q3: "Posso annullare una prenotazione?",
      a3: "Sì, in Prenotazioni puoi annullarla o spostarla se sei sopra le 24 ore dallo slot. Sotto le 24 ore non si modifica.",
      cta1: { label: "Apri Prenotazioni", href: "https://prenotazioni.musicproeventi.it" },
      cta2: { label: "Shop crediti", href: "https://www.shop.musicproeventi.it/" },
    },
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeDeep<T>(base: T, patch: unknown): T {
  if (!isObject(base)) {
    return (patch === undefined || patch === null ? base : patch) as T;
  }
  if (!isObject(patch)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = (base as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      out[key] = value;
    } else if (isObject(current) && isObject(value)) {
      out[key] = mergeDeep(current, value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

export function parseWebsiteHubContent(raw: string | null | undefined): WebsiteHubContent {
  if (!raw || !raw.trim() || raw.trim() === "{}") {
    return structuredClone(DEFAULT_WEBSITE_HUB_CONTENT);
  }
  try {
    return mergeDeep(structuredClone(DEFAULT_WEBSITE_HUB_CONTENT), JSON.parse(raw) as unknown);
  } catch {
    return structuredClone(DEFAULT_WEBSITE_HUB_CONTENT);
  }
}
